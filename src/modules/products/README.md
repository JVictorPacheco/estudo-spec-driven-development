# src/modules/products

## Objetivo do Módulo
Gerenciar o catálogo de produtos: cadastro, edição, remoção, consulta individual e listagem paginada/pesquisável, com cache de leitura.

## Responsabilidade Principal
CRUD de produtos, com leitura pública (com cache) e escrita restrita a administradores.

## Funcionalidades Existentes
- `GET /api/v1/products`: lista produtos ativos (`status: ACTIVE`), com paginação (`page`, `limit`), filtro por `categoryId` e busca textual (`search`, case-insensitive em `name`/`description`). Resultado é cacheado no Redis por 60 segundos, com chave derivada dos parâmetros de query.
- `GET /api/v1/products/:id`: detalhe de um produto (com categoria incluída) — 404 se não existir.
- `POST /api/v1/products`: cria produto — apenas `ADMIN`; bloqueia SKU duplicado (409).
- `PUT /api/v1/products/:id`: atualiza produto — apenas `ADMIN`; revalida SKU duplicado se o campo `sku` for alterado.
- `DELETE /api/v1/products/:id`: remove produto — apenas `ADMIN`; 404 se já não existir (`P2025` do Prisma mapeado).

## Dependências Internas e Externas
- **Internas**: `src/config/database.js` (Prisma), `src/config/redis.js` (cache de listagem), `src/middlewares/authMiddleware.js`, `src/utils/AppError.js`.
- **Externas**: nenhuma além de Prisma/Redis já usados na infraestrutura.

## Módulos Relacionados
- `categories`: todo produto pertence a uma categoria (`categoryId` obrigatório no schema).
- `cart`: `cartService.addItem` lê produtos diretamente via Prisma, não via este módulo.
- `orders`: `orderService` lê produtos via `productRepository` diretamente, pulando este módulo's service.

## Pontos de Entrada
- `productRoutes.js`, montado em `server.js` como `app.use('/api/v1/products', productRoutes)`. Mesma estrutura de `categories`: rotas públicas declaradas antes de `router.use(authMiddleware)`.

## Fluxos Importantes
- **Cache-aside em `listProducts`**: tenta ler do Redis (`products:list:<params>`); se ausente/expirado, consulta Postgres (`findMany` + `count` em paralelo via `Promise.all`) e grava no cache por 60s.
- Erros de leitura do cache Redis em `listProducts` são capturados e apenas logados via `console.error` (não `logger`), sem interromper a listagem — a busca segue direto no banco.

## Arquivos Críticos
- `productService.js`: concentra a lógica de cache e as regras de unicidade de SKU.
- `productRepository.js`: única fonte de queries Prisma para produto — usada também por `cart` e `orders` (de forma inconsistente: `cart` acessa `prisma` diretamente, `orders` usa este repository).

## Observações Técnicas e Débitos Identificados
- **Cache sem invalidação**: `createProduct`, `updateProduct` e `deleteProduct` não removem/atualizam as chaves `products:list:*` no Redis. Após qualquer escrita, listagens podem exibir dados desatualizados (preço, estoque, status) por até 60 segundos.
- **Middleware `adminOnly` duplicado**: mesmo código de `categoryRoutes.js` (ver observação equivalente naquele README).
- `console.error` usado em vez de `logger.error` em `listProducts` — inconsistência de padrão de logging (o resto do projeto usa Winston via `config/logger.js`).
- Não há validação de payload (`express-validator`) em `create`/`update` — ex.: `price` negativo ou `stock` não numérico não são bloqueados antes de chegar ao Prisma.
- Full-text search real não está implementado — o comentário no `schema.prisma` (`@@index([name])`) menciona a capacidade, mas a busca em `productRepository.findAll` usa `contains`/`insensitive` simples, não um índice de full-text do Postgres.
- **Cupons (planejado)**: cupons poderão ser restritos a categorias ou produtos. Esta é a razão para o módulo ser consultado pela regra de cupom via service, e não via repository. Ver `docs/DECISOES-DE-PRODUTO.md`.
