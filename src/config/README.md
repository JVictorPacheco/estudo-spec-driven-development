# src/config

## Objetivo do Módulo
Inicializar e expor como singletons os clientes de infraestrutura usados pela aplicação: banco de dados (Prisma/Postgres), cache (Redis) e logger (Winston).

## Responsabilidade Principal
Centralizar a criação de conexões/instâncias que devem existir uma única vez por processo, evitando que cada módulo de domínio crie sua própria conexão.

## Funcionalidades Existentes
- **`database.js`**: cria e exporta uma instância única de `PrismaClient`, usando `@prisma/adapter-pg` com a connection string de `DATABASE_URL`.
- **`redis.js`**: cria e exporta um cliente Redis (`redis` v5), conectando de forma assíncrona imediatamente após o `require`, e registrando handlers de log para eventos `error`/`connect`.
- **`logger.js`**: configura o Winston com níveis customizados (`error`, `warn`, `info`, `http`, `debug`), nível `debug` em desenvolvimento e `warn` em outros ambientes, com saída para console e para os arquivos `logs/error.log` e `logs/all.log`.

## Dependências Internas e Externas
- **Externas**: `@prisma/client`, `@prisma/adapter-pg`, `redis`, `winston`.
- **Internas**: `redis.js` depende de `logger.js` (para logar eventos de conexão).
- Consumido por: praticamente todos os módulos em `src/modules/*` (via `require('../../config/database')` e/ou `require('../../config/redis')`) e por `src/middlewares/errorHandler.js`/`httpLogger.js` (via `logger.js`).

## Módulos Relacionados
- `src/middlewares/httpLogger.js` e `src/middlewares/errorHandler.js` (consomem `logger.js`).
- Todos os `*Repository.js` em `src/modules/*` (consomem `database.js`).
- `authService`, `cartService`, `productService`, `orderService` (consomem `redis.js`).

## Pontos de Entrada
Não há pontos de entrada HTTP — este diretório é consumido exclusivamente via `require()` por outros módulos internos.

## Fluxos Importantes
- A conexão do Redis é aberta de forma **assíncrona e não bloqueante** logo no `require('./config/redis')` (IIFE `(async () => { ... })()`). Isso significa que o módulo pode ser importado antes da conexão estar de fato estabelecida — chamadas de `redisClient.get/set` feitas muito cedo no boot podem falhar se a conexão ainda não tiver sido concluída.
- O nível de log (`level()` em `logger.js`) é decidido dinamicamente por `NODE_ENV` a cada chamada, não fixado no boot.

## Arquivos Críticos
- `database.js`: qualquer mudança aqui (ex.: troca de adapter, pool de conexões) afeta todos os repositories do sistema.
- `redis.js`: ponto único de falha para carrinho (armazenamento primário), cache de produtos e refresh tokens.

## Observações Técnicas e Débitos Identificados
- Não há tratamento explícito de reconexão/retry configurado além do padrão da lib `redis` — falha de conexão inicial só é logada (`logger.error`), sem novo esforço de conexão programado neste arquivo.
- Não há healthcheck real de banco/Redis no endpoint `/health` de `server.js` (este módulo não expõe função de "ping" reaproveitável para isso) — **Hipótese**: seria natural adicionar um método `checkConnection()` aqui para uso no healthcheck.
- `database.js` não trata `prisma.$disconnect()` em shutdown gracioso (não há listener de `SIGTERM`/`SIGINT` em nenhum lugar do projeto).
