# API E-commerce Node.js

API RESTful modular construída com Node.js, Express, Prisma (PostgreSQL) e Redis.

## Pré-requisitos

- Node.js LTS (v18+)
- Docker e Docker Compose

## Configuração

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Database
DATABASE_URL=postgresql://admin:admin123@localhost:5432/api_ecommerce

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=seu-secret-super-seguro-min-32-chars
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_SECRET=seu-secret-refresh-super-seguro
JWT_REFRESH_EXPIRATION=7d

# Application
NODE_ENV=development
PORT=3000
```

### 3. Subir Infraestrutura (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 4. Aplicar Migrações do Banco

```bash
npm run migrate
```

## Rodando a API

- Desenvolvimento:
  ```bash
  npm run dev
  ```

## Estrutura

- **src/modules**: Contém a lógica de negócio dividida por domínio (Auth, Cart, Users, etc).
- **src/config**: Configurações de DB, Redis, Logger.
- **src/middlewares**: Middlewares globais (Erro, Auth, Logging).

## Endpoints Principais

- `POST /api/v1/auth/register`: Criar conta
- `POST /api/v1/auth/login`: Login
- `GET /api/v1/cart`: Ver carrinho (Requer Auth Header `Authorization: Bearer <token>`)
- `POST /api/v1/cart/items`: Adicionar item ao carrinho

## Documentação

- `docs/OBJETIVO-DO-SISTEMA.md` e `docs/ARQUITETURA-DO-SISTEMA.md`: documentos globais (base do Spec-Driven Development).
- `docs/DECISOES-DE-PRODUTO.md`: decisões de produto, escopo de cupons, pendências e perguntas em aberto.
- Cada pasta de `src/` e `prisma/` tem um `README.md` local.
- `npm run docs:check`: verifica se todo README local e os documentos globais existem com as seções padrão. Rode antes de concluir qualquer spec.
