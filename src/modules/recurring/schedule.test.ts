import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toApiDate, toDateOnly } from '../../lib/dates';
import { brazilianHolidays, easterSunday, isBusinessDay, nthBusinessDay } from './business-days';
import { occurrenceDates, periodKey, type ScheduleRule } from './schedule';

const days = (dates: Date[]) => dates.map(toDateOnly);

const monthly = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  frequency: 'MONTHLY',
  dayRule: 'FIXED_DAY',
  dayOfMonth: null,
  businessDayN: null,
  startDate: toApiDate('2026-11-05'),
  endDate: null,
  maxOccurrences: null,
  ...over,
});

describe('feriados e dias úteis', () => {
  it('Páscoa e feriados móveis de 2026 e 2027', () => {
    assert.equal(toDateOnly(easterSunday(2026)), '2026-04-05');
    assert.equal(toDateOnly(easterSunday(2027)), '2027-03-28');
    const h2026 = brazilianHolidays(2026);
    for (const day of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20', '2026-11-02']) {
      assert.ok(h2026.has(day), day);
    }
  });

  it('fim de semana e feriado não são dias úteis', () => {
    assert.equal(isBusinessDay(toApiDate('2026-11-07')), false); // sábado
    assert.equal(isBusinessDay(toApiDate('2026-11-02')), false); // Finados
    assert.equal(isBusinessDay(toApiDate('2026-11-03')), true);
  });

  it('5º dia útil', () => {
    assert.equal(toDateOnly(nthBusinessDay(2026, 10, 5)), '2026-11-09'); // pula Finados
    assert.equal(toDateOnly(nthBusinessDay(2026, 0, 5)), '2026-01-08'); // pula 1º/jan
    assert.equal(toDateOnly(nthBusinessDay(2026, 1, 5)), '2026-02-06');
    assert.equal(toDateOnly(nthBusinessDay(2026, 3, 5)), '2026-04-08'); // pula Sexta Santa
  });

  it('N maior que os dias úteis do mês vira o último dia útil', () => {
    assert.equal(toDateOnly(nthBusinessDay(2026, 1, 30)), '2026-02-27');
  });
});

describe('occurrenceDates', () => {
  it('mensal no dia fixo, até a data limite', () => {
    assert.deepEqual(days(occurrenceDates(monthly(), toApiDate('2027-02-28'))), [
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
    ]);
  });

  it('dia 31 vira o último dia de meses curtos', () => {
    const rule = monthly({ startDate: toApiDate('2027-01-31'), dayOfMonth: 31 });
    assert.deepEqual(days(occurrenceDates(rule, toApiDate('2027-04-30'))), [
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('5º dia útil pula a vaga que cai antes do início', () => {
    const rule = monthly({
      dayRule: 'BUSINESS_DAY',
      businessDayN: 5,
      startDate: toApiDate('2026-11-10'),
    });
    assert.deepEqual(days(occurrenceDates(rule, toApiDate('2027-01-31'))), [
      '2026-12-07',
      '2027-01-08',
    ]);
  });

  it('semanal e anual', () => {
    const weekly = monthly({ frequency: 'WEEKLY', startDate: toApiDate('2026-11-10') });
    assert.deepEqual(days(occurrenceDates(weekly, toApiDate('2026-12-01'))), [
      '2026-11-10',
      '2026-11-17',
      '2026-11-24',
      '2026-12-01',
    ]);
    const yearly = monthly({ frequency: 'YEARLY', startDate: toApiDate('2024-02-29') });
    assert.deepEqual(days(occurrenceDates(yearly, toApiDate('2028-12-31'))), [
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('respeita endDate e maxOccurrences', () => {
    const withEnd = monthly({ endDate: toApiDate('2027-01-04') });
    assert.deepEqual(days(occurrenceDates(withEnd, toApiDate('2030-01-01'))), [
      '2026-11-05',
      '2026-12-05',
    ]);
    const withMax = monthly({ maxOccurrences: 3 });
    assert.equal(occurrenceDates(withMax, toApiDate('2030-01-01')).length, 3);
  });

  it('periodKey agrupa por mês, ano ou semana', () => {
    const rule = monthly();
    assert.equal(periodKey(rule, toApiDate('2026-11-05')), periodKey(rule, toApiDate('2026-11-28')));
    const weekly = monthly({ frequency: 'WEEKLY', startDate: toApiDate('2026-11-10') });
    assert.equal(periodKey(weekly, toApiDate('2026-11-24')), 'w2');
  });
});
