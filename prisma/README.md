# prisma

## Objetivo do Módulo
Define o modelo de dados relacional do sistema (PostgreSQL) e é a fonte de verdade do schema usado pelo Prisma Client.

## Responsabilidade Principal
Manter `schema.prisma`: enums, modelos, relações e índices. A configuração de datasource e migrações do Prisma 7 fica em `prisma.config.ts` (raiz, TypeScript/ESM).

## Funcionalidades Existentes
- Enums: `Role` (`USER`, `ADMIN`), `ProductStatus` (`ACTIVE`, `INACTIVE`), `OrderStatus` (`PENDING`, `PAID`, `CANCELED`).
- Modelos (tabelas): `User` (`users`), `Category` (`categories`, auto-relação pai/filho), `Product` (`products`, `sku` único, índice em `name`), `Order` (`orders`), `OrderItem` (`order_items`, `price` é o snapshot da compra), `Payment` (`payments`, relação 1:1 com `Order` via `orderId` único).
- `tenantId` (default `"default"`) existe em `User`, `Product` e `Order`.

## Dependências Internas e Externas
- Externas: `prisma` (CLI), `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`. Variável `DATABASE_URL`.
- Internas: o client é instanciado em `src/config/database.js` e consumido pelos repositories e por `cartService`, `orderService` e `paymentService`.

## Módulos Relacionados
`src/config` (instancia o client), `src/modules/*` (todos os módulos de domínio com persistência), `docker-compose.yml` (PostgreSQL local).

## Pontos de Entrada
- `npm run migrate` (`prisma migrate dev`) e `npm run studio` (`prisma studio`), definidos em `package.json`.
- `prisma.config.ts`, lido pelo CLI do Prisma.

## Fluxos Importantes
- Alteração de schema: editar `schema.prisma`, rodar `npm run migrate` e regenerar o client.
- Checkout: `Order`, `OrderItem` e `Payment` são criados na mesma transação (`orderRepository.createOrderTransaction`).

## Arquivos Críticos
- `prisma/schema.prisma`
- `prisma.config.ts`

## Observações Técnicas e Débitos Identificados
- A pasta `prisma/migrations` (apontada por `prisma.config.ts`) **não existe no repositório**. As migrações não estão versionadas, então um ambiente novo não reproduz o schema de forma determinística.
- `Payment.status` é `String` livre (default `"AWAITING_CONFIRMATION"`), e não um enum. Valores inválidos não são barrados pelo banco.
- Não há constraint de banco impedindo `Product.stock` negativo (relevante para o checkout; ver `src/modules/orders/README.md`).
- `tenantId` existe no schema, mas não é filtrado pelos repositories (multi-tenancy incompleta; ver `docs/ARQUITETURA-DO-SISTEMA.md`, riscos nº 1 e nº 8).
- `OrderItem` e `Order` não definem `onDelete` explícito. Hipótese: o comportamento padrão do Prisma (restrição) vale.
