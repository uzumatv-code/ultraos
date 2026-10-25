/**
 * Períodos da visão financeira.
 *
 * O período é sempre um intervalo de datas locais [inicio, fim] (inclusive),
 * derivado de um modo e de uma data de referência. A semana vai de segunda a
 * domingo, como na rotina da oficina. O servidor valida o intervalo de novo.
 */

import { addDaysToDateOnly, parseLocalDate, toDateOnly } from '../../utils/dates';

export type PeriodMode = 'semana' | 'mes' | 'ano' | 'personalizado';
export type DateRange = { inicio: string; fim: string };

export const periodOptions: Array<{ value: PeriodMode; label: string }> = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
  { value: 'personalizado', label: 'Período' },
];

function date(value: string) {
  return parseLocalDate(value) ?? new Date();
}

export function rangeFor(mode: PeriodMode, ref: string, de?: string, ate?: string): DateRange {
  const base = date(ref);
  if (mode === 'semana') {
    const monday = addDaysToDateOnly(ref, -((base.getDay() + 6) % 7));
    return { inicio: monday, fim: addDaysToDateOnly(monday, 6) };
  }
  if (mode === 'ano') return { inicio: `${base.getFullYear()}-01-01`, fim: `${base.getFullYear()}-12-31` };
  if (mode === 'personalizado' && de && ate) return de <= ate ? { inicio: de, fim: ate } : { inicio: ate, fim: de };
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { inicio: toDateOnly(first), fim: toDateOnly(last) };
}

/** Avança ou volta uma unidade do modo (7 dias, 1 mês, 1 ano). */
export function shiftRef(mode: PeriodMode, ref: string, direction: 1 | -1) {
  const base = date(ref);
  if (mode === 'semana') return addDaysToDateOnly(ref, 7 * direction);
  if (mode === 'ano') return toDateOnly(new Date(base.getFullYear() + direction, 0, 1));
  return toDateOnly(new Date(base.getFullYear(), base.getMonth() + direction, 1));
}

export function containsDate(range: DateRange, day: string) {
  return range.inicio <= day && day <= range.fim;
}

export function rangeLabel(mode: PeriodMode, range: DateRange, today: string) {
  const start = date(range.inicio);
  const end = date(range.fim);
  const sameYear = start.getFullYear() === end.getFullYear();
  const showYear = !sameYear || start.getFullYear() !== date(today).getFullYear();
  const short = (value: Date, withYear: boolean) =>
    value
      .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
      .replace(/\./g, '')
      .replace(/ de /g, ' ');

  if (mode === 'ano') return String(start.getFullYear());
  if (mode === 'mes') {
    const name = start.toLocaleDateString('pt-BR', { month: 'long' });
    return `${name[0].toUpperCase()}${name.slice(1)}${showYear ? ` ${start.getFullYear()}` : ''}`;
  }
  if (range.inicio === range.fim) return short(start, showYear);
  if (sameYear && start.getMonth() === end.getMonth()) return `${start.getDate()} – ${short(end, showYear)}`;
  return `${short(start, !sameYear)} – ${short(end, showYear)}`;
}

/** Como o período anterior é chamado nas comparações ("vs. semana anterior"). */
export function previousLabel(mode: PeriodMode) {
  if (mode === 'semana') return 'semana anterior';
  if (mode === 'mes') return 'mês anterior';
  if (mode === 'ano') return 'ano anterior';
  return 'período anterior';
}

export function variation(current: number, previous: number) {
  if (!previous) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/** "venceu há 3 dias", "vence hoje", "vence em 5 dias" — a partir dos dias de atraso. */
export function dueText(daysLate: number) {
  if (daysLate > 1) return `venceu há ${daysLate} dias`;
  if (daysLate === 1) return 'venceu ontem';
  if (daysLate === 0) return 'vence hoje';
  if (daysLate === -1) return 'vence amanhã';
  return `vence em ${-daysLate} dias`;
}
