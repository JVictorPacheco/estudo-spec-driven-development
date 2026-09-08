# src/modules/orders

## Objetivo do Módulo
Converter o carrinho de um usuário em um pedido formal (checkout) e permitir a consulta do histórico de pedidos do usuário autenticado.

## Responsabilidade Principal
Orquestrar a transição carrinho → pedido: revalidar dados de produto/estoque no momento da compra, executar a transação atômica de criação do pedido e itens, e iniciar o registro de pagamento associado.

## Funcionalidades Existentes
- `GET /api/v1/orders`: lista pedidos do usuário autenticado (`req.user.sub`), incluindo itens e pagamento, ordenados do mais recente para o mais antigo.
- `POST /api/v1/orders`: executa o checkout do carrinho do usuário autenticado, criando um `Order` com seus `OrderItem`s e um `Payment` inicial (`AWAITING_CONFIRMATION`).

## Dependências Internas e Externas
- **Internas**:
  - `src/modules/cart/cartService.js` — lê o carrinho do usuário (`getCart`).
  - `src/modules/products/productRepository.js` — revalida produto/estoque **pulando** `productService`.
  - `src/config/database.js` (Prisma, incluindo `$transaction`).
  - `src/config/redis.js` — importado **dentro** do método `checkout` (não no topo do arquivo) para limpar o carrinho após o pedido.
  - `src/config/logger.js`, `src/utils/AppError.js`.
- **Externas**: nenhuma além de Prisma.

## Módulos Relacionados
- `cart`: fonte dos itens a serem convertidos em pedido; formato de dados fortemente acoplado ao definido em `cartService`.
- `products`: fonte de verdade de preço/estoque/status no momento do checkout.
- `payments`: cria o registro inicial de `Payment`, mas a partir daí o ciclo de vida do pagamento é responsabilidade exclusiva do módulo `payments` (nenhuma chamada de volta deste módulo para lá).

## Pontos de Entrada
- `orderRoutes.js`, montado em `server.js` como `app.use('/api/v1/orders', orderRoutes)`, com `router.use(authMiddleware)` aplicado a **todas** as rotas do módulo (não há rota pública aqui).

## Fluxos Importantes
**Checkout (`orderService.checkout`)**:
1. Busca carrinho no Redis (`cartService.getCart`); carrinho vazio → erro 400.
2. Para cada item do carrinho, busca o produto atual no Postgres (via `productRepository.findById`) e revalida: existência, estoque suficiente, status `ACTIVE`. O preço usado é sempre o do catálogo **no momento do checkout**, não o que estava salvo no carrinho (proteção contra preço desatualizado).
3. Executa `orderRepository.createOrderTransaction`, que dentro de uma única transação Prisma: decrementa estoque de cada produto, cria o `Order` + `OrderItem`s, e cria o `Payment` inicial.
4. Remove a chave do carrinho no Redis (`cart:default:<userId>` — tenantId hardcoded, ver Observações).
5. Loga (não publica) o evento `order.created`.

## Arquivos Críticos
- `orderService.js`: contém toda a lógica de revalidação de negócio do checkout; qualquer bug aqui pode gerar cobrança incorreta ou venda de produto sem estoque.
- `orderRepository.js`: contém a transação atômica de decremento de estoque + criação de pedido — ponto crítico de consistência de dados.

## Observações Técnicas e Débitos Identificados
- **`tenantId` hardcoded como `'default'`** na limpeza do carrinho pós-checkout (`cart:default:${userId}`) — se o usuário tiver um `tenantId` diferente (quando/se multi-tenancy for ativada), o carrinho não seria limpo corretamente após a compra.
- **Import de `redisClient` dentro da função `checkout`**, em vez de no topo do arquivo — inconsistente com a convenção do resto do projeto (import sempre no topo).
- **Acoplamento direto a `productRepository`**, pulando `productService` — duplica a fronteira de acesso a dados de produto e quebra a separação de responsabilidades por módulo.
- **Lógica de decremento de estoque frágil**: `orderRepository.createOrderTransaction` decrementa o estoque e, em seguida, faz uma leitura extra (`findUnique`) só para checar se o valor ficou negativo, lançando um `Error` genérico (não `AppError`) nesse caso. Isso faz o `errorHandler` responder 500/`INTERNAL_SERVER_ERROR` em vez de um erro semântico como `OUT_OF_STOCK` — apesar de a checagem de estoque já ter sido feita no service um passo antes, existe uma janela de corrida entre a checagem em `orderService` e o decremento em `orderRepository` sob concorrência (dois checkouts simultâneos do mesmo produto).
- Sem devolução de estoque em caso de cancelamento de pedido/pagamento (ver módulo `payments`) — estoque decrementado no checkout não é restaurado se o pagamento for cancelado depois.
- Não há paginação em `GET /api/v1/orders` — a listagem de pedidos por usuário retorna todos os registros de uma vez.
