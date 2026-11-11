# Fincheck API

API REST do Fincheck — controle de finanças pessoais (contas bancárias, cartões, categorias, transações parceladas e dashboard).

Construída com **Fastify** + **Prisma** sobre **PostgreSQL (Supabase)**, com autenticação via **JWT próprio** (Bearer) e validação com **Zod**.

O front-end fica no repositório [`fincheck-web`](https://github.com/jhon-alves/fincheck-web). Para regras de negócio, convenções e cuidados com o banco, veja o [`AGENTS.md`](AGENTS.md).

## Stack

- [Fastify 5](https://fastify.dev/) — servidor HTTP
- [Prisma 6](https://www.prisma.io/) — ORM
- [PostgreSQL](https://www.postgresql.org/) via [Supabase](https://supabase.com/)
- [Zod 4](https://zod.dev/) — validação de body/query/params
- [@fastify/jwt](https://github.com/fastify/fastify-jwt) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) — auth
- TypeScript · ESLint · tsx

## Pré-requisitos

- Node.js `>= 22.12`
- npm
- Um projeto no [Supabase](https://supabase.com/) (Postgres)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
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
   npm run prisma:generate
   npm run prisma:migrate     # prisma migrate deploy
   ```

## Rodando

```bash
npm run dev      # desenvolvimento (watch, tsx) — http://localhost:3000
npm run build    # compila para dist/
npm start        # produção (node dist/main.js)
npm test         # testes (node:test via tsx)
```

> Variáveis já exportadas no shell têm prioridade sobre o `.env`. Se o terminal tiver um `DATABASE_URL` de outro projeto, rode `env -u DATABASE_URL -u DIRECT_URL npm run dev`.

Os testes cobrem a divisão de parcelas e a agenda de recorrência (dia fixo, dia útil e feriados nacionais).

Healthcheck: `GET /health` → `{ "status": "ok" }`.

O CORS libera qualquer origem e os métodos `GET, HEAD, POST, PUT, PATCH, DELETE` (o `@fastify/cors` v11 só libera `GET, HEAD, POST` por padrão).

## Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Sobe a API em watch mode |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Roda a versão compilada |
| `npm run lint` | ESLint |
| `npm test` | Testes (`node:test` via `tsx`) |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Aplica as migrations (`migrate deploy`) |
| `npm run prisma:migrate:dev` | Cria/aplica migration em dev |
| `npm run prisma:studio` | Abre o Prisma Studio |
| `npm run seed` | Cria o usuário demo com contas, cartões e parcelas (só em banco de desenvolvimento) |

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
| `GET` | `/categories` | ✅ | Lista categorias (padrão primeiro), com `isDefault`, `color`, `transactionsCount` e `recurringRulesCount` |
| `POST` | `/categories` | ✅ | Cria categoria personalizada (`201`) |
| `PUT` | `/categories/:categoryId` | ✅ | Atualiza personalizada (`403` nas padrão) |
| `DELETE` | `/categories/:categoryId?moveToCategoryId=` | ✅ | Exclui personalizada; com lançamentos, move antes para `moveToCategoryId` (`403` nas padrão) |
| `GET` | `/cards?includeArchived` | ✅ | Lista cartões, com `usedLimit` e `availableLimit` (crédito) |
| `POST` | `/cards` | ✅ | Cria cartão (`201`) |
| `PUT` | `/cards/:cardId` | ✅ | Atualiza cartão (inclui `archived`) |
| `DELETE` | `/cards/:cardId` | ✅ | Remove cartão **e os lançamentos feitos com ele** (`204`) |
| `POST` | `/transactions` | ✅ | Cria transação (`201`). Parcelada devolve a lista de parcelas |
| `GET` | `/transactions` | ✅ | Lista transações (filtros abaixo), ordenadas da mais recente |
| `GET` | `/transactions/calendar?month&year` | ✅ | Agregado por dia: `[{ date, income, expense, count, hasInstallments, hasRecurring }]` |
| `GET` | `/transactions/installments/:installmentGroupId` | ✅ | Todas as parcelas de um parcelamento, em ordem |
| `PATCH` | `/transactions/:transactionId/confirm` | ✅ | Confirma o pagamento/recebimento (body opcional `{ paid: false }` desfaz) |
| `PUT` | `/transactions/:transactionId?scope=` | ✅ | Atualiza transação / parcelas |
| `DELETE` | `/transactions/:transactionId?scope=` | ✅ | Remove transação / parcelas (`204`) |
| `POST` | `/transfers` | ✅ | Cria transferência entre contas (`201`) |
| `PUT` | `/transfers/:transferId` | ✅ | Atualiza transferência |
| `DELETE` | `/transfers/:transferId` | ✅ | Remove transferência (`204`) |
| `GET` | `/dashboard/summary?month&year&today?` | ✅ | KPIs da Home numa chamada só |
| `GET` | `/recurring-rules` | ✅ | Regras recorrentes, com a próxima ocorrência, o total mensal equivalente e o status |
| `POST` | `/recurring-rules` | ✅ | Cria a regra e as ocorrências da janela (`201`) |
| `PUT` | `/recurring-rules/:ruleId` | ✅ | Edita a regra e refaz as ocorrências não pagas e não destacadas |
| `DELETE` | `/recurring-rules/:ruleId` | ✅ | Exclui a regra e as ocorrências não pagas (as pagas ficam) (`204`) |
| `POST` | `/recurring-rules/:ruleId/end` | ✅ | `{ action: 'end', date? }` encerra; `pause` / `resume` pausa ou reativa |

Respostas de erro seguem o formato `{ statusCode, error, message }` (erros de validação do Zod incluem também `issues`).

### Convenções

- **Mês**: `month` vai de `0` (janeiro) a `11` (dezembro), como no `Date` do JavaScript.
- **Datas**: o front envia `YYYY-MM-DD` e a API grava às **12:00 UTC** daquele dia, então a data não "pula" de dia por causa do fuso. ISO com horário ainda é aceito (usa só a parte da data).

### Transações

`POST /transactions`

```jsonc
{
  "type": "EXPENSE",                 // INCOME | EXPENSE
  "name": "Notebook",
  "date": "2026-11-10",
  "categoryId": "<uuid>",            // precisa ser do mesmo tipo da transação
  "paymentMethod": "CREDIT_CARD",    // ACCOUNT (padrão) | PIX | CASH | CREDIT_CARD | DEBIT_CARD
  "cardId": "<uuid>",                // obrigatório para cartão
  "bankAccountId": "<uuid>",         // obrigatório para ACCOUNT / PIX / CASH
  "value": 1299,                     // ou "totalValue" — valor total
  "installments": 10,                // 1 a 48 (só saídas)
  "paid": false,                     // opcional; crédito nasce pendente, o resto nasce pago
  "notes": "opcional"
}
```

Regras:

- **Crédito**: `bankAccountId` fica nulo e a compra **não abate o saldo** da conta; ela consome o limite do cartão enquanto estiver pendente.
- **Débito**: a transação recebe automaticamente a conta vinculada ao cartão e abate o saldo normalmente.
- **Parcelamento** (2 a 48x, só `EXPENSE`): cria N transações num `prisma.$transaction`, com o mesmo `installmentGroupId`, `installmentNumber` (1..N) e `installmentsTotal` (N). A parcela `i` cai em `addMonths(data, i - 1)` (31/jan → 28/fev → 31/mar). Os centavos são truncados e a diferença vai para a última parcela (R$ 100 em 3x = 33,33 + 33,33 + 33,34). Só a 1ª parcela pode nascer paga. O nome é salvo sem sufixo — o "3/10" é montado no front.

`PUT` / `DELETE /transactions/:id?scope=one|following|all` — escopo como no Google Agenda ("só esta", "esta e as próximas", "todas"). Fora de um parcelamento o escopo é sempre `one`. No `PUT`, `value` é o valor de cada parcela e `paid` vale só para a parcela editada; se a data mudar, as demais parcelas do escopo andam junto, mantendo um mês entre elas.

`GET /transactions` — filtros: `month` + `year` **ou** `from` + `to` (`YYYY-MM-DD`, inclusive), `bankAccountId` (origem ou destino), `cardId`, `categoryId`, `type` (`INCOME | EXPENSE | TRANSFER`), `paymentMethod`, `paid` (`true | false`) e `search` (nome, sem diferenciar maiúsculas). Cada item traz `category`, `bankAccount`, `toBankAccount` e `card { name, brand, lastDigits, color, kind }`.

### Lançamentos recorrentes

A recorrência é uma **regra** (`RecurringRule`, o molde) e as ocorrências viram `Transaction`s de verdade, numa **janela móvel de 12 meses** à frente. Assim aparecem no extrato, no calendário e na Home como as parcelas.

- **Criar:** `POST /transactions` com `recurrence: { frequency, dayRule, dayOfMonth?, businessDayN?, endDate?, maxOccurrences?, autoConfirm }` (ou `POST /recurring-rules`). `frequency`: `WEEKLY | MONTHLY | YEARLY`. `dayRule`: `FIXED_DAY` (31 vira o último dia do mês) ou `BUSINESS_DAY` (N-ésimo dia útil, só mensal). Não combina com parcelamento.
- **Geração idempotente:** `ensureRecurringOccurrences(userId, until)` cria só o que falta (`createMany` com `skipDuplicates` sobre `@@unique([recurringRuleId, occurrenceDate])`, e no máximo uma ocorrência por período). Roda ao criar/editar a regra e no início de `GET /transactions`, `/transactions/calendar` e `/dashboard/summary` quando o período pedido passa da janela já gerada (`generatedUntil`). O resultado fica em cache por 60 s por usuário, e qualquer alteração em regras ou ocorrências limpa esse cache.
- **Dia útil:** segunda a sexta, sem os feriados nacionais fixos e sem Carnaval, Sexta-feira Santa e Corpus Christi (`src/modules/recurring/business-days.ts`, com testes).
- **Status:** as ocorrências nascem previstas (`paid: false`) e **não mexem no saldo**. Confirmação com `PATCH /transactions/:id/confirm` ou automática (`autoConfirm`) quando a data chega. O `currentBalance` das contas só considera lançamentos pagos.
- **Escopo** em `PUT`/`DELETE /transactions/:id?scope=`: `one` edita só a ocorrência e a marca como destacada (`isDetached`); `following` encerra a regra na véspera e cria outra a partir daquela ocorrência; `all` atualiza a regra e refaz as não pagas e não destacadas. O histórico já pago nunca é reescrito.
- **Excluir uma ocorrência (`scope=one`):** a data vai para `skippedDates` da regra, que não a recria. Escolhemos essa lista de exceções em vez de soft delete para não precisar filtrar `deletedAt` em todas as consultas.
- **Cartão de crédito:** assinaturas futuras não consomem o limite; só passam a contar quando a data chega.

### Categorias

- **Padrão** (`isDefault: true`): as 12 criadas no signup (`src/modules/categories/default-categories.ts`). Não podem ser editadas nem excluídas: `PUT`/`DELETE` respondem `403` com "Categorias padrão não podem ser alteradas".
- **Personalizadas**: nome único por usuário e tipo, sem diferenciar maiúsculas (`409` se repetir). `icon` e `color` são chaves do front (ex.: `paw-print`, `violet`). O tipo não muda se a categoria já tem lançamentos.
- **Excluir com lançamentos**: `DELETE /categories/:id?moveToCategoryId=<outra do mesmo tipo>` move os lançamentos e exclui numa `prisma.$transaction`. Sem o destino, responde `400` informando quantos lançamentos existem.

### Cartões

- Só `lastDigits` e `brand` vão para a API: **o número completo e o CVV nunca são enviados nem salvos**. O body é estrito — campos desconhecidos (ex.: `number`, `cvv`) são recusados com `400`.
- Crédito exige `creditLimit`, `closingDay` e `dueDay` (1–31). Débito exige `bankAccountId` (a conta de onde o dinheiro sai) e ignora limite e dias.
- `usedLimit` = compras no crédito ainda pendentes (inclui parcelas futuras).

### Dashboard

`GET /dashboard/summary?month&year&today=YYYY-MM-DD` devolve:

- `totalBalance` — soma do `currentBalance` das contas;
- `current` e `previous` — `{ income, expense, savings, openInvoices }` do mês e do mês anterior (`openInvoices` = compras no crédito pendentes no mês);
- `expensesByCategory` — top 5 categorias de saída + "Outros";
- `history` — entradas × saídas dos últimos 6 meses;
- `cards` — cartões ativos com limite;
- `upcoming` — pendentes dos próximos 7 dias (`transactions`, sem compras no crédito) e faturas a vencer (`invoices`, com o valor em aberto no período de fechamento);
- `recentTransactions` — os 5 lançamentos mais recentes até hoje.

## Banco de dados e segurança

- **RLS**: todas as tabelas do schema `public` têm Row Level Security ligado, sem políticas. A API conecta como `postgres` (dono das tabelas, ignora o RLS); os papéis públicos do Supabase (`anon`, `authenticated`) não enxergam nada. Toda migration que criar uma tabela nova precisa ligar o RLS nela.
- **Data API**: a API REST automática do Supabase (PostgREST) está desligada no painel, porque o app só acessa o banco por esta API.
- **Migrations**: `prisma migrate dev` exige terminal interativo; o passo a passo com `prisma migrate diff` está no [`AGENTS.md`](AGENTS.md#criando-uma-migration).
- **Desempenho**: o Prisma usa a preview feature `relationJoins`, então cada `include` vira um JOIN numa consulta só.

## Estrutura

```
src/
  main.ts                  # bootstrap (listen)
  server.ts                # cria o Fastify, plugins, error handler e registra as rotas
  env.ts                   # validação das variáveis de ambiente (Zod)
  lib/                     # prisma client, classes de erro e datas (YYYY-MM-DD ↔ 12:00 UTC)
  plugins/auth.ts          # @fastify/jwt + preHandler `authenticate`
  @types/fastify.d.ts      # augmentations (request.userId, app.authenticate)
  modules/
    auth/                  # signin, signup (cria as categorias padrão)
    users/                 # /users/me
    bank-accounts/         # CRUD + cálculo de saldo
    categories/            # CRUD, categorias padrão e mover lançamentos ao excluir
    cards/                 # CRUD de cartões + limite + regras de fatura
    transactions/          # CRUD, parcelamento, escopo, calendário, confirmação
    transfers/             # transferências entre contas
    recurring/             # regras recorrentes, agenda, dias úteis e feriados
    dashboard/             # /dashboard/summary
prisma/
  schema.prisma            # User, BankAccount, Category, Card, Transaction, RecurringRule
  migrations/              # migrations versionadas
  seed.ts                  # usuário demo para desenvolvimento
```

Cada módulo segue o padrão `*.routes.ts` (rotas), `*.service.ts` (regra de negócio), `*.schemas.ts` (validação Zod) e `validate-ownership.ts` (garante que o recurso pertence ao usuário).
