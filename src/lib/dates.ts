import { z } from 'zod';
import { addMonths as dateFnsAddMonths } from 'date-fns';

/*
 * Datas da API são "dias de calendário", não instantes. O front envia
 * `YYYY-MM-DD`, e a API grava sempre às 12:00 UTC desse dia: assim a data
 * continua no mesmo dia em qualquer fuso realista (±11h) e os filtros por mês
 * (que usam limites em UTC) nunca empurram uma transação para o mês vizinho.
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

/** Aceita `YYYY-MM-DD` ou ISO com horário (compatibilidade com o front antigo). */
export const dateOnlySchema = z
  .string({ message: 'Informe a data' })
  .refine((value) => {
    const match = DATE_ONLY_REGEX.exec(value);
    if (!match) return false;
    const date = toApiDate(value);
    return toDateOnly(date) === `${match[1]}-${match[2]}-${match[3]}`;
  }, 'A data precisa estar no formato YYYY-MM-DD');

/** `2026-11-10` (ou `2026-11-10T...`) → Date em 2026-11-10T12:00:00.000Z */
export function toApiDate(value: string): Date {
  const match = DATE_ONLY_REGEX.exec(value);

  if (!match) {
    return new Date(NaN);
  }

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
}

/** Date → `YYYY-MM-DD` (pelo calendário UTC, que é como a data foi gravada). */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Soma meses a uma data da API usando o `addMonths` do date-fns, que já ajusta
 * o dia 31 para o último dia de meses mais curtos (31/jan + 1 mês = 28/fev).
 * A conta é feita sobre o dia de calendário, então o fuso do servidor não
 * interfere.
 */
export function addMonthsToApiDate(date: Date, amount: number): Date {
  const local = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    12,
  );
  const result = dateFnsAddMonths(local, amount);

  return new Date(
    Date.UTC(result.getFullYear(), result.getMonth(), result.getDate(), 12),
  );
}

/** Soma dias a uma data da API (mantendo 12:00 UTC). */
export function addDaysToApiDate(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}

/** Primeiro instante do mês (UTC). `month` vai de 0 a 11. */
export function startOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

/** Primeiro instante do mês seguinte (UTC) — use como limite exclusivo. */
export function startOfNextMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 1));
}

/** Quantos dias o mês tem (`month` de 0 a 11). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Data da API para o dia `day` do mês, limitado ao último dia do mês. */
export function clampedDayOfMonth(year: number, month: number, day: number) {
  const normalized = new Date(Date.UTC(year, month, 1));
  const lastDay = daysInMonth(
    normalized.getUTCFullYear(),
    normalized.getUTCMonth(),
  );

  return new Date(
    Date.UTC(
      normalized.getUTCFullYear(),
      normalized.getUTCMonth(),
      Math.min(day, lastDay),
      12,
    ),
  );
}
