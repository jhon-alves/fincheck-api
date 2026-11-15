import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toApiDate, toDateOnly } from '../../lib/dates';
import { dueDateForPurchase, invoicePeriodForDueDate } from './invoice';

const due = (days: { closingDay: number; dueDay: number }, purchase: string) =>
  toDateOnly(dueDateForPurchase(days, toApiDate(purchase)));

describe('dueDateForPurchase', () => {
  const black = { closingDay: 3, dueDay: 10 };
  const lateClosing = { closingDay: 25, dueDay: 5 };

  it('compra antes do fechamento cai na fatura do mesmo mês (fecha 3, vence 10)', () => {
    assert.equal(due(black, '2026-11-02'), '2026-11-10');
  });

  it('compra no dia do fechamento já vai para a fatura seguinte', () => {
    assert.equal(due(black, '2026-11-03'), '2026-12-10');
    assert.equal(due(black, '2026-11-10'), '2026-12-10');
  });

  it('fecha depois de vencer (fecha 25, vence 5): vence no mês seguinte ao fechamento', () => {
    assert.equal(due(lateClosing, '2026-11-24'), '2026-12-05');
    assert.equal(due(lateClosing, '2026-11-25'), '2027-01-05');
  });

  it('vira o ano', () => {
    assert.equal(due(black, '2026-12-20'), '2027-01-10');
  });

  it('fechamento no dia 31 respeita meses curtos', () => {
    const days = { closingDay: 31, dueDay: 8 };
    assert.equal(due(days, '2027-02-27'), '2027-03-08');
    assert.equal(due(days, '2027-02-28'), '2027-04-08');
  });

  it('a compra sempre está dentro do período da fatura calculada', () => {
    for (const days of [black, lateClosing, { closingDay: 31, dueDay: 8 }, { closingDay: 1, dueDay: 1 }]) {
      for (let d = 0; d < 400; d++) {
        const purchase = toApiDate('2026-01-01');
        purchase.setUTCDate(purchase.getUTCDate() + d);
        const period = invoicePeriodForDueDate(days, dueDateForPurchase(days, purchase));
        assert.ok(
          purchase >= period.start && purchase < period.end,
          `${toDateOnly(purchase)} fora de [${toDateOnly(period.start)}, ${toDateOnly(period.end)}) (${JSON.stringify(days)})`,
        );
      }
    }
  });
});
