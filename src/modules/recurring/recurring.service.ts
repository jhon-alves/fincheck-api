import type { Prisma, RecurringRule, Transaction } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import {
  addDaysToApiDate,
  clampedDayOfMonth,
  toApiDate,
  toDateOnly,
} from '../../lib/dates';
import { resolvePayment } from '../transactions/resolve-payment';
import { transactionInclude } from '../transactions/transaction-include';
import type { Scope, UpdateTransactionBody } from '../transactions/transactions.schemas';
import { occurrenceDates, periodKey } from './schedule';
import type { EndRuleBody, RecurrenceBody, RuleBody } from './recurring.schemas';

/*
 * Lançamentos recorrentes.
 *
 * A regra (RecurringRule) é o molde; as ocorrências são Transactions de
 * verdade, geradas numa janela móvel de 12 meses à frente. A geração é
 * idempotente: o @@unique([recurringRuleId, occurrenceDate]) + createMany
 * com skipDuplicates impedem duplicatas, e cada "período" (mês, ano ou
 * semana) só recebe uma ocorrência por regra.
 *
 * Exclusão de uma ocorrência com escopo "só esta": a data entra em
 * `skippedDates` da regra, e a geração não a recria.
 */

type Db = Prisma.TransactionClient;

const WINDOW_MONTHS = 12;

export function todayApiDate() {
  return toApiDate(toDateOnly(new Date()));
}

const startOfDayUTC = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Fim da janela padrão: último dia do mês daqui a 12 meses. */
export function defaultWindowEnd(today = todayApiDate()) {
  return clampedDayOfMonth(today.getUTCFullYear(), today.getUTCMonth() + WINDOW_MONTHS, 31);
}

const laterOf = (a: Date, b: Date | null | undefined) => (b && b > a ? b : a);

/** Campos de agenda a partir do corpo `recurrence`. */
function scheduleFields(recurrence: RecurrenceBody, startDate: Date) {
  const isBusinessDay = recurrence.dayRule === 'BUSINESS_DAY';

  return {
    frequency: recurrence.frequency,
    dayRule: recurrence.dayRule,
    dayOfMonth: isBusinessDay ? null : (recurrence.dayOfMonth ?? startDate.getUTCDate()),
    businessDayN: isBusinessDay ? (recurrence.businessDayN ?? 1) : null,
    endDate: recurrence.endDate ? toApiDate(recurrence.endDate) : null,
    maxOccurrences: recurrence.maxOccurrences ?? null,
    autoConfirm: recurrence.autoConfirm,
  };
}

/** Cria as ocorrências que faltam até `until`. Pode rodar quantas vezes for. */
async function generateForRule(db: Db, rule: RecurringRule, until: Date) {
  if (rule.active) {
    const existing = await db.transaction.findMany({
      where: { recurringRuleId: rule.id },
      select: { occurrenceDate: true },
    });

    const taken = new Set<string>();
    for (const { occurrenceDate } of existing) {
      if (occurrenceDate) taken.add(periodKey(rule, occurrenceDate));
    }
    for (const skipped of rule.skippedDates) taken.add(periodKey(rule, skipped));

    const today = todayApiDate();
    const dates = occurrenceDates(rule, until).filter(
      (date) => !taken.has(periodKey(rule, date)),
    );

    if (dates.length > 0) {
      await db.transaction.createMany({
        data: dates.map((date) => ({
          userId: rule.userId,
          type: rule.type,
          name: rule.name,
          value: rule.value,
          categoryId: rule.categoryId,
          bankAccountId: rule.bankAccountId,
          cardId: rule.cardId,
          paymentMethod: rule.paymentMethod,
          notes: rule.notes,
          date,
          occurrenceDate: date,
          recurringRuleId: rule.id,
          // Previstas nascem pendentes e não mexem no saldo. Com autoConfirm,
          // as que já venceram nascem confirmadas.
          paid: rule.autoConfirm && date <= today,
        })),
        skipDuplicates: true,
      });
    }
  }

  await db.recurringRule.update({
    where: { id: rule.id },
    data: { generatedUntil: laterOf(until, rule.generatedUntil) },
  });
}

/*
 * Cache em memória da verificação: com o banco longe, cada consulta custa
 * caro, e não faz sentido conferir as regras a cada request. Cada usuário é
 * conferido no máximo uma vez por minuto (ou de novo se pedir um período além
 * do já conferido). Qualquer mudança em regra limpa o cache do usuário.
 */
const ENSURE_TTL_MS = 60_000;
const ensureCache = new Map<string, { until: number; checkedAt: number }>();

