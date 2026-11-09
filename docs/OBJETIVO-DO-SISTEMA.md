# Objetivo do Sistema

> Documento gerado por análise estática do código-fonte (`src/modules/*`, `prisma/schema.prisma`, `README.md`). Descreve o propósito de negócio inferido a partir das funcionalidades efetivamente implementadas. Trechos não confirmáveis diretamente pelo código estão marcados como **"Hipótese"**.

## 1. Propósito Principal do Sistema

O sistema é uma **API RESTful de backend para uma plataforma de e-commerce** (confirmado pelo `README.md`: "API E-commerce Node.js"), responsável por expor os recursos necessários para um cliente (web/mobile, não incluído neste repositório) operar um fluxo completo de compra: autenticação de usuários, catálogo de produtos e categorias, carrinho de compras, criação de pedidos e processamento de pagamento.

Não há, no código analisado, nenhuma interface gráfica (frontend), aplicativo mobile ou painel administrativo — apenas a API. **Hipótese**: o frontend/admin consumidor desta API é mantido em outro repositório, fora do escopo desta análise.

## 2. Problemas que o Sistema Resolve

Com base nas funcionalidades implementadas, o sistema resolve os seguintes problemas de negócio:

- **Gestão de identidade e acesso**: cadastro e login de usuários com emissão de tokens JWT, diferenciando usuários comuns (`USER`) de administradores (`ADMIN`).
- **Catalogação de produtos**: organização de produtos em categorias hierárquicas (categoria pai/filho), com controle de estoque, preço, SKU único e status (`ACTIVE`/`INACTIVE`).
- **Descoberta de produtos**: listagem paginada com busca textual (nome/descrição) e filtro por categoria, com cache para reduzir carga no banco em picos de acesso.
- **Persistência de intenção de compra (carrinho)**: manutenção de um carrinho por usuário com validação de estoque em tempo real ao adicionar itens, sobrevivendo por até 30 dias sem finalização (TTL Redis).
- **Conversão de carrinho em pedido (checkout)**: transformação atômica do carrinho em um pedido formal, com revalidação de preço/estoque/disponibilidade no momento da confirmação (proteção contra dados desatualizados do carrinho).
- **Controle de ciclo de vida do pagamento**: criação, confirmação (com idempotência via header `Idempotency-Key`) e cancelamento de pagamentos, sincronizando o status do pedido (`PENDING` → `PAID`/`CANCELED`).
- **Administração de contas de usuário**: consulta, atualização e remoção de perfis, respeitando a regra "o próprio usuário ou um administrador".

## 3. Principais Fluxos de Negócio

### 3.1 Cadastro e Autenticação
1. Usuário se registra (`POST /api/v1/auth/register`) com nome, email e senha.
2. Sistema garante unicidade de email, hasheia a senha (`bcrypt`) e cria o usuário com papel padrão `USER`.
3. Sistema emite `accessToken` (JWT curto) e `refreshToken` (JWT longo, persistido no Redis).
4. Login (`POST /api/v1/auth/login`) segue o mesmo padrão de emissão de tokens após validar credenciais.

*Observação*: não há endpoint de refresh de token implementado, então na prática o `refreshToken` emitido não é hoje utilizável pelo cliente (ver `docs/ARQUITETURA-DO-SISTEMA.md`, item de riscos nº 13).

### 3.2 Navegação de Catálogo
1. Qualquer visitante (sem autenticação) pode listar categorias e produtos, e consultar detalhes de um produto específico.
2. Administradores podem criar, atualizar e excluir categorias e produtos (`adminOnly`), incluindo controle de estoque e preço.
3. Exclusão de categoria com produtos associados é bloqueada (erro de conflito, mapeado a partir de violação de FK do Postgres).

### 3.3 Montagem do Carrinho
1. Usuário autenticado adiciona um item (`POST /api/v1/cart/items`) informando `productId` e `quantity`.
2. Sistema valida existência do produto e estoque disponível antes de gravar no carrinho (Redis).
3. Itens repetidos somam quantidade, revalidando estoque total.
4. Usuário pode remover itens (`DELETE /api/v1/cart/items/:itemId`) e consultar o carrinho a qualquer momento (`GET /api/v1/cart`).

### 3.4 Checkout (Criação de Pedido)
1. Usuário aciona `POST /api/v1/orders` (checkout).
2. Sistema recupera o carrinho do Redis; carrinho vazio bloqueia o checkout.
3. Para cada item, o sistema revalida produto, estoque e status `ACTIVE`, recalculando o preço a partir do catálogo atual (não confia no preço salvo no carrinho).
4. Em uma transação atômica: decrementa estoque de cada produto, cria o `Order` com seus `OrderItem`s (preço "congelado"/snapshot) e cria um `Payment` inicial (`AWAITING_CONFIRMATION`).
5. Carrinho é limpo no Redis e um evento `order.created` é registrado em log (não publicado externamente).

### 3.5 Processamento de Pagamento
1. Um `Payment` normalmente já existe após o checkout, mas há uma rota (`POST /api/v1/payments`) para criá-lo isoladamente a partir de um `orderId`, caso necessário.
2. Confirmação (`POST /api/v1/payments/:id/confirm`) exige header `Idempotency-Key`, evita reprocessar pagamentos já `PAID`, e — em transação — atualiza `Payment.status = PAID` e `Order.status = PAID`. Um evento `order.paid` é registrado em log.
3. Cancelamento (`POST /api/v1/payments/:id/cancel`) atualiza `Payment.status = CANCELED` e `Order.status = CANCELED` (não há devolução de estoque implementada — ver riscos técnicos).

