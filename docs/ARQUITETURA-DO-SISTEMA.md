# Arquitetura do Sistema

> Documento gerado por análise estática do código-fonte em `src/`, `prisma/` e arquivos de infraestrutura (Docker, package.json). Faz parte da base oficial de referência para desenvolvimento no modelo Spec Driven Development. Toda inferência não confirmada diretamente pelo código está marcada como **"Hipótese"**.

## 1. Visão Arquitetural do Projeto

O sistema é uma **API RESTful monolítica modular**, escrita em Node.js (CommonJS) com Express 5, organizada por **módulos de domínio** (`src/modules/*`). Cada módulo agrupa suas próprias camadas (rotas, controller, service, e opcionalmente repository/validators), seguindo um estilo próximo de **arquitetura em camadas (layered) por feature**, e não uma arquitetura hexagonal/DDD estrita (não há entidades de domínio ricas, casos de uso isolados ou portas/adaptadores explícitos).

Persistência relacional via **Prisma ORM** sobre **PostgreSQL** (schema único em `prisma/schema.prisma`, adapter `@prisma/adapter-pg`). Estado efêmero/cache via **Redis** (carrinho de compras, cache de listagem de produtos, refresh tokens). Não há fila de mensageria, broker de eventos ou serviços externos de pagamento realmente integrados — eventos de domínio (`order.created`, `order.paid`) são **simulados via log** (`logger.info`), não publicados em nenhum barramento.

O processo é único (`src/server.js`), sem separação de workers, filas assíncronas ou serviços independentes — trata-se de um monólito único empacotado em um container Docker (`Dockerfile`), orquestrado localmente junto com Postgres e Redis via `docker-compose.yml`.

## 2. Padrões Utilizados

- **Router → Controller → Service → Repository** (parcial): a maioria dos módulos (`categories`, `orders`, `payments`, `products`) segue esse pipeline. Exceções:
  - `auth`: não possui repository próprio — reutiliza `userRepository` do módulo `users` diretamente.
  - `cart`: não possui repository — o `cartService` acessa Redis e o Prisma diretamente (não há uma entidade `Cart` persistida em banco).
- **Middleware de validação centralizado**: `express-validator` + `validateRequest` (`src/middlewares/validateRequest.js`) padroniza erros de payload como `AppError` 400/`INVALID_PAYLOAD`. Usado apenas no módulo `auth`; os demais módulos não possuem validators dedicados (**Hipótese**: validação de payload em `categories`, `orders`, `payments`, `products`, `users` depende apenas de checagens manuais no service ou é inexistente).
- **Erro de domínio único**: `AppError` (`src/utils/AppError.js`) é a classe de erro padrão em toda a aplicação, capturada pelo middleware global `errorHandler`.
- **Autorização baseada em role simples** (`USER` / `ADMIN`) aplicada via funções `adminOnly` **duplicadas** localmente em `categoryRoutes.js` e `productRoutes.js` (mesmo código copiado, não compartilhado).
- **Cache-aside** em `productService.listProducts` (Redis com TTL de 60s) e em `cartService` (Redis como armazenamento primário do carrinho, TTL de 30 dias).
- **Transações atômicas via `prisma.$transaction`** em fluxos que afetam múltiplas tabelas (`orderRepository.createOrderTransaction`, `paymentService.confirmPayment`, `paymentService.cancelPayment`).
- **JWT stateless com refresh token stateful**: access token verificado sem consulta a banco/cache; refresh token é persistido no Redis (`refresh:<userId>`), mas **não há rota/fluxo de refresh implementado** (nenhum controller consome `verifyRefreshToken` ou a chave `refresh:*`) — token é gravado mas nunca lido de volta (**código morto funcional**).

## 3. Regras Arquiteturais (observadas no código)

1. Toda rota autenticada depende do middleware `authMiddleware`, que popula `req.user = { sub, role }` a partir do access token JWT.
2. Toda resposta de erro passa pelo `errorHandler` global e segue o formato `{ error: { code, message, details, stack? } }`; `stack` só é exposto se `NODE_ENV === 'development'`.
3. Respostas de sucesso seguem majoritariamente o envelope `{ data, meta? }`, mas **não é uniforme**: `cartController` retorna `{ data }` sem `meta`; `productController.list` retorna `{ data, pagination }` (sem chave `data` aninhada em `meta`); erros 400 manuais em `cartController` retornam `{ error: '...' }` (string), divergindo do formato `{ error: { code, message } }` usado pelo `errorHandler`.
4. Regras de autorização "dono do recurso ou ADMIN" são reimplementadas manualmente em cada service que precisa delas (`userService.updateUser`, `userService.deleteUser`, `userController.getProfile`) — não há um middleware/helper reutilizável.
5. Multi-tenancy: o schema Prisma define `tenantId` (default `"default"`) em `User`, `Product` e `Order`, mas **apenas `cartService` de fato usa `tenantId`** nas chaves Redis. Nenhum repository Prisma filtra queries por `tenantId`. **Hipótese**: multi-tenancy foi projetada mas não foi implementada de ponta a ponta — hoje o sistema funciona efetivamente como single-tenant.

