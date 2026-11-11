import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallments, isInstallmentValueValid } from './installments';
import { toApiDate, toDateOnly } from '../../lib/dates';

const sumCents = (values: number[]) =>
  values.reduce((total, value) => total + Math.round(value * 100), 0);

describe('buildInstallments', () => {
  it('R$ 100 em 3x = 33,33 + 33,33 + 33,34', () => {
    const installments = buildInstallments(100, 3, toApiDate('2026-11-10'));

    assert.deepEqual(
      installments.map((i) => i.value),
      [33.33, 33.33, 33.34],
    );
    assert.equal(sumCents(installments.map((i) => i.value)), 10000);
  });

  it('31/jan em 3x ajusta para o fim de fevereiro e volta ao dia 31', () => {
    const installments = buildInstallments(300, 3, toApiDate('2026-01-31'));

    assert.deepEqual(
      installments.map((i) => toDateOnly(i.date)),
      ['2026-01-31', '2026-02-28', '2026-03-31'],
    );
  });

  it('31/jan em ano bissexto cai em 29/fev', () => {
    const installments = buildInstallments(200, 2, toApiDate('2028-01-31'));

    assert.deepEqual(
      installments.map((i) => toDateOnly(i.date)),
      ['2028-01-31', '2028-02-29'],
    );
  });

  it('48x: 48 parcelas mensais, soma exata e numeração 1..48', () => {
    const total = 12345.67;
    const installments = buildInstallments(total, 48, toApiDate('2026-11-10'));

    assert.equal(installments.length, 48);
    assert.deepEqual(
      installments.map((i) => i.number),
      Array.from({ length: 48 }, (_, i) => i + 1),
    );
    assert.equal(sumCents(installments.map((i) => i.value)), 1234567);
    assert.equal(toDateOnly(installments[0].date), '2026-11-10');
    assert.equal(toDateOnly(installments[47].date), '2030-10-10');
  });

  it('compra de 10x em 10/11 cai todo dia 10 até agosto', () => {
    const installments = buildInstallments(1299, 10, toApiDate('2026-11-10'));

    assert.deepEqual(
      installments.map((i) => toDateOnly(i.date)),
      [
        '2026-11-10',
        '2026-12-10',
        '2027-01-10',
        '2027-02-10',
        '2027-03-10',
        '2027-04-10',
        '2027-05-10',
        '2027-06-10',
        '2027-07-10',
        '2027-08-10',
      ],
    );
    assert.ok(installments.every((i) => i.value === 129.9));
  });

  it('a última parcela nunca é menor que as demais', () => {
    for (const [total, count] of [
      [0.72, 48],
      [200, 3],
      [10, 7],
      [99.99, 12],
    ] as const) {
      const installments = buildInstallments(total, count, new Date());
      const last = installments[count - 1].value;
      assert.ok(installments.every((i) => i.value <= last && i.value > 0));
      assert.equal(sumCents(installments.map((i) => i.value)), Math.round(total * 100));
    }
  });

  it('todas as datas ficam às 12:00 UTC', () => {
    const installments = buildInstallments(100, 12, toApiDate('2026-03-31'));
    assert.ok(installments.every((i) => i.date.getUTCHours() === 12));
  });
});

describe('isInstallmentValueValid', () => {
  it('exige pelo menos R$ 0,01 por parcela', () => {
    assert.equal(isInstallmentValueValid(0.47, 48), false);
    assert.equal(isInstallmentValueValid(0.48, 48), true);
  });
});
