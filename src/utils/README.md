# src/utils

## Objetivo do Módulo
Fornecer utilitários puros e sem estado de negócio, reutilizáveis por qualquer camada da aplicação: uma classe de erro padronizada e helpers de geração/verificação de JWT.

## Responsabilidade Principal
Prover primitivas técnicas (erro de domínio, criptografia de token) sem conhecimento sobre regras de negócio específicas de nenhum módulo.

## Funcionalidades Existentes
- **`AppError.js`**: classe que estende `Error`, adicionando `statusCode` (default 500), `code` (default `'INTERNAL_SERVER_ERROR'`), `details` (default `{}`) e a flag `isOperational = true`. Usada em toda a aplicação para sinalizar erros esperados/tratáveis, em contraste com exceções não previstas.
- **`token.js`**: expõe 4 funções — `generateAccessToken(userId, role)`, `generateRefreshToken(userId)`, `verifyAccessToken(token)`, `verifyRefreshToken(token)` — todas baseadas em `jsonwebtoken`, lendo segredos e tempos de expiração de variáveis de ambiente (`JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION`).

## Dependências Internas e Externas
- **Externas**: `jsonwebtoken`.
- **Internas**: nenhuma (módulos folha, sem dependência de outros diretórios de `src/`).
- Consumido por: `src/middlewares/authMiddleware.js` (`verifyAccessToken`), `src/modules/auth/authService.js` (`generateAccessToken`, `generateRefreshToken`), e `AppError` é usado em praticamente todo `src/modules/*` e `src/middlewares/*`.

## Módulos Relacionados
- `src/modules/auth` (emissão de tokens no registro/login).
- `src/middlewares/authMiddleware.js` (verificação de token em toda rota protegida).
- `src/middlewares/errorHandler.js` (consome os campos definidos em `AppError`).

## Pontos de Entrada
Nenhum — módulos puramente utilitários, sem rota HTTP própria.

## Fluxos Importantes
- `generateAccessToken` inclui apenas `{ sub: userId, role }` no payload — **não inclui `tenantId`**, o que é relevante caso a multi-tenancy do schema Prisma venha a ser ativada de fato (ver `docs/ARQUITETURA-DO-SISTEMA.md`).
- `verifyRefreshToken` existe mas **não é chamado por nenhum controller/service** no código atual — não há endpoint de refresh implementado.

## Arquivos Críticos
- `token.js`: qualquer alteração no payload do JWT (ex.: adicionar/remover campos) impacta diretamente `authMiddleware` e qualquer lógica que dependa de `req.user`.
- `AppError.js`: contrato usado por `errorHandler.js`; mudanças nos nomes dos campos (`statusCode`, `code`, `details`) quebram o formato de resposta de erro em toda a API.

## Observações Técnicas e Débitos Identificados
- `verifyRefreshToken` é código morto do ponto de vista de uso em produção (função exportada, nunca importada) — débito ligado ao fluxo de refresh token não finalizado (ver módulo `auth`).
- Não há validação de presença das variáveis de ambiente de segredo JWT no boot da aplicação; a falha só ocorre em runtime, na primeira chamada a `jwt.sign`/`jwt.verify`.