export function invalidateRecurringCache(userId: string) {
  ensureCache.delete(userId);
}

/**
 * Garante as ocorrências de todas as regras ativas até `until` (no mínimo a
 * janela padrão) e confirma sozinhas as de `autoConfirm` cuja data chegou.
 * Chamado no início de GET /transactions, /transactions/calendar e
 * /dashboard/summary: navegar para 2028 gera as ocorrências sob demanda.
 */
export async function ensureRecurringOccurrences(userId: string, until: Date) {
  const target = laterOf(defaultWindowEnd(), until);
  const cached = ensureCache.get(userId);

  if (
    cached &&
    cached.until >= target.getTime() &&
    Date.now() - cached.checkedAt < ENSURE_TTL_MS
  ) {
    return;
  }

  // Uma consulta só: as regras ativas dizem o que falta gerar e se existe
  // alguma com confirmação automática.
  const rules = await prisma.recurringRule.findMany({ where: { userId, active: true } });

  for (const rule of rules) {
    if (rule.generatedUntil && rule.generatedUntil >= target) continue;
    await prisma.$transaction((tx) => generateForRule(tx, rule, target));
  }

  if (rules.some((rule) => rule.autoConfirm)) {
    await prisma.transaction.updateMany({
      where: {
        userId,
        paid: false,
        isDetached: false,
        date: { lt: startOfDayUTC(addDaysToApiDate(todayApiDate(), 1)) },
        recurringRule: { is: { autoConfirm: true } },
      },
      data: { paid: true },
    });
  }

  ensureCache.set(userId, { until: target.getTime(), checkedAt: Date.now() });
}

async function findOwnedRule(userId: string, ruleId: string) {
  const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId } });

  if (!rule) {
    throw notFound('Recorrência não encontrada');
  }

  return rule;
}

/** Cria a regra e as ocorrências da janela. `firstPaid` vale para a 1ª. */
export async function createRule(
  userId: string,
  body: RuleBody,
  options: { firstPaid?: boolean } = {},
) {
  const payment = await resolvePayment(userId, body);
  const startDate = toApiDate(body.startDate);
  invalidateRecurringCache(userId);

  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringRule.create({
      data: {
        userId,
        type: body.type,
        name: body.name,
        value: body.value,
        categoryId: body.categoryId,
        notes: body.notes || null,
        startDate,
        ...payment,
        ...scheduleFields(body.recurrence, startDate),
      },
    });

    await generateForRule(tx, rule, defaultWindowEnd());

    const first = await tx.transaction.findFirst({
      where: { recurringRuleId: rule.id },
      orderBy: { occurrenceDate: 'asc' },
    });

    if (first && options.firstPaid !== undefined) {
      await tx.transaction.update({
        where: { id: first.id },
        data: { paid: options.firstPaid },
      });
    }

    return { rule, firstOccurrenceId: first?.id ?? null };
  });
}

const FREQUENCY_FACTOR = { WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 } as const;

/** Regras com a próxima ocorrência e o total mensal equivalente. */
export async function findAllByUserId(userId: string) {
  await ensureRecurringOccurrences(userId, defaultWindowEnd());
  const today = todayApiDate();

  const rules = await prisma.recurringRule.findMany({
    where: { userId },
    include: {
      category: { select: { id: true, name: true, icon: true, type: true, color: true } },
      bankAccount: { select: { id: true, name: true, color: true } },
      card: {
        select: { id: true, name: true, brand: true, lastDigits: true, color: true, kind: true },
      },
      transactions: {
        where: { paid: false, date: { gte: startOfDayUTC(today) } },
        orderBy: { date: 'asc' },
        take: 1,
        include: transactionInclude,
      },
    },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  });

  const STATUS_ORDER = { ACTIVE: 0, PAUSED: 1, ENDED: 2 } as const;

  return rules
    .map(({ transactions, ...rule }) => {
      const nextOccurrence = transactions[0] ?? null;
      // Com data de fim, a regra está encerrada quando a data passou ou quando
      // não sobrou nenhuma ocorrência pela frente (ex.: a parte antiga de uma
      // regra dividida em "esta e as próximas").
      const status: keyof typeof STATUS_ORDER = !rule.active
        ? 'PAUSED'
        : rule.endDate && (rule.endDate < startOfDayUTC(today) || !nextOccurrence)
          ? 'ENDED'
          : 'ACTIVE';

      return {
        ...rule,
        nextOccurrence,
        monthlyEquivalent: Math.round(rule.value * FREQUENCY_FACTOR[rule.frequency] * 100) / 100,
        status,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/** Edita a regra inteira: ocorrências não pagas e não destacadas são refeitas. */
export async function updateRule(userId: string, ruleId: string, body: RuleBody) {
  const rule = await findOwnedRule(userId, ruleId);
  invalidateRecurringCache(userId);
  const payment = await resolvePayment(userId, body);
  const startDate = toApiDate(body.startDate);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.recurringRule.update({
      where: { id: rule.id },
      data: {
        type: body.type,
        name: body.name,
        value: body.value,
        categoryId: body.categoryId,
        notes: body.notes || null,
        startDate,
        ...payment,
        ...scheduleFields(body.recurrence, startDate),
      },
    });

    await tx.transaction.deleteMany({
      where: { recurringRuleId: rule.id, paid: false, isDetached: false },
    });
    await generateForRule(tx, updated, laterOf(defaultWindowEnd(), rule.generatedUntil));
  });

  return (await findAllByUserId(userId)).find((item) => item.id === ruleId);
}

/** Exclui a regra e as ocorrências não pagas. As pagas ficam no histórico. */
export async function removeRule(userId: string, ruleId: string) {
  const rule = await findOwnedRule(userId, ruleId);
  invalidateRecurringCache(userId);

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { recurringRuleId: rule.id, paid: false } }),
    prisma.recurringRule.delete({ where: { id: rule.id } }),
  ]);
}

