import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceQueries, resolvePeriod } from './finance-queries.mjs';

test('períodos nomeados são resolvidos no servidor', () => {
  assert.deepEqual(resolvePeriod('hoje', '2026-10-02'), { de: '2026-10-02', ate: '2026-10-02', rotulo: 'hoje' });
  assert.equal(resolvePeriod('mes', '2026-10-02').de, '2026-10-01');
  assert.deepEqual(resolvePeriod('mes_passado', '2026-01-15'), { de: '2025-12-01', ate: '2025-12-31', rotulo: 'mês passado' });
  assert.equal(resolvePeriod('ontem', '2026-10-01').de, '2026-09-30');
  assert.equal(resolvePeriod('personalizado', '2026-10-02', '2026-09-01', '2026-09-10').ate, '2026-09-10');
});

test('"quanto entrou hoje" soma pagamentos de OS e entradas avulsas do dia', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/FROM transacoes_financeiras t/.test(sql)) {
        return [[
          { descricao: 'Pagamento OS #10 - Ana', valor: '120.00', dia: '2026-10-02', forma_pagamento: 'pix', ordem_servico_id: 'o1', os_numero: 10 },
          { descricao: 'Serviço avulso', valor: '50.00', dia: '2026-10-02', forma_pagamento: null, ordem_servico_id: null, os_numero: null },
        ]];
      }
      if (/FROM ordens_servico o/.test(sql)) {
        return [[{ numero: 10, cliente: 'Ana', valor_total: '120', valor_pago: '120', status: 'pendente', status_financeiro: 'pago', aberta_em: '2026-10-02' }]];
      }
      return [[]];
    },
  };
  const out = await createFinanceQueries({ pool, todayDate: () => '2026-10-02' }).run('u', { consulta: 'entradas' });
  assert.equal(out.total_entrou_reais, 170);
  assert.equal(out.de_pagamentos_de_os.total_reais, 120);
  assert.equal(out.entradas_avulsas.total_reais, 50);
  assert.equal(out.os_abertas_no_periodo[0].pagamento, 'pago');
  assert.deepEqual(calls[0].params, ['u', '2026-10-02', '2026-10-02']);
});

test('a_receber agrupa por cliente e ordena por quem deve mais', async () => {
  const pool = { query: async () => [[
    { cliente: 'Ana', numero: 1, valor_total: '100', valor_pago: '40', status: 'concluido' },
    { cliente: 'Beto', numero: 2, valor_total: '300', valor_pago: '0', status: 'pendente' },
    { cliente: 'Ana', numero: 3, valor_total: '50', valor_pago: '0', status: 'pendente' },
  ]] };
  const out = await createFinanceQueries({ pool, todayDate: () => '2026-10-02' }).run('u', { consulta: 'a_receber' });
  assert.equal(out.total_a_receber_reais, 410);
  assert.equal(out.clientes[0].cliente, 'Beto');
  assert.equal(out.clientes[1].deve_reais, 110);
});
