# AGENTS.md — Fincheck API

Guia para agentes de código (e pessoas) que vão mexer neste repositório. Leia antes de alterar qualquer coisa.

## O projeto

O Fincheck é um app de finanças pessoais: contas bancárias, cartões, categorias, lançamentos (à vista, parcelados e recorrentes), transferências, calendário e um dashboard com indicadores do mês.

São dois repositórios, normalmente lado a lado na mesma pasta:

| Repositório | Papel |
|---|---|
| `fincheck-api` (este) | API REST em Fastify + Prisma, banco PostgreSQL no Supabase |
| `fincheck-web` | Front-end em React + Vite que consome esta API (`VITE_API_URL`) |

Toda a interface e as mensagens de erro são em **português do Brasil**. Valores são em **reais (BRL)**.

## Stack

- Node.js `>= 22.12` (testado no 24), npm
- [Fastify 5](https://fastify.dev/) com `@fastify/jwt` e `@fastify/cors` v11
- [Prisma 6](https://www.prisma.io/) (`prisma-client-js`, preview feature `relationJoins`)
- PostgreSQL no [Supabase](https://supabase.com/)
- [Zod 4](https://zod.dev/) para validar body, query e params
- `bcryptjs`, `date-fns`, TypeScript, ESLint (`typescript-eslint`), `tsx`

O `package.json` tem `overrides` para corrigir falhas de segurança em dependências indiretas:

- `deepmerge-ts` `^8.0.2`: o `@prisma/config` do Prisma 6 ainda pede a 7 (GHSA-ggr8-5vv4-36mx). O Prisma 7 já usa a 8.
- `minimatch` `^11.0.8`: o ESLint e o `typescript-eslint` ainda pedem a 10 (GHSA-g3hv-75wg-m249).

Quando essas dependências passarem a pedir as versões corrigidas, os overrides podem sair. Confira com `npm audit`.

## Comandos

```bash
npm install
npm run dev               # tsx watch com --env-file=.env → http://localhost:3000
npm run build             # tsc → dist/
npm start                 # node dist/main.js
npm run lint              # ESLint
npm test                  # node:test via tsx (src/**/*.test.ts)
npm run prisma:generate   # gera o Prisma Client
npm run prisma:migrate    # prisma migrate deploy
npm run prisma:studio
npm run seed              # usuário demo (só em banco de desenvolvimento)
```

Antes de dar uma tarefa por terminada: `npm run lint`, `npm test` e `npm run build` precisam passar.

## Ambiente

Variáveis (validadas em `src/env.ts`), modelo em `.env.example`:

| Variável | Uso |
|---|---|
| `PORT` | Porta HTTP (padrão `3000`) |
| `JWT_SECRET` | Segredo do JWT |
| `DATABASE_URL` | Conexão usada pela aplicação (pooler do Supabase em modo transação, porta `6543`, com `?pgbouncer=true`) |
| `DIRECT_URL` | Conexão usada pelas migrations (pooler em modo sessão, porta `5432`) |

- O `.env` nunca vai para o Git e nunca deve ser impresso em logs, commits ou mensagens.
- `npm run dev` e `npm start` usam `--env-file=.env`. **Variáveis já exportadas no shell vencem o `.env`.** Se o terminal já tiver um `DATABASE_URL` de outro projeto, a API conecta no banco errado. Nesse caso rode `env -u DATABASE_URL -u DIRECT_URL -u JWT_SECRET -u PORT npm run dev`.
- Antes de subir a API de novo, confirme que não ficou um `tsx watch` antigo ocupando a porta `3000`.

## Arquitetura

```
src/
  main.ts                  # bootstrap (listen)
  server.ts                # Fastify, CORS, auth, error handler e registro das rotas
  env.ts                   # validação das variáveis de ambiente (Zod)
  lib/
    prisma.ts              # PrismaClient único
    errors.ts              # HttpError + badRequest, unauthorized, forbidden, notFound, conflict
    dates.ts               # YYYY-MM-DD ↔ Date às 12:00 UTC, dateOnlySchema, intervalos de mês
  plugins/auth.ts          # @fastify/jwt + preHandler que preenche request.userId
  @types/fastify.d.ts      # augmentations (request.userId, app.authenticate)
  modules/
    auth/                  # signin, signup (cria as 12 categorias padrão)
    users/                 # GET /users/me
    bank-accounts/         # CRUD + saldo atual calculado
    categories/            # CRUD, padrão x personalizadas, mover lançamentos ao excluir
    cards/                 # CRUD de cartões, limite usado, regras de fatura (invoice.ts)
    transactions/          # CRUD, parcelas, escopo, calendário, confirmação
    transfers/             # transferências entre contas
    recurring/             # regras recorrentes, agenda, dias úteis e feriados
    dashboard/             # GET /dashboard/summary
prisma/
  schema.prisma
  migrations/              # migrations versionadas (SQL)
  seed.ts                  # usuário demo
```

Cada módulo segue o mesmo padrão:

- `*.routes.ts`: só rotas. Faz o `parse` com os schemas Zod e chama o service.
- `*.schemas.ts`: schemas Zod e os tipos inferidos (`z.infer`).
- `*.service.ts`: regra de negócio e acesso ao banco.
- `validate-ownership.ts`: garante que o recurso pertence ao `userId` do token (senão `404`).

Regras gerais:

- Toda rota, menos `/auth/*` e `/health`, exige `Authorization: Bearer <token>`. O `userId` vem sempre de `request.userId`, nunca do body.
- Todo recurso recebido por id (conta, categoria, cartão, lançamento, regra) passa por `validate…Ownership` antes de ser lido ou alterado.
- Erros de negócio usam os helpers de `lib/errors.ts`. O error handler responde `{ statusCode, error, message }`; erro de Zod vira `400` com `issues`.
- Inclua relações com `transactionInclude` (`modules/transactions/transaction-include.ts`) para que o front receba sempre o mesmo formato de lançamento.
- Rotas novas são registradas em `server.ts` com prefixo próprio.

## Modelo de dados

`User` 1—N `BankAccount`, `Category`, `Card`, `Transaction`, `RecurringRule` (tudo com `onDelete: Cascade` a partir do usuário).

- **Transaction**: `type` `INCOME | EXPENSE | TRANSFER`; `paymentMethod` `ACCOUNT | PIX | CASH | CREDIT_CARD | DEBIT_CARD`; `bankAccountId` é nulo em compras no crédito; `toBankAccountId` só em transferências; campos de parcela (`installmentGroupId`, `installmentNumber`, `installmentsTotal`); campos de recorrência (`recurringRuleId`, `occurrenceDate`, `isDetached`) com `@@unique([recurringRuleId, occurrenceDate])`.
- **Category**: `isDefault`, `color` opcional e `@@unique([userId, type, name])`. Cada usuário tem a própria cópia das 12 categorias padrão. Por isso o banco tem uma linha "Alimentação" por usuário, e isso não é duplicação.
- **Card**: guarda só `lastDigits` e `brand`. Crédito tem `creditLimit`, `closingDay` e `dueDay`; débito aponta para a conta em `bankAccountId`.
- **RecurringRule**: o molde da recorrência (`frequency`, `dayRule`, `dayOfMonth`, `businessDayN`, `startDate`, `endDate`, `maxOccurrences`, `autoConfirm`, `active`, `generatedUntil`, `skippedDates`).

Valores monetários são `Float` em reais. Ao dividir (parcelas), trunque os centavos e jogue a diferença na última parcela, como faz `installments.ts`.

## Regras de negócio

### Datas

- O front envia `YYYY-MM-DD` e a API grava às **12:00 UTC** daquele dia (`lib/dates.ts`). Assim o fuso nunca troca o dia. ISO com horário ainda é aceito (usa só a data).
- `month` vai de `0` a `11`, como no `Date` do JavaScript.

### Saldo das contas

`currentBalance` = saldo inicial + entradas − saídas ± transferências, **considerando só lançamentos pagos** (`paid: true`) e **sem compras no crédito** (elas só pesam quando a fatura é paga).

### Parcelamento

- De 2 a 48 parcelas, só em `EXPENSE`. Cria N transações num `prisma.$transaction` com o mesmo `installmentGroupId`.
- A parcela `i` cai em `addMonths(data, i - 1)`. Só a 1ª pode nascer paga. O nome é salvo sem sufixo ("3/10" é montado no front).
- `PUT`/`DELETE /transactions/:id?scope=one|following|all` funciona como no Google Agenda. Fora de parcelamento ou recorrência, o escopo é sempre `one`.

### Recorrência

- A regra gera `Transaction`s reais numa **janela móvel de 12 meses**. `ensureRecurringOccurrences(userId, until)` é idempotente (`createMany` + `skipDuplicates` na chave única) e roda antes de `GET /transactions`, `/transactions/calendar` e `/dashboard/summary`.
- Há um cache em memória por usuário (60 s) para não refazer essa verificação a cada request. **Toda função que cria, edita, encerra ou exclui regras ou ocorrências precisa chamar `invalidateRecurringCache(userId)`.**
- Ocorrências nascem pendentes (`paid: false`). `autoConfirm` marca como pagas quando a data chega; senão, `PATCH /transactions/:id/confirm`.
- Escopo: `one` destaca a ocorrência (`isDetached`); `following` encerra a regra na véspera e cria outra; `all` atualiza a regra e refaz as não pagas e não destacadas. O que já foi pago nunca é reescrito.
- Excluir só uma ocorrência grava a data em `skippedDates` (não há soft delete).
- `BUSINESS_DAY` = N-ésimo dia útil (segunda a sexta, sem feriados nacionais, Carnaval, Sexta-feira Santa e Corpus Christi), em `recurring/business-days.ts`.
- Assinaturas futuras no crédito não consomem o limite do cartão até a data chegar.

### Categorias

- As padrão (`isDefault`) não podem ser editadas nem excluídas: `403` "Categorias padrão não podem ser alteradas".
- Nome único por usuário e tipo, sem diferenciar maiúsculas (`409`).
- Excluir uma categoria com lançamentos exige `?moveToCategoryId=` de outra do mesmo tipo. Lançamentos e regras recorrentes são movidos na mesma transação.

### Cartões

- **Nunca** receba, salve ou registre em log o número completo do cartão nem o CVV. O schema é estrito (`z.strictObject`): campos desconhecidos como `number` ou `cvv` são recusados com `400`.
- `usedLimit` = compras no crédito pendentes (inclui parcelas futuras, exclui recorrências futuras).

## Banco de dados e Supabase

O banco do `.env` é o **Supabase de produção**, com dados reais.

- **Nunca** rode `migrate deploy`, `migrate reset`, `db push`, scripts de escrita ou o seed contra o Supabase sem a aprovação explícita do dono do projeto naquela conversa.
- Desenvolva e teste contra um Postgres local primeiro.

### Criando uma migration

`prisma migrate dev` exige terminal interativo. O caminho que funciona em automação é gerar o SQL com `migrate diff` contra um banco "shadow" local:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://postgres@127.0.0.1:54329/fincheck_shadow" \
  --script > prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql
```

Revise o SQL (dados existentes, valores padrão, índices únicos) e aplique com `npm run prisma:migrate`. Nunca edite uma migration que já foi aplicada; crie outra.

### Segurança do banco (RLS)

- Todas as tabelas do schema `public` têm **Row Level Security ligado e nenhuma política**. A API conecta como `postgres`, dono das tabelas e com `BYPASSRLS`, então não é afetada. Os papéis `anon` e `authenticated` não enxergam nada.
- A Data API (PostgREST) do Supabase está **desligada**: o app não usa `supabase-js`.
- **Toda migration que criar uma tabela precisa incluir `ALTER TABLE "<tabela>" ENABLE ROW LEVEL SECURITY;`.** Veja `20261111120000_enable_row_level_security`.
- Nunca use `FORCE ROW LEVEL SECURITY`: o dono também passaria a ser bloqueado e a API pararia.

### Desempenho

- O banco fica longe (us-west-2): cada ida e volta custa ~200 ms, e pelo pooler em modo transação cada consulta leva perto de 1 s. Conte consultas.
- `relationJoins` faz cada `include` virar um JOIN numa consulta só. Prefira `include`/`select` a buscas em laço, e `Promise.all` para consultas independentes.
- Evite N+1. Agregue no banco (`groupBy`, `_count`) quando der.

## Testes

- `node:test` com `tsx`: `src/**/*.test.ts` (excluídos do `tsc` em `tsconfig.json`).
- Hoje cobrem a divisão de parcelas (`transactions/installments.test.ts`) e a agenda de recorrência com dias úteis e feriados (`recurring/schedule.test.ts`).
- Lógica pura nova (datas, cálculos, regras) deve vir com teste no mesmo padrão.
- Para testar rotas de ponta a ponta, suba a API apontando para um Postgres local e use o seed ou usuários de teste. Nunca use o Supabase para isso.

## Convenções

- TypeScript estrito; sem `any` novo.
- Mensagens de erro e comentários em português. Comente o *porquê*, não o *o quê*.
- Nomes de tabelas e colunas em `snake_case` no banco (`@@map`/`@map`), `camelCase` no Prisma.
- Ao mudar o formato de uma resposta, atualize a tabela de endpoints do `README.md` e os tipos em `fincheck-web/src/types/`.
- O CORS lista os métodos explicitamente (`GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS`): o `@fastify/cors` v11 só libera `GET, HEAD, POST` por padrão.

## Git

- Branch padrão: `master`. Trabalhe em branches de feature.
- Mensagens de commit curtas, em inglês, minúsculas e no passado, uma por alteração. Exemplos do histórico: `added transfer accounts and paid status`, `added include category in findAll`.
- Não commite `.env`, `dist/` nem `node_modules/`.
