# src/modules/cart

## Objetivo do Módulo
Gerenciar o carrinho de compras de cada usuário autenticado: adicionar itens, remover itens e consultar o estado atual, com validação de estoque em tempo real.

## Responsabilidade Principal
Manter o estado transitório de uma futura compra (pré-checkout), sem persistência relacional — o carrinho não é uma entidade no schema Prisma, existe apenas como estrutura JSON no Redis.

## Funcionalidades Existentes
- `GET /api/v1/cart`: retorna o carrinho do usuário (`{ items: [], total: 0 }` se vazio/inexistente).
- `POST /api/v1/cart/items`: adiciona um item (`productId`, `quantity`), validando existência do produto e estoque suficiente; soma quantidade se o item já existir no carrinho.
- `DELETE /api/v1/cart/items/:itemId`: remove um item do carrinho pelo `productId` (o parâmetro de rota é nomeado `itemId`, mas o valor comparado internamente é `productId` — ver Observações).

## Dependências Internas e Externas
- **Internas**: `src/config/redis.js` (armazenamento primário do carrinho), `src/config/database.js` (Prisma, para checar produto/estoque), `src/utils/AppError.js`.
- **Externas**: nenhuma biblioteca de terceiros além das já usadas pela infraestrutura (`redis`, `@prisma/client`).

## Módulos Relacionados
- `orders`: consome `cartService.getCart` diretamente durante o checkout, e é o único outro módulo que lê o estado do carrinho.
- `products`: `cartService.addItem` consulta `prisma.product` diretamente em vez de passar por `productRepository`/`productService`.

## Pontos de Entrada
- `cartRoutes.js`, montado em `server.js` como `app.use('/api/v1/cart', authMiddleware, cartRoutes)`. **Importante**: a autenticação é aplicada no `server.js`, não dentro do próprio `cartRoutes.js` (que tem o import de `authMiddleware` comentado).

## Fluxos Importantes
1. **Chave Redis**: `cart:<tenantId>:<userId>`, com `tenantId` default `'default'` — este é o único módulo do sistema que efetivamente usa `tenantId` em uma operação.
2. **TTL do carrinho**: 30 dias (`CART_TTL`), renovado a cada escrita (`addItem`/`removeItem`).
3. **addItem**: busca produto no Postgres → valida estoque → busca carrinho atual no Redis → atualiza ou insere item → recalcula `total` → persiste no Redis.
4. **removeItem**: busca carrinho atual → filtra item pelo `productId` → recalcula `total` → persiste no Redis.

## Arquivos Críticos
- `cartService.js`: única fonte de verdade sobre o formato dos dados do carrinho (`{ items: [{ productId, name, price, quantity }], total }`); qualquer mudança de formato aqui impacta diretamente `orders.orderService.checkout`, que lê essa mesma estrutura.

## Observações Técnicas e Débitos Identificados
- **Fallback de identidade via query string**: `cartController` usa `req.user ? req.user.sub : req.query.userId`. Funciona com segurança hoje porque `authMiddleware` é aplicado antes no `server.js`, mas é um padrão frágil — se as rotas forem remontadas sem esse middleware, um chamador poderia informar `userId` livremente via `?userId=`.
- **Nomenclatura inconsistente de parâmetro**: a rota `DELETE /items/:itemId` na verdade espera (e o service trata) um `productId`, não um identificador de item de carrinho — pode confundir consumidores da API que esperem um ID de linha do carrinho.
- **Sem persistência de fallback**: o carrinho existe apenas no Redis; se a instância do Redis for perdida/zerada sem snapshot, todos os carrinhos ativos são perdidos (não há espelhamento em Postgres).
- **Sem limite de tamanho/valor**: não há validação de payload (`express-validator`) em `cartRoutes.js` — `quantity` negativa ou não numérica, por exemplo, não é bloqueada explicitamente antes de chegar ao `cartService`.
- Acesso direto ao Prisma (`prisma.product.findUnique`) em vez de usar `productRepository`/`productService` — mesmo padrão de acoplamento cruzado observado em `orders`.
