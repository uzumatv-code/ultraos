import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMoney, occurrencesInRange, validatePayableInput } from './payable-recurrence.mjs';

test('normaliza valores do banco e da interface sem multiplicar por cem', () => {
  assert.equal(normalizeMoney(290), 290);
  assert.equal(normalizeMoney('290.00'), 290);
  assert.equal(normalizeMoney('290,00'), 290);
  assert.equal(normalizeMoney('1.290,50'), 1290.5);
});

test('gera recorrencia mensal de forma deterministica e respeita o ultimo dia', () => {
  assert.deepEqual(
    occurrencesInRange({ startDate: '2026-01-31', period: 'mensal', rangeStart: '2026-02-01', rangeEnd: '2026-04-01' }),
    ['2026-02-28', '2026-03-31'],
  );
});

test('gera recorrencias diarias e quinzenais apenas dentro do intervalo', () => {
  assert.deepEqual(
    occurrencesInRange({ startDate: '2026-07-01', period: 'quinzenal', rangeStart: '2026-07-10', rangeEnd: '2026-08-01' }),
    ['2026-07-16', '2026-07-31'],
  );
});

test('conta unica sempre recebe periodicidade unica', () => {
  const input = validatePayableInput({ descricao: 'Aluguel', valor: '290,00', data_vencimento: '2026-07-30', recorrente: false, periodicidade: 'mensal' });
  assert.equal(input.valor, 290);
  assert.equal(input.periodicidade, 'unica');
});

test('rejeita valor e periodicidade invalidos', () => {
  assert.throws(() => normalizeMoney('abc'), /invalido/);
  assert.throws(() => validatePayableInput({ descricao: 'Conta', valor: 10, data_vencimento: '2026-07-30', recorrente: true, periodicidade: 'qualquer' }), /Periodicidade/);
});

import { installmentNumber, occurrenceDate, occurrenceIndex } from './payable-recurrence.mjs';

test('numera parcelas a partir da posição na série', () => {
  assert.equal(occurrenceIndex('2026-10-10', 'mensal', '2026-12-10'), 2);
  assert.equal(occurrenceDate('2026-10-10', 'mensal', 5), '2027-03-10');
  // Empréstimo: outubro é a 4/10, então dezembro é a 6/10 e abril de 2027 já passou do total
  assert.equal(installmentNumber({ startDate: '2026-10-10', period: 'mensal', firstNumber: 4, total: 10, date: '2026-12-10' }), 6);
  assert.equal(installmentNumber({ startDate: '2026-10-10', period: 'mensal', firstNumber: 4, total: 10, date: '2027-04-10' }), 10);
  assert.equal(installmentNumber({ startDate: '2026-10-10', period: 'mensal', firstNumber: 4, total: 10, date: '2027-05-10' }), null);
  assert.equal(installmentNumber({ startDate: '2026-10-10', period: 'mensal', date: '2026-12-10' }), null);
});
