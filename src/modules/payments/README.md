# src/modules/payments

## Objetivo do Módulo
Gerenciar o ciclo de vida do pagamento associado a um pedido: criação da intenção de pagamento, confirmação (com idempotência) e cancelamento, sincronizando o status do `Order` correspondente.

## Responsabilidade Principal
Persistir e transicionar o estado de `Payment`, mantendo `Order.status` consistente com `Payment.status` via transação atômica.

## Funcionalidades Existentes
- `POST /api/v1/payments`: cria uma intenção de pagamento para um `orderId` (idempotente — se já existir um `Payment` para o pedido, retorna o existente em vez de duplicar). Normalmente já é criado automaticamente durante o checkout (`orders`); esta rota existe para criação isolada.
- `POST /api/v1/payments/:id/confirm`: confirma um pagamento, exigindo o header `Idempotency-Key`; atualiza `Payment.status = PAID` e `Order.status = PAID` em transação. Se o pagamento já estiver `PAID`, retorna o registro atual sem reprocessar.
- `POST /api/v1/payments/:id/cancel`: cancela um pagamento; atualiza `Payment.status = CANCELED` e `Order.status = CANCELED` em transação.

## Dependências Internas e Externas
- **Internas**: `src/config/database.js` (Prisma, incluindo acesso **direto** à tabela `orders` sem passar por `orderService`/`orderRepository`), `src/config/logger.js`, `src/middlewares/authMiddleware.js`, `src/utils/AppError.js`.
- **Externas**: nenhuma — não há integração real com um gateway de pagamento (Stripe, PagSeguro, etc.); o campo `Payment.externalId` existe no schema mas não é preenchido por nenhum código atual.

## Módulos Relacionados
- `orders`: acoplado via tabela `orders` compartilhada no Postgres (não via chamada de função) — mudanças no schema/regras de `Order` afetam este módulo silenciosamente.

## Pontos de Entrada
- `paymentRoutes.js`, montado em `server.js` como `app.use('/api/v1/payments', paymentRoutes)`, com `router.use(authMiddleware)` aplicado a todas as rotas (não há rota pública).

## Fluxos Importantes
1. **Criação**: checa se já existe `Payment` para o `orderId` (idempotência por design, não por header) — se sim, retorna o existente.
2. **Confirmação**: exige header `Idempotency-Key` (validação apenas de presença, o valor em si não é armazenado/comparado a chamadas anteriores) → busca pagamento → se já `PAID`, retorna direto → senão, transação atualiza `Payment` e `Order` → loga evento `order.paid`.
3. **Cancelamento**: busca pagamento → transação atualiza `Payment` e `Order` para `CANCELED` (sem devolução de estoque).

## Arquivos Críticos
- `paymentService.js`: ponto único de sincronização entre `Payment` e `Order`; qualquer inconsistência aqui gera pedidos com status divergente do pagamento real.

## Observações Técnicas e Débitos Identificados
- **Sem checagem de propriedade (ownership)**: nenhum dos três endpoints verifica se `req.user.sub` corresponde ao dono do `Order` associado ao pagamento. Qualquer usuário autenticado que souber/adivinhar um `paymentId` pode confirmar ou cancelar o pagamento de **outro** usuário. Este é o risco de segurança mais relevante identificado neste módulo.
- **`Idempotency-Key` é validada apenas quanto à presença**, não é de fato usada para deduplicar requisições repetidas com a mesma chave (não há tabela/cache registrando chaves já processadas) — a idempotência real vem apenas da checagem `payment.status === 'PAID'`, não do header em si.
- **Acesso direto ao Prisma para a tabela `orders`**, em vez de usar `orderRepository`/`orderService` — comentário no próprio código (`paymentService.js`) admite a simplificação: *"Para atualizar order status cross-module, ideal via event ou service, aqui direto no prisma pra simplificar transaction"*.
- **Sem devolução de estoque no cancelamento** — produtos decrementados no checkout (`orders`) não são restaurados quando um pagamento é cancelado.
- Nenhuma integração real com gateway externo: `externalId` nunca é gravado por nenhum fluxo atual (campo existe no schema, mas está sempre `null` na prática observada no código).