/** Encerra a partir de uma data, pausa ou reativa. */
export async function endRule(userId: string, ruleId: string, body: EndRuleBody) {
  const rule = await findOwnedRule(userId, ruleId);
  invalidateRecurringCache(userId);

  if (body.action === 'pause') {
    await prisma.recurringRule.update({ where: { id: rule.id }, data: { active: false } });
  }

  if (body.action === 'resume') {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.recurringRule.update({
        where: { id: rule.id },
        data: { active: true },
      });
      await generateForRule(tx, updated, laterOf(defaultWindowEnd(), rule.generatedUntil));
    });
  }

  if (body.action === 'end') {
    const endDate = body.date ? toApiDate(body.date) : todayApiDate();

    await prisma.$transaction([
      prisma.recurringRule.update({ where: { id: rule.id }, data: { endDate } }),
      prisma.transaction.deleteMany({
        where: {
          recurringRuleId: rule.id,
          paid: false,
          isDetached: false,
          occurrenceDate: { gt: endDate },
        },
      }),
    ]);
  }

  return (await findAllByUserId(userId)).find((item) => item.id === ruleId);
}

/**
 * Mudança de data em "esta e as próximas"/"todas": no dia fixo, o novo dia
 * vira o dia da regra; no semanal, o início anda junto. No dia útil, a data
 * só vale para a própria ocorrência.
 */
function reschedule(rule: RecurringRule, current: Transaction, newDate: Date) {
  if (rule.frequency === 'WEEKLY') {
    const diffDays = Math.round((newDate.getTime() - current.date.getTime()) / 86_400_000);
    return { startDate: addDaysToApiDate(rule.startDate, diffDays) };
  }

  if (rule.dayRule === 'FIXED_DAY') {
    return { dayOfMonth: newDate.getUTCDate() };
  }

  return {};
}

/**
 * Edita uma ocorrência com escopo:
 * - one: só ela, que fica destacada (a regra não a sobrescreve mais);
 * - following: encerra a regra no dia anterior e cria outra a partir daqui
 *   com os dados novos (ex.: aumento de salário a partir de março);
 * - all: atualiza a regra e refaz as ocorrências não pagas e não destacadas.
 * O histórico já pago nunca é reescrito.
 */
