# src/modules/categories

## Objetivo do Módulo
Gerenciar o catálogo de categorias de produtos, incluindo hierarquia simples (categoria pai/filho).

## Responsabilidade Principal
CRUD de categorias, com leitura pública e escrita restrita a administradores.

## Funcionalidades Existentes
- `GET /api/v1/categories`: lista todas as categorias, incluindo filhos diretos (`children`) — rota pública.
- `GET /api/v1/categories/:id`: detalhe de uma categoria (com `children`) — rota pública; 404 se não existir.
- `POST /api/v1/categories`: cria categoria — apenas `ADMIN`.
- `PUT /api/v1/categories/:id`: atualiza categoria (checa existência antes) — apenas `ADMIN`.
- `DELETE /api/v1/categories/:id`: remove categoria — apenas `ADMIN`; bloqueia exclusão se houver produtos associados (erro Prisma `P2003` mapeado para 409/`CONFLICT`).

## Dependências Internas e Externas
- **Internas**: `src/config/database.js` (Prisma), `src/middlewares/authMiddleware.js`, `src/utils/AppError.js`.
- **Externas**: nenhuma além do Prisma Client.

## Módulos Relacionados
- `products`: relação 1:N no schema (`Category.products`); a exclusão de categoria depende dessa relação para o bloqueio por FK.

## Pontos de Entrada
- `categoryRoutes.js`, montado em `server.js` como `app.use('/api/v1/categories', categoryRoutes)`. Autenticação é aplicada **dentro do próprio arquivo de rotas** via `router.use(authMiddleware)` — mas apenas *depois* das duas rotas públicas (`GET /` e `GET /:id`), ou seja, a ordem das declarações de rota é o que define o que é público ou não.

## Fluxos Importantes
- `findAll`/`findById` carregam apenas 1 nível de `children` (comentário no código explicita que Prisma não faz árvore recursiva nativa em `findMany`) — hierarquias com mais de 2 níveis não são totalmente representadas em uma única chamada.
- `updateCategory` sempre chama `getCategoryById` antes de atualizar, garantindo 404 correto mesmo que o Prisma também falhasse silenciosamente.

## Arquivos Críticos
- `categoryRoutes.js`: define a fronteira entre público/admin por **ordem de declaração** — uma rota nova adicionada acima de `router.use(authMiddleware)` seria pública mesmo sem essa intenção.

## Observações Técnicas e Débitos Identificados
- **Middleware `adminOnly` duplicado**: implementação idêntica à de `src/modules/products/productRoutes.js`, sem reuso — deveria ser extraído para `src/middlewares/`.
- Não há validação de payload (`express-validator`) em `create`/`update` — dados inválidos (ex.: `name` vazio) só falhariam por constraints do Prisma/Postgres, sem mensagens de erro amigáveis padronizadas.
- Comentário no código (`categoryService.updateCategory`) menciona um "Webhook: category.updated -> Simulado" que **não existe de fato no código** (não há chamada de webhook nenhuma) — comentário desatualizado/aspiracional, não uma funcionalidade real.
- **Cupons (planejado)**: cupons poderão ser restritos a categorias ou produtos. Esta é a razão para o módulo ser consultado pela regra de cupom via service, e não via repository. Ver `docs/DECISOES-DE-PRODUTO.md`.
