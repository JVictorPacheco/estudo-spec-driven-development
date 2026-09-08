# src/middlewares

## Objetivo do Módulo
Fornecer middlewares Express reutilizáveis para autenticação, tratamento de erro, logging de requisições HTTP e validação de payload — funcionalidades transversais (cross-cutting concerns) usadas por múltiplos módulos de domínio.

## Responsabilidade Principal
Interceptar o ciclo request/response do Express para aplicar regras que não são específicas de um único domínio de negócio.

## Funcionalidades Existentes
- **`authMiddleware.js`**: extrai o Bearer token do header `Authorization`, verifica o JWT de acesso (via `utils/token.js`) e popula `req.user = { sub, role }`. Lança `AppError` 401 se o token estiver ausente ou inválido.
- **`errorHandler.js`**: middleware de erro global do Express (4 argumentos). Lê `statusCode`/`message`/`code`/`details` de um `AppError` (ou usa defaults de erro 500 genérico), loga via Winston (nível `error` para 5xx, `warn` para os demais) e responde no formato `{ error: { code, message, details, stack? } }`.
- **`httpLogger.js`**: middleware baseado em `morgan`, formatando `:method :url :status :res[content-length] - :response-time ms` e enviando a saída para `logger.http(...)`. Só produz log quando `NODE_ENV === 'development'` (via função `skip`).
- **`requestLogger.js`**: middleware alternativo de log de requisição via `console.log` puro. **Não é utilizado em nenhum lugar do projeto** (ver Observações).
- **`validateRequest.js`**: lê o resultado de `express-validator` (`validationResult(req)`) e, se houver erros, lança `AppError` 400/`INVALID_PAYLOAD` com um mapa `{ campo: mensagem }` em `details`.

## Dependências Internas e Externas
- **Externas**: `jsonwebtoken` (via `utils/token.js`), `morgan`, `express-validator`.
- **Internas**: `src/utils/token.js`, `src/utils/AppError.js`, `src/config/logger.js`.
- Consumido por: `src/server.js` (`httpLogger`, `errorHandler` globalmente) e pelos arquivos `*Routes.js` de `orders`, `payments`, `users`, `categories`, `products` (`authMiddleware`); `auth` usa `validateRequest`.

## Módulos Relacionados
- `src/modules/*/**Routes.js`: decidem onde `authMiddleware` é aplicado (por rota, por router inteiro via `router.use`, ou globalmente em `server.js` — caso de `cart`).
- `src/modules/auth`: único módulo que usa `validateRequest` atualmente.

## Pontos de Entrada
Nenhum diretamente — são funções middleware montadas em `server.js` ou nos arquivos de rota dos módulos.

## Fluxos Importantes
- A ordem de montagem em `server.js` é: `helmet` → `compression` → `cors` → `express.json` → `express.urlencoded` → `httpLogger` → rotas → 404 handler → `errorHandler`. O `errorHandler` deve **sempre** ser o último middleware montado (requisito do Express para middlewares de erro).
- `authMiddleware` não é async e não faz nenhuma consulta a banco/Redis — a verificação é puramente criptográfica (JWT stateless), então revogação de token antes da expiração não é possível com o código atual.

## Arquivos Críticos
- `errorHandler.js`: qualquer mudança no formato de resposta de erro impacta todos os clientes da API.
- `authMiddleware.js`: ponto único de decisão de autenticação; um bug aqui compromete a segurança de todos os módulos protegidos.

## Observações Técnicas e Débitos Identificados
- **`requestLogger.js` é um módulo órfão** (confirmado por busca em todo `src/`: nenhum `require('.../requestLogger')` encontrado). Deve ser removido ou, se a intenção for reativá-lo, documentado por que coexiste com `httpLogger.js`.
- Não existe um middleware `adminOnly` ou `ownerOrAdmin` reutilizável aqui — a checagem de role `ADMIN` está duplicada dentro de `categoryRoutes.js` e `productRoutes.js`, e a checagem "dono ou admin" está duplicada dentro dos services de `users`. **Hipótese/recomendação**: extrair ambos para cá.
- `httpLogger.js` desativa logs HTTP fora de desenvolvimento — em produção não há rastro de requisições HTTP via este middleware, apenas os logs manuais dentro dos services.
- `validateRequest.js` só é usado pelo módulo `auth`; os demais módulos não têm validators de payload declarados, então dados inválidos podem chegar aos services sem validação estrutural prévia (dependem de validação implícita/erros do Prisma).