## 4. Convenções Técnicas

- **Módulos CommonJS** (`require`/`module.exports`) em todo `src/`; `prisma.config.ts` é a única exceção em TypeScript/ESM, por exigência do próprio Prisma 7.
- **Nomenclatura de arquivo por camada**: `<dominio>Controller.js`, `<dominio>Service.js`, `<dominio>Repository.js`, `<dominio>Routes.js`, `<dominio>Validators.js`.
- **Objetos literais como "classes estáticas"**: cada camada exporta um objeto com métodos (`const xService = { metodo: async () => {} }`), em vez de classes ES6 — padrão consistente em todos os módulos.
- **Idioma**: identificadores em inglês, mensagens de erro e comentários em português (pt-BR) — convenção consistente em todo o código.
- **Tratamento de erro em controllers**: sempre `try/catch` chamando `next(error)`; nenhum controller usa um wrapper genérico (ex.: `asyncHandler`), gerando repetição do mesmo bloco try/catch em praticamente todos os métodos.
- **Configuração via variáveis de ambiente** (`dotenv`), carregadas uma única vez em `src/server.js` (`require('dotenv').config()`), consumidas diretamente via `process.env` em `config/*` e `utils/token.js` — não há schema de validação de env vars (ex.: `envalid`/`zod`).

## 5. Separação de Responsabilidades

| Camada | Responsabilidade | Observação |
|---|---|---|
| `src/server.js` | Bootstrap do Express, montagem de middlewares globais e rotas, healthcheck, 404 e error handler | Ponto de entrada único da aplicação |
| `src/config/*` | Inicialização de clientes de infraestrutura (Prisma, Redis, Winston) | Singletons carregados no `require` |
| `src/middlewares/*` | Cross-cutting concerns (auth, log HTTP, erro, validação) | Contém 1 módulo órfão (`requestLogger.js`) — ver seção de riscos |
| `src/modules/*/**Routes.js` | Definição de endpoints e composição de middlewares (auth, validação, autorização) | Local onde regras de acesso público/admin são decididas |
| `src/modules/*/**Controller.js` | Adaptação HTTP (parse de request, chamada ao service, formatação de resposta) | Não deveria conter regra de negócio — majoritariamente respeitado, com exceção do `cartController` (decide fallback de `userId`) |
| `src/modules/*/**Service.js` | Regras de negócio, orquestração entre repositories e outros services/infra | Camada mais carregada; concentra acesso direto a Redis em `auth`, `cart`, `products`, `orders` |
| `src/modules/*/**Repository.js` | Acesso a dados via Prisma | Ausente em `auth` (reusa `users`) e `cart` (usa Redis diretamente no service) |
| `src/utils/*` | Utilitários puros sem estado de negócio (`AppError`, geração/verificação de JWT) | — |

## 6. Fluxo de Comunicação Entre Módulos

```
Client
  │
  ▼
server.js (helmet, compression, cors, json parser, httpLogger)
  │
  ├─ /api/v1/auth ─────────► auth (usa users.userRepository)
  ├─ /api/v1/cart ─── authMiddleware (aplicado no server.js) ───► cart (usa config/redis, config/database)
  ├─ /api/v1/products ─────► products (usa config/redis para cache)
  ├─ /api/v1/categories ───► categories
  ├─ /api/v1/orders ───────► orders (usa cart.cartService, products.productRepository, config/redis)
  ├─ /api/v1/payments ─────► payments (usa config/database diretamente para transação cross-entidade)
  └─ /api/v1/users ────────► users
```

Dependências diretas entre módulos de domínio (import cruzado):

- `auth` → `users` (`userRepository`)
- `orders` → `cart` (`cartService.getCart`), `orders` → `products` (`productRepository`, **pulando** `productService`)
- `payments` → nenhum módulo de domínio diretamente, mas acessa `prisma` (tabela `orders`) diretamente em vez de passar por `orderService`/`orderRepository`

**Importante**: não existe uma camada de eventos/mensageria real. A comunicação entre `orders` e `payments` é implícita via banco de dados compartilhado (ambos leem/escrevem a mesma tabela `orders`), não via chamada de função nem evento.

## 7. Dependências Críticas

