import { addDaysToApiDate, clampedDayOfMonth, toDateOnly } from '../../lib/dates';
import { nthBusinessDay } from './business-days';

export type Frequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type DayRule = 'FIXED_DAY' | 'BUSINESS_DAY';

export interface ScheduleRule {
  frequency: Frequency;
  dayRule: DayRule;
  dayOfMonth: number | null;
  businessDayN: number | null;
  startDate: Date;
  endDate: Date | null;
  maxOccurrences: number | null;
}

/** Limite de segurança: 50 anos de ocorrências mensais. */
const MAX_SLOTS = 600;

/** Data (12:00 UTC) da k-ésima "vaga" da regra, contando a partir do início. */
function slotDate(rule: ScheduleRule, index: number): Date {
  const start = rule.startDate;

  if (rule.frequency === 'WEEKLY') {
    return addDaysToApiDate(start, index * 7);
  }

  const year =
    rule.frequency === 'YEARLY' ? start.getUTCFullYear() + index : start.getUTCFullYear();
  const month =
    rule.frequency === 'YEARLY' ? start.getUTCMonth() : start.getUTCMonth() + index;

  if (rule.frequency === 'MONTHLY' && rule.dayRule === 'BUSINESS_DAY') {
    return nthBusinessDay(year, month, rule.businessDayN ?? 1);
  }

  return clampedDayOfMonth(year, month, rule.dayOfMonth ?? start.getUTCDate());
}

/**
 * Datas das ocorrências de `startDate` até `until` (inclusive), respeitando
 * `endDate` e `maxOccurrences`. Vagas que caem antes do início (ex.: "5º dia
 * útil" num mês que começou depois dele) não contam.
 */
export function occurrenceDates(rule: ScheduleRule, until: Date): Date[] {
  const startDay = toDateOnly(rule.startDate);
  const limitDay = toDateOnly(
    rule.endDate && rule.endDate < until ? rule.endDate : until,
  );
  const dates: Date[] = [];

  for (let index = 0; index < MAX_SLOTS; index++) {
    const date = slotDate(rule, index);
    const day = toDateOnly(date);

    if (day > limitDay) break;
    if (day < startDay) continue;

    dates.push(date);
    if (rule.maxOccurrences && dates.length >= rule.maxOccurrences) break;
  }

  return dates;
}

/**
 * "Período" de uma ocorrência: mês (mensal), ano (anual) ou semana desde o
 * início (semanal). Serve para não gerar duas ocorrências no mesmo período
 * quando a regra muda de dia.
 */
export function periodKey(rule: Pick<ScheduleRule, 'frequency' | 'startDate'>, date: Date) {
  if (rule.frequency === 'MONTHLY') {
    return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
  }

  if (rule.frequency === 'YEARLY') {
    return `${date.getUTCFullYear()}`;
  }

  const weeks = Math.round(
    (Date.parse(toDateOnly(date)) - Date.parse(toDateOnly(rule.startDate))) /
      (7 * 24 * 60 * 60 * 1000),
  );
  return `w${weeks}`;
}
