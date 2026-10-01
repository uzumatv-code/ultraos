import test from 'node:test';
import assert from 'node:assert/strict';
import { installmentNote, parseQuickExpense, inferExpenseCategory, detectAgentCommand, formatBRL } from './finance-agent.mjs';

test('reconhece lançamentos rápidos em texto livre', () => {
  const coffee = parseQuickExpense('comprei um café 10,00');
  assert.equal(coffee.value, 10);
  assert.equal(coffee.description, 'Café');
  assert.equal(coffee.category.nome, 'Alimentação');

  assert.equal(parseQuickExpense('gastei 50 no mercado').category.nome, 'Mercado');
  assert.equal(parseQuickExpense('uber 23,90 pix').formaPagamento, 'pix');
  assert.equal(parseQuickExpense('paguei R$ 1.250,50 de aluguel').value, 1250.5);
  assert.equal(parseQuickExpense('comprei corda de violão 38').category.nome, 'Material e peças');
});

test('não confunde outras frases com despesa', () => {
  assert.equal(parseQuickExpense('quanto gastei hoje?'), null);
  assert.equal(parseQuickExpense('OS 125 paga 200 em pix'), null);
  assert.equal(parseQuickExpense('confirmar 123456'), null);
  assert.equal(parseQuickExpense('maria 61999999999'), null);
  assert.equal(parseQuickExpense('cadastre conta de luz 200 vence dia 10'), null);
  assert.equal(parseQuickExpense('bom dia'), null);
});

test('detecta comandos do agente', () => {
  assert.equal(detectAgentCommand('desfazer'), 'desfazer');
  assert.equal(detectAgentCommand('menu'), 'ajuda');
  assert.equal(detectAgentCommand('Oi'), null);
  assert.equal(detectAgentCommand('quais contas atrasadas?'), 'atrasadas');
  assert.equal(detectAgentCommand('o que vence essa semana'), 'proximas');
  assert.equal(detectAgentCommand('quanto gastei hoje'), 'gastos_hoje');
  assert.equal(detectAgentCommand('gastos do mês'), 'gastos_mes');
  assert.equal(detectAgentCommand('resumo'), 'resumo');
});

test('categoria padrão e moeda', () => {
  assert.equal(inferExpenseCategory('coisa qualquer').nome, 'Operacional');
  assert.match(formatBRL(10), /R\$\s?10,00/);
});

test('vários verbos na mesma frase e almoço como alimentação', () => {
  const r = parseQuickExpense('Almocei paguei 36,63');
  assert.equal(r.value, 36.63);
  assert.equal(r.description, 'Despesa via WhatsApp');
  assert.equal(r.category.nome, 'Alimentação');
});

test('compra parcelada ou recorrente não vira gasto rápido', () => {
  assert.equal(parseQuickExpense('comprei um notebook em 3x 1000'), null);
  assert.equal(parseQuickExpense('conta de água 199 todo mês'), null);
});

test('mensagem com dois valores não vira um lançamento só', () => {
  assert.equal(parseQuickExpense('Paguei 37,00 dizimo e comprei 95,00 encordoamento na loja Vibratho'), null);
  assert.equal(inferExpenseCategory('dízimo').nome, 'Dízimo e doações');
});

test('empréstimo e cartão têm categoria própria', () => {
  assert.equal(inferExpenseCategory('Empréstimo do terreno').nome, 'Empréstimos');
  assert.equal(inferExpenseCategory('Cartão da Renner').nome, 'Cartões');
  assert.equal(inferExpenseCategory('Aluguel').nome, 'Moradia');
});

test('mensagem de parcela informa andamento e saldo', () => {
  assert.match(installmentNote({ parcela_numero: 4, parcela_total: 10, valor: 2700 }), /Parcela 4\/10.*faltam 6/s);
  assert.match(installmentNote({ parcela_numero: 10, parcela_total: 10, valor: 2700 }), /última parcela/);
  assert.equal(installmentNote({ valor: 10 }), '');
});
