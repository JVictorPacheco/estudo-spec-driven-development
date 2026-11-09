# src/modules/auth

## Objetivo do Módulo
Gerenciar o cadastro (registro) e a autenticação (login) de usuários, emitindo tokens JWT de acesso e refresh.

## Responsabilidade Principal
Validar credenciais/dados de entrada, criar contas de usuário, autenticar usuários existentes e emitir tokens. **Não** possui responsabilidade sobre autorização por rota (isso é feito por `authMiddleware`, fora deste módulo) nem sobre CRUD de perfil (responsabilidade de `users`).

## Funcionalidades Existentes
- `POST /api/v1/auth/register`: cria um novo usuário (`name`, `email`, `password`, `role` opcional), hasheando a senha com `bcrypt` (custo 10), bloqueando emails duplicados (409), e retornando dados do usuário + par de tokens.
- `POST /api/v1/auth/login`: autentica por email/senha (`bcrypt.compare`) e retorna dados do usuário + novo par de tokens.
- Validação de payload via `express-validator` (`authValidators.js`): nome obrigatório, email válido, senha mínima de 6 caracteres no registro; email válido e senha obrigatória no login.

## Dependências Internas e Externas
- **Internas**:
  - `src/modules/users/userRepository.js` — este módulo **não tem repository próprio**, reutiliza diretamente o repository de `users` para `findByEmail`/`create`.
  - `src/utils/AppError.js`, `src/utils/token.js` (geração de tokens).
  - `src/config/redis.js` (grava `refresh:<userId>` com TTL de 7 dias).
  - `src/middlewares/validateRequest.js`.
- **Externas**: `bcrypt`, `express-validator`.

## Módulos Relacionados
- `users`: fonte dos dados de usuário (acoplamento direto via `userRepository`, não via `userService`).
- Todos os módulos protegidos por `authMiddleware` dependem indiretamente dos tokens emitidos aqui.

## Pontos de Entrada
- `authRoutes.js`, montado em `server.js` como `app.use('/api/v1/auth', authRoutes)` — **sem** `authMiddleware` (rotas públicas, como esperado para registro/login).

## Fluxos Importantes
1. **Registro**: valida payload → checa email duplicado → hasheia senha → cria usuário → gera tokens → persiste refresh token no Redis → retorna usuário (sem senha) + tokens.
2. **Login**: valida payload → busca usuário por email → compara senha com hash → gera tokens → persiste refresh token no Redis → retorna usuário (sem senha) + tokens.

## Arquivos Críticos
- `authService.js`: concentra toda a regra de negócio de identidade; qualquer falha aqui compromete o acesso a todo o sistema.
- `authValidators.js`: única barreira de validação estrutural de payload no módulo.

## Observações Técnicas e Débitos Identificados
- **Acoplamento direto ao repository de outro módulo** (`../users/userRepository`), em vez de passar por `userService` — viola a diretriz de comunicação entre módulos descrita em `docs/ARQUITETURA-DO-SISTEMA.md`.
- **Refresh token é gerado e persistido, mas nunca consumido**: não existe endpoint `/api/v1/auth/refresh` nem qualquer leitura da chave `refresh:<userId>` no Redis. Trata-se de uma funcionalidade parcialmente implementada.
- `register` aceita `role` vindo do payload do cliente sem restrição — **qualquer chamador pode se autocadastrar como `ADMIN`** enviando `role: "ADMIN"` no corpo da requisição, pois `authValidators.js` não valida/restringe esse campo e `authService.register` usa `role || 'USER'` sem checagem adicional. Este é um risco de segurança relevante (privilege escalation no cadastro).
- Não há endpoint de logout — o refresh token no Redis não tem mecanismo de invalidação manual antes do TTL de 7 dias (mitigado apenas pela expiração natural, já que o próprio fluxo de refresh não está implementado).
- **Decisão de produto** (`docs/DECISOES-DE-PRODUTO.md`): conta `ADMIN` só por seed ou script fora da API, e o cadastro público deve sempre criar `USER`. O código atual diverge (autocadastro com `role`). Rotas de refresh e logout são pendência futura.