- **PostgreSQL via Prisma** (`@prisma/client`, `@prisma/adapter-pg`): fonte de verdade para `User`, `Category`, `Product`, `Order`, `OrderItem`, `Payment`. Indisponibilidade derruba praticamente todos os endpoints exceto leitura de carrinho já cacheado.
- **Redis**: usado como (a) storage primário do carrinho (não há fallback em Postgres — perda do Redis = perda de todos os carrinhos ativos), (b) cache de listagem de produtos, (c) storage de refresh tokens (atualmente não lido de volta por nenhum fluxo). Conexão é aberta de forma assíncrona e não bloqueante no `require('./config/redis')` — se a conexão falhar, chamadas subsequentes a `redisClient.get/set` podem lançar exceção não tratada de forma específica (cai no `errorHandler` genérico como 500).
- **JWT (`jsonwebtoken`)**: toda autenticação depende de `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` via env var, sem rotação de chave nem verificação de presença no boot (se a env var não existir, `jwt.sign`/`jwt.verify` falha em runtime, não no startup).
- **bcrypt**: usado apenas em `authService` (registro/login). `userService.updateUser` **não** re-hasheia senha (ver riscos).

## 8. Riscos Técnicos e Acoplamentos Importantes

1. **Multi-tenancy incompleta**: `tenantId` existe no schema mas não é propagado/filtrado na maioria das queries Prisma nem nos tokens JWT (`generateAccessToken` não inclui `tenantId`). Ativar multi-tenant real hoje exigiria mudanças em quase todos os repositories. *(Hipótese quanto à intenção original do design.)*
2. **Atualização de senha sem hashing**: `userService.updateUser` grava `data.password` (se enviado) diretamente sem `bcrypt.hash`, ao contrário de `authService.register`. É uma inconsistência de segurança explícita (comentário no próprio código admite a omissão).
3. **Ausência de checagem de propriedade em pagamentos**: `paymentController.confirm`/`cancel` e o respectivo service não verificam se `req.user` é o dono do `order` associado ao `paymentId` — qualquer usuário autenticado que descubra/adivinhe um `paymentId` pode confirmar ou cancelar o pagamento de outro usuário.
4. **Bypass latente de autorização no carrinho**: `cartController` usa `req.user ? req.user.sub : req.query.userId` como fallback. Hoje isso é inofensivo porque `server.js` aplica `authMiddleware` antes de `cartRoutes`, mas o próprio `cartRoutes.js` tem o import do middleware comentado — se as rotas forem movidas/montadas em outro ponto sem esse cuidado, a checagem de identidade pode ser contornada via query string.
5. **Cache de produtos sem invalidação**: `productService.createProduct/updateProduct/deleteProduct` não invalidam as chaves `products:list:*` no Redis. Após uma alteração, listagens podem ficar até 60s desatualizadas (stock, preço, status).
6. **Acoplamento direto entre `orders` e `payments` via tabela compartilhada**: nenhuma camada de evento; qualquer mudança de schema em `orders`/`payments` impacta os dois módulos simultaneamente sem contrato explícito.
7. **`orders` ignora a camada de serviço de `products`**: `orderService` chama `productRepository.findById` diretamente, pulando `productService` — duplica regra de acesso a dados e quebra a separação de responsabilidades descrita na seção 5.
8. **Hardcode de `tenantId: 'default'`** em `orderService.checkout` ao limpar o carrinho (`cart:default:${userId}`) — se o `tenantId` do usuário não for literalmente `'default'`, o carrinho não é limpo após o checkout (bug latente assim que multi-tenancy for ativada).
9. **Transação de estoque com lógica frágil**: `orderRepository.createOrderTransaction` decrementa estoque e depois lê novamente para checar se ficou negativo, lançando erro genérico (`Error`, não `AppError`) — o `errorHandler` trata isso como 500 genérico, perdendo o código semântico (`OUT_OF_STOCK`) que o restante do sistema usa. Depende de não haver *constraint* de banco impedindo estoque negativo (não confirmada no schema atual).
10. **Middleware órfão**: `src/middlewares/requestLogger.js` não é importado em nenhum lugar do projeto (confirmado via busca). É um módulo morto — possivelmente substituído por `httpLogger.js` (baseado em `morgan`) sem remoção do código antigo.
11. **`httpLogger` silenciado fora de desenvolvimento**: `skip()` desativa o log HTTP quando `NODE_ENV !== 'development'`, ou seja, em produção não há log de requisições HTTP via morgan (apenas os logs manuais de `logger.info/error` espalhados pelos services).
12. **Duplicação de middleware `adminOnly`**: implementado de forma idêntica em `categoryRoutes.js` e `productRoutes.js` — qualquer mudança de regra de admin exige edição em múltiplos lugares.
13. **Refresh token gravado mas nunca consumido**: `authService` grava `refresh:<userId>` no Redis a cada login/registro, mas não existe endpoint `/refresh` ou lógica que leia essa chave — funcionalidade parcialmente implementada.
14. **Ausência de testes automatizados no working tree**: `package.json` tem `jest`/`supertest` como devDependencies e um commit recente (`test(unit): add unit tests for cartService getCart behavior`) no histórico do git, mas não há nenhum arquivo `*.test.js` ou pasta de testes presente na árvore atual. **Hipótese**: os testes podem ter sido removidos, não commitados, ou estão fora do diretório analisado.
15. **Escalada de privilégio no cadastro**: `authService.register` aceita `role` vindo do corpo da requisição (`role || 'USER'`) e `authValidators.js` não restringe o campo. Qualquer chamador anônimo pode se cadastrar como `ADMIN` enviando `role: "ADMIN"`. Detalhado em `src/modules/auth/README.md`.
16. **Migrações Prisma não versionadas**: `prisma.config.ts` aponta para `prisma/migrations`, mas essa pasta não existe no repositório (apenas `schema.prisma`). O `npm run migrate` gera as migrações localmente, e elas não são rastreadas pelo git. Detalhado em `prisma/README.md`.
17. **Documentação sem verificação automática**: até a introdução de `npm run docs:check` (`scripts/check-docs.js`), nada impedia uma pasta nova em `src/` de ficar sem README ou um README de perder seções obrigatórias. O script verifica só a estrutura. O conteúdo ainda precisa ser revisado manualmente.

