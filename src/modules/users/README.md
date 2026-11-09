# src/modules/users

## Objetivo do Módulo
Gerenciar dados de perfil de usuários já cadastrados: consulta, atualização e remoção, com controle de acesso "dono do recurso ou administrador".

## Responsabilidade Principal
CRUD de perfil de usuário (exceto criação, que é responsabilidade do módulo `auth`). Também expõe seu `userRepository` para reuso por `auth`.

## Funcionalidades Existentes
- `GET /api/v1/users/:id`: retorna o perfil (sem campo `password`). Usuário comum só pode ver o próprio perfil (bloqueado com 403 no controller se tentar ver outro ID); `ADMIN` pode ver qualquer perfil.
- `PUT /api/v1/users/:id`: atualiza dados do usuário. Regra "dono ou admin" aplicada no service; usuários comuns não podem alterar seu próprio `role` (campo removido do payload se o solicitante não for `ADMIN`).
- `DELETE /api/v1/users/:id`: remove o usuário. Mesma regra "dono ou admin".

## Dependências Internas e Externas
- **Internas**: `src/config/database.js` (Prisma), `src/middlewares/authMiddleware.js`, `src/utils/AppError.js`.
- **Externas**: nenhuma diretamente neste módulo (`bcrypt` **não** é usado aqui, apesar de o módulo lidar com atualização de dados de usuário — ver Observações).

## Módulos Relacionados
- `auth`: consome `userRepository` deste módulo diretamente (`findByEmail`, `create`) para registro/login.

## Pontos de Entrada
- `userRoutes.js`, montado em `server.js` como `app.use('/api/v1/users', userRoutes)`, com `router.use(authMiddleware)` aplicado a todas as rotas (não há rota pública).

## Fluxos Importantes
- `getProfile` (controller): decide o `userId` alvo a partir de `req.params.id` (com fallback para `req.user.sub` se o parâmetro não vier) e aplica a checagem de permissão **antes** de chamar o service — checagem de autorização parcialmente duplicada entre controller (checagem de leitura) e service (checagem de escrita em `update`/`delete`).
- `updateUser`/`deleteUser` (service): revalidam a regra "dono ou admin" de forma independente do controller, e `updateUser` também remove o campo `role` do payload se o solicitante não for `ADMIN`.

## Arquivos Críticos
- `userRepository.js`: é reutilizado por `auth`, então qualquer mudança de assinatura aqui (`create`, `findByEmail`, `findById`, `update`, `delete`) impacta dois módulos simultaneamente.
- `userService.js`: concentra a única lógica de autorização "dono ou admin" reimplementada em múltiplos métodos.

## Observações Técnicas e Débitos Identificados
- **Atualização de senha sem hashing**: `userService.updateUser` passa `data` diretamente para `userRepository.update`, incluindo `password` se enviado no payload, **sem** chamar `bcrypt.hash`. O próprio comentário no código admite a omissão ("Se houver senha, deveria ser hasheada aqui... omitido por brevidade"). Isso é uma inconsistência de segurança em relação a `authService.register`, que sempre hasheia.
- **Checagem de autorização duplicada e ligeiramente inconsistente**: `getProfile` no controller retorna JSON de erro `{ error: { message: 'Forbidden' } }` diretamente (sem passar por `AppError`/`errorHandler`), enquanto `updateUser`/`deleteUser` no service lançam `AppError` 403/`FORBIDDEN` (que passa pelo `errorHandler` e segue o formato padrão `{ error: { code, message, details } }`). Duas rotas do mesmo módulo retornam formatos de erro 403 diferentes.
- Não há validação de payload (`express-validator`) em `update` — campos como `email` poderiam ser alterados para um valor inválido ou duplicado sem validação explícita antes de bater no Prisma (a constraint `@unique` do schema apenas gera um erro genérico do Prisma, não tratado especificamente aqui como acontece em `authService`/`productService`).
- `findAll` existe em `userRepository.js` mas **não é usado por nenhum controller/service** — não há endpoint de listagem de usuários (`GET /api/v1/users`) implementado, apenas busca por ID.
- **Pendência de produto** (`docs/DECISOES-DE-PRODUTO.md`): a regra de exclusão de usuário com histórico de pedidos (bloquear, soft delete ou cascata) ainda **não foi decidida**.