### 3.6 Gestão de Conta
1. Usuário autenticado pode ver seu próprio perfil (`GET /api/v1/users/:id`); administradores podem ver o perfil de qualquer usuário.
2. Atualização e remoção de conta seguem a regra "dono do recurso ou ADMIN"; usuários comuns não podem alterar seu próprio `role`.

## 4. Atores Envolvidos

| Ator | Descrição | Evidência no código |
|---|---|---|
| **Usuário comum (`USER`)** | Cliente final que se cadastra, navega no catálogo, monta carrinho, finaliza pedidos e paga | `Role.USER` (default no schema), rotas protegidas por `authMiddleware` |
| **Administrador (`ADMIN`)** | Gerencia catálogo (produtos/categorias) e tem acesso irrestrito a contas de usuário | `Role.ADMIN`, checagens `adminOnly` em `categoryRoutes`/`productRoutes`, bypass de restrição em `userService` |
| **Sistema de pagamento externo (gateway)** | Contraparte que confirmaria/cancelaria pagamentos via `externalId` no modelo `Payment` | Campo `Payment.externalId` existe no schema, mas nenhuma integração real (webhook/SDK) está implementada — **Hipótese**: a rota `confirm`/`cancel` simula o que seria um webhook desse gateway |
| **Cliente da API (frontend/app)** | Consumidor HTTP autenticado via Bearer token | Implícito em todo o design da API (não incluído neste repositório) |

## 5. Funcionalidades Centrais

- Autenticação com JWT (access + refresh, este último parcialmente implementado).
- CRUD de categorias hierárquicas.
- CRUD de produtos com busca, paginação e cache.
- Carrinho de compras persistido em Redis com validação de estoque.
- Checkout transacional com revalidação de preço/estoque/disponibilidade.
- Gestão de pedidos (listagem por usuário, criação via checkout).
- Ciclo de vida de pagamento (criar intenção, confirmar com idempotência, cancelar).
- Gestão de perfil de usuário com controle de acesso por papel.
- Suporte estrutural (não totalmente ativo) a multi-tenancy via campo `tenantId`.

## 6. Visão de Produto

**Hipótese, confirmada em 2026-11-09 (ver seção 8)** (não confirmável apenas pelo código, inferida do conjunto de funcionalidades e do nome do repositório "Spec Driven Development"): este projeto parece ser um **projeto de estudo/referência para o método Spec Driven Development aplicado a uma API de e-commerce**, servindo como base para a prática de escrever especificações técnicas antes da implementação. Isso é reforçado por:
- Comentários no código indicando decisões deliberadamente simplificadas ("omitido por brevidade", "simulado", "para simplificar transaction").
- Ausência de integração real com gateway de pagamento (apenas estrutura de dados e fluxo simulado).
- Multi-tenancy modelada no schema mas não implementada de ponta a ponta — sugere um recurso planejado para uma fase futura de evolução, não uma prioridade atual do produto.

Ainda assim, o desenho de domínio (catálogo, carrinho, checkout, pagamento) é consistente com o de uma **plataforma de e-commerce transacional genérica** (não vertical-específica — não há campos específicos de um nicho, como moda, alimentos, etc.).

## 7. Contexto Operacional do Sistema

- **Ambiente de execução**: containerizado via Docker (`Dockerfile` baseado em `node:20-alpine`), orquestrado com PostgreSQL 15 e Redis 7 via `docker-compose.yml` para desenvolvimento/local.
- **Configuração**: totalmente baseada em variáveis de ambiente (`.env`), incluindo segredos JWT, credenciais de banco e Redis — não há suporte a múltiplos ambientes (dev/staging/prod) via arquivos de config separados, apenas `NODE_ENV`.
- **Observabilidade**: logging estruturado via Winston (`logs/error.log`, `logs/all.log`, console), com nível de log reduzido (`warn`) fora de desenvolvimento. Não há métricas (Prometheus/OpenTelemetry) nem tracing distribuído implementados.
- **Escala**: processo único Node.js sem clustering nem PM2 configurado no `Dockerfile`/`docker-compose.yml` — **Hipótese**: escalabilidade horizontal dependeria de infraestrutura externa (ex.: réplicas do container atrás de um load balancer), não há configuração disso no repositório.
- **Segurança de borda**: `helmet` (headers HTTP seguros) e `cors` (aberto, sem allowlist configurada) aplicados globalmente; `compression` para reduzir payload de resposta.
- **Documentação de API**: dependência `swagger-ui-express`/`yamljs` presente no `package.json`, mas o carregamento do Swagger está **comentado** em `server.js` — ou seja, não há documentação Swagger ativa hoje, apenas a intenção/infraestrutura para isso.

## 8. Decisões de Produto Confirmadas

O responsável pelo projeto confirmou (2026-11-09) que se trata de um **projeto de estudo de SDD**, o que transforma a "Hipótese" da seção 6 em fato. As decisões completas, o escopo de **cupons de desconto** (aprovado, ainda não implementado), as pendências e as perguntas em aberto estão em [`DECISOES-DE-PRODUTO.md`](DECISOES-DE-PRODUTO.md). Em resumo: pagamento simulado, admin criado por seed, estoque não devolvido no cancelamento, `tenantId` mantido como está e sem testes por ora.

---
*Este documento descreve o propósito do sistema com base no comportamento observável do código. Deve ser atualizado sempre que uma nova funcionalidade de negócio for adicionada, removida ou tiver seu fluxo alterado.*
