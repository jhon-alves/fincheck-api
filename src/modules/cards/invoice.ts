import { clampedDayOfMonth } from '../../lib/dates';

/*
 * Regras de fatura do cartão de crédito.
 *
 * A fatura que vence no dia `dueDay` do mês M fecha no `closingDay` anterior ao
 * vencimento: no próprio mês M se o fechamento vem antes do vencimento (fecha
 * 3, vence 10), ou no mês M-1 se vem depois (fecha 25, vence 5). Ela reúne as
 * compras de [fechamento anterior, fechamento) — compra feita a partir do dia
 * de fechamento já vai para a fatura seguinte.
 */

interface CreditCardDays {
  closingDay: number;
  dueDay: number;
}

/** Datas de vencimento (12:00 UTC) dentro de [from, to], inclusive. */
export function dueDatesBetween(
  { dueDay }: Pick<CreditCardDays, 'dueDay'>,
  from: Date,
  to: Date,
): Date[] {
  const dates: Date[] = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth() - 1;

  // Percorre do mês anterior ao seguinte para cobrir meses curtos (dia 31).
  for (let i = 0; i < 26; i++) {
    const due = clampedDayOfMonth(year, month, dueDay);

    if (due > to) break;
    if (due >= from) dates.push(due);

    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return dates;
}

/** Período [start, end) de compras que entram na fatura com vencimento `dueDate`. */
export function invoicePeriodForDueDate(
  { closingDay, dueDay }: CreditCardDays,
  dueDate: Date,
) {
  const closingMonth = dueDate.getUTCMonth() + (closingDay < dueDay ? 0 : -1);
  const year = dueDate.getUTCFullYear();

  // Cada fechamento é calculado no próprio mês (e não "end - 1 mês"), para
  // que um fechamento no dia 31 não sobreponha períodos em meses curtos.
  const end = clampedDayOfMonth(year, closingMonth, closingDay);
  const start = clampedDayOfMonth(year, closingMonth - 1, closingDay);

  return { start, end };
}
