# Decisões de Produto

> Registro das decisões de produto e de escopo tomadas em entrevista com o responsável pelo projeto (2026-11-09). Complementa `OBJETIVO-DO-SISTEMA.md` (o que o sistema faz hoje) e `ARQUITETURA-DO-SISTEMA.md` (como ele é construído). Aqui fica **o que o sistema deve ser**. Onde o código atual diverge de uma decisão, a divergência está marcada. Itens marcados como **Hipótese** são interpretações minhas, ainda não confirmadas.

## 1. Natureza do projeto

- Projeto de **estudo de Spec Driven Development**, sem produto real por trás. O domínio de e-commerce é o pretexto para praticar a escrita de specs antes do código.
- O dono está fazendo um curso e quer entender para onde ele leva. Por isso várias decisões abaixo são "manter como está" ou "pendência", e não rejeições definitivas.
- Modelo de negócio: **sem loja real, marketplace ou SaaS**. Nenhum requisito de multi-lojista ou de isolamento por cliente.

## 2. Decisões

| Tema | Decisão | Situação no código |
|---|---|---|
| Pagamento | **Simulado**, só para estudo. Sem gateway nem webhook. | Alinhado. Falta checagem de dono do pedido em `confirm`/`cancel` (risco nº 3 da arquitetura) |
| Conta ADMIN | Criada por **seed ou script fora da API**. O cadastro público sempre cria `USER`. | **Diverge**: `authService.register` aceita `role` do corpo (risco nº 15) |
| Estoque | **Não é devolvido** em cancelamento nem por expiração. É escolha deliberada. | Alinhado |
| `tenantId` | **Manter como está**, sem ação. Multi-tenancy continua incompleta. | Alinhado |
| Pedidos | Manter só a listagem dos **próprios pedidos**. Sem busca por id, visão de admin ou cancelamento pelo cliente. | Alinhado |
| Testes | **Sem testes por ora.** | Alinhado (`npm test` é placeholder) |
| Cupons | **Dentro do escopo.** Ver seção 3. | Não implementado |

## 3. Cupons de desconto (escopo aprovado, não implementado)

### Regras decididas
- Tipos: **percentual** e **valor fixo**.
- **Validade** (data de expiração) e **limite de usos**.
- **Restrição a categoria ou produto**: o desconto vale só sobre os itens elegíveis.
- Fora do escopo: valor mínimo do pedido.
- **Criação por seed por enquanto.** Uma rota de administração (CRUD por `ADMIN`) é evolução futura.
- **Um único cupom por pedido**, mesmo que o pedido tenha vários itens. O desconto incide sobre os itens elegíveis do pedido, conforme a restrição do cupom.
- O uso é **consumido no checkout** e **não é devolvido** se o pedido for cancelado. Isso é coerente com a regra do estoque.
- O cupom e o desconto são **congelados no pedido**: o `Order` guarda o código, o valor do desconto e o total final. O total nunca fica negativo.

### Onde a regra mora
**Só no checkout**, e não no carrinho. O cliente envia o código ao criar o pedido (`POST /api/v1/orders`).

Motivo: o checkout já revalida preço, estoque e status do produto. A validação do cupom entra no mesmo ponto e na mesma transação que consome o uso. No carrinho (Redis) o cupom poderia ficar guardado depois de expirar ou esgotar, e a regra ficaria em dois lugares.

Custo aceito: o cliente só vê o desconto no fim. Uma rota de pré-visualização, sem gravar nada, é **pendência** (ver seção 4), a ser feita conforme o caminho do curso, sem mudar o desenho.

### Proposta de modelo (Hipótese, para a spec detalhar)
- Modelo `Coupon`: código único, tipo (`PERCENT`/`FIXED`), valor, expiração, limite de usos, contador de usos e vínculo com categorias ou produtos elegíveis.
- `Order` ganha o código do cupom, o valor do desconto e mantém `totalValue` como o total final.
- O consumo do uso deve ser atômico na transação do checkout (incremento condicional ao limite), para evitar que dois pedidos simultâneos passem do limite.
- Erros de cupom devem usar `AppError` com código semântico (diretriz nº 8 da arquitetura).

## 4. Pendências

| Pendência | Detalhe |
|---|---|
| Rotas de refresh e logout | O refresh token é gravado no Redis e nunca lido. Decisão atual: manter como está e tratar como pendência futura. |
| Validators em todos os módulos | Hoje só `auth` valida entrada. Falta `express-validator` em `products`, `categories`, `cart`, `orders`, `users` e `payments` (diretriz nº 10). |
| Regra de exclusão com histórico | Apagar usuário com pedidos ou produto já comprado: bloquear (409), soft delete ou cascata. **Não decidido.** |
| Correção do cadastro com `role` | Implementar a decisão da seção 2 (admin só por seed). |
| Rota de administração de cupons | Evolução futura da seção 3. |
| Rota de pré-visualização de cupom | Calcula o desconto sem gravar nada e sem consumir o uso. Será feita conforme o caminho do curso. |

## 5. Perguntas em aberto

1. **Limite de usos**: vale no total, por usuário, ou os dois?
2. **Cupom esgotado ou expirado** no checkout: o pedido inteiro falha (409), ou o pedido segue sem o desconto?
3. **Arredondamento** do desconto percentual (casas decimais e regra de arredondamento).

## 6. Fora do escopo (por decisão ou por não ter sido pedido)

- Frete e endereço de entrega.
- Status de envio e entrega (`SHIPPED`, `DELIVERED`).
- Imagens e variações de produto.
- Gateway de pagamento real.
- Multi-lojista e multi-tenant efetivo.
- Valor mínimo do pedido para cupom.
