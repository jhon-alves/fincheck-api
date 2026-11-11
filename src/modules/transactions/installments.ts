import { addMonthsToApiDate } from '../../lib/dates';

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 48;

export interface Installment {
  /** 1..N */
  number: number;
  value: number;
  date: Date;
}

/**
 * Divide `totalValue` em `count` parcelas mensais.
 *
 * - Valores: a conta é feita em centavos. Cada parcela fica com o valor
 *   truncado em 2 casas e a diferença vai para a **última**, então a soma bate
 *   exatamente com o total (R$ 100 em 3x = 33,33 + 33,33 + 33,34) e a última
 *   nunca fica menor que as outras.
 * - Datas: a parcela `i` cai em `addMonths(dataDaCompra, i - 1)`, sempre a
 *   partir da data original (31/jan em 3x = 31/jan, 28/fev, 31/mar), em vez de
 *   encadear a partir da parcela anterior (o que "grudaria" no dia 28).
 */
export function buildInstallments(
  totalValue: number,
  count: number,
  firstDate: Date,
): Installment[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('A quantidade de parcelas precisa ser um inteiro >= 1');
  }

  const totalCents = Math.round(totalValue * 100);
  const baseCents = Math.floor(totalCents / count);
  const lastCents = totalCents - baseCents * (count - 1);

  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    value: (index === count - 1 ? lastCents : baseCents) / 100,
    date: addMonthsToApiDate(firstDate, index),
  }));
}

/** Toda parcela precisa valer pelo menos R$ 0,01. */
export function isInstallmentValueValid(totalValue: number, count: number) {
  return Math.round(totalValue * 100) >= count;
}