export async function updateOccurrence(
  userId: string,
  current: Transaction,
  body: UpdateTransactionBody,
  scope: Scope,
) {
  const payment = await resolvePayment(userId, body, current.cardId);
  const newDate = toApiDate(body.date);
  invalidateRecurringCache(userId);
  const fields = {
    type: body.type,
    name: body.name,
    value: body.value,
    categoryId: body.categoryId,
    notes: body.notes || null,
    ...payment,
  };
  const paid = body.paid ?? current.paid;

  const rule = current.recurringRuleId
    ? await prisma.recurringRule.findUnique({ where: { id: current.recurringRuleId } })
    : null;

  if (!rule || scope === 'one') {
    return prisma.transaction.update({
      where: { id: current.id },
      data: { ...fields, date: newDate, paid, isDetached: !!rule },
      include: transactionInclude,
    });
  }

  const dateChanged = toDateOnly(newDate) !== toDateOnly(current.date);
  const schedulePatch = dateChanged ? reschedule(rule, current, newDate) : {};
  const until = laterOf(defaultWindowEnd(), rule.generatedUntil);

  return prisma.$transaction(async (tx) => {
    if (scope === 'all') {
      const updated = await tx.recurringRule.update({
        where: { id: rule.id },
        data: { ...fields, ...schedulePatch },
      });

      await tx.transaction.deleteMany({
        where: {
          recurringRuleId: rule.id,
          paid: false,
          isDetached: false,
          NOT: { id: current.id },
        },
      });
      await tx.transaction.update({
        where: { id: current.id },
        data: {
          ...fields,
          date: newDate,
          occurrenceDate: dateChanged ? newDate : current.occurrenceDate,
          paid,
          isDetached: false,
        },
      });
      await generateForRule(tx, updated, until);
    } else {
      const split = current.occurrenceDate ?? current.date;
      const before =
        (await tx.transaction.count({
          where: { recurringRuleId: rule.id, occurrenceDate: { lt: split } },
        })) + rule.skippedDates.filter((date) => date < split).length;

      await tx.recurringRule.update({
        where: { id: rule.id },
        data: { endDate: addDaysToApiDate(split, -1) },
      });
      await tx.transaction.deleteMany({
        where: {
          recurringRuleId: rule.id,
          paid: false,
          isDetached: false,
          occurrenceDate: { gt: split },
        },
      });

      const newRule = await tx.recurringRule.create({
        data: {
          userId,
          ...fields,
          frequency: rule.frequency,
          dayRule: rule.dayRule,
          dayOfMonth: rule.dayOfMonth,
          businessDayN: rule.businessDayN,
          autoConfirm: rule.autoConfirm,
          active: rule.active,
          startDate: newDate,
          endDate: rule.endDate,
          maxOccurrences: rule.maxOccurrences
            ? Math.max(1, rule.maxOccurrences - before)
            : null,
          ...schedulePatch,
          ...(rule.frequency === 'WEEKLY' ? { startDate: newDate } : {}),
        },
      });

      // A ocorrência editada passa para a regra nova (mantém o id). As já
      // pagas/destacadas depois dela também, sem mudar os dados: assim a regra
      // nova não cria outra no mesmo período.
      await tx.transaction.update({
        where: { id: current.id },
        data: {
          ...fields,
          date: newDate,
          occurrenceDate: newDate,
          recurringRuleId: newRule.id,
          paid,
          isDetached: false,
        },
      });
      await tx.transaction.updateMany({
        where: { recurringRuleId: rule.id, occurrenceDate: { gt: split } },
        data: { recurringRuleId: newRule.id },
      });

      await generateForRule(tx, newRule, until);

      const remaining = await tx.transaction.count({ where: { recurringRuleId: rule.id } });
      if (remaining === 0) {
        await tx.recurringRule.delete({ where: { id: rule.id } });
      }
    }

    return tx.transaction.findUnique({
      where: { id: current.id },
      include: transactionInclude,
    });
  });
}

/**
 * Exclui uma ocorrência com escopo:
 * - one: só ela; a data vai para `skippedDates` e não volta;
 * - following: ela e as próximas não pagas; a regra termina na véspera;
 * - all: a regra e todas as ocorrências não pagas (as pagas ficam).
 */
export async function removeOccurrence(current: Transaction, scope: Scope) {
  invalidateRecurringCache(current.userId);
  const rule = current.recurringRuleId
    ? await prisma.recurringRule.findUnique({ where: { id: current.recurringRuleId } })
    : null;

  if (!rule) {
    await prisma.transaction.delete({ where: { id: current.id } });
    return;
  }

  const occurrence = current.occurrenceDate ?? current.date;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id: current.id } });

    if (scope === 'one') {
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: { skippedDates: { push: occurrence } },
      });
      return;
    }

    if (scope === 'following') {
      await tx.transaction.deleteMany({
        where: {
          recurringRuleId: rule.id,
          paid: false,
          isDetached: false,
          occurrenceDate: { gt: occurrence },
        },
      });
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: { endDate: addDaysToApiDate(occurrence, -1) },
      });

      const remaining = await tx.transaction.count({ where: { recurringRuleId: rule.id } });
      if (remaining === 0) await tx.recurringRule.delete({ where: { id: rule.id } });
      return;
    }

    await tx.transaction.deleteMany({ where: { recurringRuleId: rule.id, paid: false } });
    await tx.recurringRule.delete({ where: { id: rule.id } });
  });
}