## 9. Diretrizes para Futuras Implementações

Estas diretrizes devem ser seguidas por qualquer nova especificação (spec) implementada neste projeto, para manter consistência com o que já existe e evitar reforçar os riscos listados acima:

1. **Padronizar o envelope de resposta** (`{ data, meta }` para sucesso e `{ error: { code, message, details } }` para erro) em *todos* os controllers novos e existentes — não retornar strings soltas em `error`.
2. **Nunca aplicar autenticação apenas no `server.js`** para um módulo sem também deixar explícito (import ativo, não comentado) no arquivo de rotas do módulo, para evitar acoplamento invisível entre bootstrap e módulo.
3. **Toda nova regra "dono do recurso ou admin" deve ser extraída para um middleware/helper reutilizável** em `src/middlewares/` (ex.: `ownerOrAdmin.js`) em vez de duplicar a checagem em cada service.
4. **Toda escrita que afete dados cacheados em Redis deve invalidar explicitamente as chaves de cache relacionadas** no mesmo commit que introduz a escrita (aplica-se hoje a `products`, e a qualquer novo cache-aside futuro).
5. **Módulos de domínio não devem importar `repository` de outro módulo diretamente** — a comunicação entre domínios deve passar pelo `service` público do módulo alvo (corrigir/():evitar reincidência do padrão visto em `orders` → `products.productRepository`).
6. **Se/quando multi-tenancy for formalizada**, `tenantId` deve ser incluído no payload do JWT (`generateAccessToken`) e propagado obrigatoriamente por todos os repositories novos e existentes — não introduzir mais filtros parciais como o atual em `cartService`.
7. **Nenhum código morto deve ser deixado no repositório**: middlewares, rotas ou funções não referenciadas (como `requestLogger.js`) devem ser removidos ao serem identificados, não apenas substituídos silenciosamente.
8. **Erros de negócio lançados dentro de transações Prisma devem sempre ser `AppError` com código semântico**, nunca `Error` genérico, para preservar o status HTTP e o `code` corretos no `errorHandler`.
9. **Toda alteração de senha de usuário deve reutilizar o mesmo helper de hashing usado no registro** (`bcrypt.hash`) — nunca persistir senha em texto plano.
10. **Novas specs devem declarar explicitamente validators (`express-validator`) por endpoint**, seguindo o padrão já usado em `auth`, em vez de deixar a validação implícita dentro do service.
11. **Nenhum campo de privilégio (`role`) pode ser aceito de input público**: cadastro público deve sempre criar `USER`; criação de `ADMIN` deve exigir um admin autenticado ou um processo fora da API.
12. **Toda nova pasta em `src/` (e `prisma/`) deve ter README.md com as seções padrão**, e `npm run docs:check` deve passar antes de concluir a spec.

---
*Este documento reflete o estado do código no momento da análise. Deve ser revisado sempre que uma mudança arquitetural significativa for introduzida (nova dependência crítica, novo padrão de comunicação entre módulos, mudança de convenção).*
