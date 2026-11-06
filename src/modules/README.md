# src/modules

## Objetivo do Módulo
Diretório-índice que agrupa todos os módulos de domínio (bounded contexts informais) da aplicação. Não contém lógica própria — cada subpasta é autocontida e documentada em seu próprio `README.md`.

## Responsabilidade Principal
Organizar o código por feature/domínio de negócio, seguindo o padrão `Router → Controller → Service → (Repository)` descrito em `docs/ARQUITETURA-DO-SISTEMA.md`.

## Módulos Existentes

| Módulo | Prefixo de rota | Documentação | Acesso |
|---|---|---|---|
| [`auth`](./auth/README.md) | `/api/v1/auth` | Registro e login, emissão de JWT | Público |
| [`cart`](./cart/README.md) | `/api/v1/cart` | Carrinho de compras (Redis) | Autenticado (aplicado em `server.js`) |
| [`categories`](./categories/README.md) | `/api/v1/categories` | Catálogo de categorias hierárquicas | Leitura pública / escrita `ADMIN` |
| [`products`](./products/README.md) | `/api/v1/products` | Catálogo de produtos com cache | Leitura pública / escrita `ADMIN` |
| [`orders`](./orders/README.md) | `/api/v1/orders` | Checkout e histórico de pedidos | Autenticado |
| [`payments`](./payments/README.md) | `/api/v1/payments` | Ciclo de vida do pagamento | Autenticado |
| [`users`](./users/README.md) | `/api/v1/users` | Perfil de usuário (dono ou admin) | Autenticado |

## Dependências Internas e Externas
Ver seção "Fluxo de Comunicação Entre Módulos" em [`docs/ARQUITETURA-DO-SISTEMA.md`](../../docs/ARQUITETURA-DO-SISTEMA.md) para o mapa completo de imports cruzados entre módulos (`auth`→`users`, `orders`→`cart`/`products`, `payments`→tabela `orders` via Prisma direto).

## Módulos Relacionados
Todos dependem de `src/config/*` (Prisma, Redis, Logger), `src/middlewares/*` (auth, erro, validação) e `src/utils/*` (AppError, JWT).

## Pontos de Entrada
Nenhum diretamente — os pontos de entrada HTTP reais são os arquivos `*Routes.js` dentro de cada subpasta, montados centralmente em `src/server.js`.

## Observações Técnicas e Débitos Identificados
- Não existe um módulo `shared`/`common` para lógica de autorização reutilizável (`adminOnly`, `ownerOrAdmin`) — está duplicada em `categories`/`products` (admin) e reimplementada em `users` (dono ou admin). Ver diretriz nº 3 em `docs/ARQUITETURA-DO-SISTEMA.md`.
- Três módulos (`orders`, `payments`, `cart`) acessam dados de outro domínio pulando a camada `service`/`repository` pública desse domínio (`productRepository` direto, tabela `orders` via Prisma direto). Isso é o principal ponto de acoplamento excessivo identificado na análise arquitetural — consulte cada README de módulo para o detalhe específico.
- Para o contexto de negócio por trás destes módulos (fluxos, atores, propósito), consulte [`docs/OBJETIVO-DO-SISTEMA.md`](../../docs/OBJETIVO-DO-SISTEMA.md).
- Risco de segurança transversal: `auth` permite autocadastro com `role: "ADMIN"` (ver `src/modules/auth/README.md` e `docs/ARQUITETURA-DO-SISTEMA.md`, risco nº 15).
- O schema de dados que sustenta todos estes módulos está documentado em [`prisma/README.md`](../../prisma/README.md).
