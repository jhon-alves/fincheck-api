import { toDateOnly } from '../../lib/dates';

/*
 * Dias úteis no Brasil: segunda a sexta, sem os feriados nacionais fixos e
 * sem os móveis mais comuns (Carnaval, Sexta-feira Santa e Corpus Christi).
 * Feriados estaduais e municipais ficam de fora.
 */

const utcNoon = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day, 12));

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), às 12:00 UTC. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return utcNoon(year, month - 1, day);
}

const addDays = (date: Date, amount: number) =>
  new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);

const FIXED_HOLIDAYS: Array<[month: number, day: number]> = [
  [0, 1], // Confraternização Universal
  [3, 21], // Tiradentes
  [4, 1], // Dia do Trabalho
  [8, 7], // Independência
  [9, 12], // Nossa Senhora Aparecida
  [10, 2], // Finados
  [10, 15], // Proclamação da República
  [10, 20], // Consciência Negra (nacional desde 2024)
  [11, 25], // Natal
];

const holidayCache = new Map<number, Set<string>>();

/** Feriados do ano como `YYYY-MM-DD`. */
export function brazilianHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const dates = [
    ...FIXED_HOLIDAYS.map(([month, day]) => utcNoon(year, month, day)),
    addDays(easter, -48), // Carnaval (segunda)
    addDays(easter, -47), // Carnaval (terça)
    addDays(easter, -2), // Sexta-feira Santa
    addDays(easter, 60), // Corpus Christi
  ];

  const holidays = new Set(dates.map(toDateOnly));
  holidayCache.set(year, holidays);
  return holidays;
}

export function isBusinessDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !brazilianHolidays(date.getUTCFullYear()).has(toDateOnly(date));
}

/**
 * N-ésimo dia útil do mês (`month` de 0 a 11), às 12:00 UTC. Se o mês tiver
 * menos dias úteis que N, devolve o último dia útil.
 */
export function nthBusinessDay(year: number, month: number, n: number): Date {
  const first = utcNoon(year, month, 1);
  const normalizedYear = first.getUTCFullYear();
  const normalizedMonth = first.getUTCMonth();
  let lastBusinessDay = first;
  let count = 0;

  for (let day = 1; day <= 31; day++) {
    const date = utcNoon(normalizedYear, normalizedMonth, day);
    if (date.getUTCMonth() !== normalizedMonth) break;
    if (!isBusinessDay(date)) continue;

    count += 1;
    lastBusinessDay = date;
    if (count === n) return date;
  }

  return lastBusinessDay;
}
