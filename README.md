# Fincheck API

API REST do Fincheck — controle de finanças pessoais (contas bancárias, categorias e transações).

Construída com **Fastify** + **Prisma** sobre **PostgreSQL (Supabase)**, com autenticação via **JWT próprio** (Bearer) e validação com **Zod**.

## Stack

- [Fastify 5](https://fastify.dev/) — servidor HTTP
- [Prisma 6](https://www.prisma.io/) — ORM
- [PostgreSQL](https://www.postgresql.org/) via [Supabase](https://supabase.com/)
- [Zod 4](https://zod.dev/) — validação de body/query/params
- [@fastify/jwt](https://github.com/fastify/fastify-jwt) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) — auth
- TypeScript · ESLint · tsx

## Pré-requisitos

- Node.js `>= 22.12`
- Yarn
- Um projeto no [Supabase](https://supabase.com/) (Postgres)

## Configuração

1. Instale as dependências:

   ```bash
   yarn install
   ```

2. Crie o arquivo `.env` a partir do exemplo:

   ```bash
   cp .env.example .env
   ```

3. Preencha as variáveis. As connection strings do Supabase ficam em **Connect → ORMs/Prisma** (ou em _Project Settings → Database_):

   ```bash
   # App
   PORT=3000

   # Segredo do JWT (gere um forte: openssl rand -hex 32)
   JWT_SECRET="..."

   # Conexão "pooled" (Transaction pooler, porta 6543) — usada pela aplicação
   DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

   # Conexão direta (porta 5432) — usada pelas migrations
   DIRECT_URL="postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
   ```

   > ⚠️ Se a senha tiver caracteres especiais (`@ : / # ?`), faça **URL-encode** (ex.: `@` → `%40`).
   > O prefixo do host do pooler pode ser `aws-0-` **ou** `aws-1-` dependendo do projeto — copie o host exato que o Supabase mostra.

4. Gere o Prisma Client e aplique o schema no banco:

   ```bash
   yarn prisma:generate
   yarn prisma:migrate     # prisma migrate deploy
   ```

## Rodando

```bash
yarn dev      # desenvolvimento (watch, tsx) — http://localhost:3000
yarn build    # compila para dist/
yarn start    # produção (node dist/main.js)
```

Healthcheck: `GET /health` → `{ "status": "ok" }`.

## Scripts

| Script | Descrição |
|---|---|
| `yarn dev` | Sobe a API em watch mode |
| `yarn build` | Compila TypeScript para `dist/` |
| `yarn start` | Roda a versão compilada |
| `yarn lint` | ESLint |
| `yarn prisma:generate` | Gera o Prisma Client |
| `yarn prisma:migrate` | Aplica as migrations (`migrate deploy`) |
| `yarn prisma:migrate:dev` | Cria/aplica migration em dev |
| `yarn prisma:studio` | Abre o Prisma Studio |

## Autenticação

- `POST /auth/signup` e `POST /auth/signin` são públicas e retornam `{ accessToken }`.
- As demais rotas exigem o header `Authorization: Bearer <accessToken>`.
- O token é um JWT com payload `{ sub: <userId> }` e expiração de `7d`.
- Senhas são armazenadas com hash `bcrypt` (12 rounds).
- No signup, o usuário já é criado com um conjunto padrão de **12 categorias** (receitas e despesas).

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|:---:|---|
| `POST` | `/auth/signin` | — | Login → `{ accessToken }` |
| `POST` | `/auth/signup` | — | Cadastro → `{ accessToken }` (+ categorias padrão) |
| `GET` | `/users/me` | ✅ | Dados do usuário logado |
| `POST` | `/bank-accounts` | ✅ | Cria conta bancária |
| `GET` | `/bank-accounts` | ✅ | Lista contas (com `currentBalance` calculado) |
| `PUT` | `/bank-accounts/:bankAccountId` | ✅ | Atualiza conta |
| `DELETE` | `/bank-accounts/:bankAccountId` | ✅ | Remove conta (`204`) |
| `GET` | `/categories` | ✅ | Lista categorias do usuário |
| `POST` | `/transactions` | ✅ | Cria transação |
| `GET` | `/transactions?month&year&bankAccountId?&type?` | ✅ | Lista transações por período |
| `PUT` | `/transactions/:transactionId` | ✅ | Atualiza transação |
| `DELETE` | `/transactions/:transactionId` | ✅ | Remove transação (`204`) |

Respostas de erro seguem o formato `{ statusCode, error, message }` (erros de validação do Zod incluem também `issues`).

## Estrutura

```
src/
  main.ts                  # bootstrap (listen)
  server.ts                # cria o Fastify, plugins, error handler e registra as rotas
  env.ts                   # validação das variáveis de ambiente (Zod)
  lib/                     # prisma client e classes de erro
  plugins/auth.ts          # @fastify/jwt + preHandler `authenticate`
  @types/fastify.d.ts      # augmentations (request.userId, app.authenticate)
  modules/
    auth/                  # signin, signup
    users/                 # /users/me
    bank-accounts/         # CRUD + cálculo de saldo
    categories/            # listagem
    transactions/          # CRUD + filtro por período
prisma/
  schema.prisma            # modelos User, BankAccount, Category, Transaction
  migrations/              # migrations versionadas
```

Cada módulo segue o padrão `*.routes.ts` (rotas), `*.service.ts` (regra de negócio), `*.schemas.ts` (validação Zod) e `validate-ownership.ts` (garante que o recurso pertence ao usuário).
