const PERIODS_IN_MONTHS = Object.freeze({ mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 });
const PERIODS_IN_DAYS = Object.freeze({ diaria: 1, semanal: 7, quinzenal: 15 });

export const PAYABLE_PERIODS = new Set(['diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual']);

export function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

export function parseDateOnly(value) {
  const match = dateOnly(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === match[0] ? date : null;
}

export function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsClamped(anchor, months) {
  const day = anchor.getUTCDate();
  const target = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function occurrencesInRange({ startDate, period, rangeStart, rangeEnd }) {
  const anchor = parseDateOnly(startDate);
  const start = parseDateOnly(rangeStart);
  const end = parseDateOnly(rangeEnd);
  if (!anchor || !start || !end || start >= end || anchor >= end || !PAYABLE_PERIODS.has(period)) return [];

  const output = [];
  const monthStep = PERIODS_IN_MONTHS[period];
  if (monthStep) {
    const monthDifference = (start.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + start.getUTCMonth() - anchor.getUTCMonth();
    let step = Math.max(0, Math.floor(monthDifference / monthStep)) * monthStep;
    let cursor = addMonthsClamped(anchor, step);
    while (cursor < start) {
      step += monthStep;
      cursor = addMonthsClamped(anchor, step);
    }
    while (cursor < end) {
      output.push(formatDateOnly(cursor));
      step += monthStep;
      cursor = addMonthsClamped(anchor, step);
    }
    return output;
  }

  const dayStep = PERIODS_IN_DAYS[period];
  let cursor = new Date(anchor);
  if (cursor < start) {
    const difference = Math.floor((start.getTime() - cursor.getTime()) / 86_400_000);
    cursor = addDays(cursor, Math.floor(difference / dayStep) * dayStep);
    while (cursor < start) cursor = addDays(cursor, dayStep);
  }
  while (cursor < end) {
    output.push(formatDateOnly(cursor));
    cursor = addDays(cursor, dayStep);
  }
  return output;
}

export function normalizeMoney(value) {
  if (typeof value === 'string') {
    const input = value.trim();
    if (!input) throw new Error('Informe o valor da conta');
    const normalized = input.includes(',')
      ? input.replace(/\./g, '').replace(',', '.')
      : input;
    value = normalized;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Valor da conta invalido');
  return Number(amount.toFixed(2));
}

export function validatePayableInput(input = {}) {
  const descricao = String(input.descricao || '').trim();
  const dataVencimento = dateOnly(input.data_vencimento);
  if (!descricao) throw new Error('Informe a descricao da conta');
  if (!parseDateOnly(dataVencimento)) throw new Error('Data de vencimento invalida');
  const recorrente = Boolean(input.recorrente);
  const periodicidade = recorrente ? String(input.periodicidade || '') : 'unica';
  if (recorrente && !PAYABLE_PERIODS.has(periodicidade)) throw new Error('Periodicidade invalida');
  return {
    descricao,
    valor: normalizeMoney(input.valor),
    data_vencimento: dataVencimento,
    categoria_id: input.categoria_id || null,
    forma_pagamento: input.forma_pagamento || null,
    parcelas: Math.max(1, Number(input.parcelas || 1)),
    recorrente,
    periodicidade,
    observacoes: String(input.observacoes || '').trim() || null,
    status: ['pendente', 'atrasado', 'pago'].includes(input.status) ? input.status : 'pendente',
  };
}
