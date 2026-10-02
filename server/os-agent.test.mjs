import test from 'node:test';
import assert from 'node:assert/strict';
import { createOsTools, normalize, rankOrders, similarity } from './os-agent.mjs';
import { DEFAULT_TEMPLATES, renderTemplate } from './message-templates.mjs';

const orders = [
  { numero: 188, cliente_nome: 'Oto Tertuliano', instrumento: 'Violão', marca: 'Tagima', modelo: 'Gran reserva Vegas' },
  { numero: 189, cliente_nome: 'Oto Tertuliano', instrumento: 'Guitarra', marca: 'Fender', modelo: 'Replica Jaguar' },
  { numero: 150, cliente_nome: 'Filadelfo Alves', instrumento: 'Viola', marca: 'Rozini', modelo: '' },
  { numero: 120, cliente_nome: 'Otávio Lima', instrumento: 'Baixo', marca: 'Giannini', modelo: '' },
];

test('similaridade tolera erro de digitação, acento e caixa', () => {
  assert.equal(normalize('Violão  TAGIMA!'), 'violao tagima');
  assert.ok(similarity('oto tetuliano', 'Oto Tertuliano') > 0.9);
  assert.ok(similarity('tagima', 'Tagima Gran reserva') >= 0.95);
  assert.ok(similarity('filadelfo', 'Filadelfo Alves') >= 0.95);
  assert.equal(similarity('maria', 'Oto Tertuliano'), 0);
});

test('acha a OS certa pelo cliente digitado errado e pelo equipamento', () => {
  const byClient = rankOrders(orders, { cliente: 'oto tetuliano' });
  assert.deepEqual(byClient.map((item) => item.row.numero).slice(0, 2).sort(), [188, 189]);
  assert.ok(byClient.every((item) => item.row.cliente_nome !== 'Filadelfo Alves'));

  const narrowed = rankOrders(orders, { cliente: 'oto tetuliano', equipamento: 'violão tagima' });
  assert.equal(narrowed.length, 1, 'com o equipamento a escolha deixa de ser ambígua');
  assert.equal(narrowed[0].row.numero, 188);

  assert.equal(rankOrders(orders, { cliente: 'filadelfo', equipamento: 'viola' })[0].row.numero, 150);
});

test('modelos de mensagem do servidor renderizam com dados da OS e sem variáveis soltas', () => {
  for (const type of ['servico_andamento', 'servico_atraso', 'servico_finalizado', 'nova_ordem']) {
    const content = DEFAULT_TEMPLATES[type].defaultContent;
    const text = renderTemplate(content, { numero: 188, cliente: { nome: 'Oto' }, instrumento: { nome: 'Violão' }, marca: { nome: 'Tagima' }, modelo: 'GD20', valor_total: 650, data_previsao: '2026-10-02' }, { nome_empresa: 'Oficina X' });
    assert.doesNotMatch(text, /\{[a-z_]+\}/, `${type} não deve sobrar variável`);
    assert.match(text, /Oto/);
  }
  assert.throws(() => renderTemplate('Oi {nao_existe}', {}, {}), /não reconhecidas/);
});

test('ferramentas de OS: só mexe em OS aberta e o aviso usa o telefone do cliente', async () => {
  const writes = [];
  const sent = [];
  const order = {
    id: 'o1', numero: 188, status: 'concluido', status_financeiro: 'pago', modelo: 'GD20', valor_total: 650, valor_pago: 650,
    entrada: '2026-09-20', previsao: '2026-10-02', entrega: '2026-10-02', cliente_nome: 'Oto', cliente_telefone: '34998286118', instrumento: 'Violão', marca: 'Tagima',
  };
  const pool = {
    query: async (sql) => {
      if (/^\s*UPDATE/i.test(sql)) { writes.push(sql); return [{ affectedRows: 1 }]; }
      if (/FROM ordens_servico o\s+JOIN clientes/.test(sql)) return [[order]];
      return [[]];
    },
  };
  const tools = createOsTools({
    pool, uuid: () => 'x', now: () => 'agora', todayDate: () => '2026-10-02', money: Number, syncReceivable: async () => {},
    sendCustomerMessage: async (...args) => sent.push(args), validatePhone: () => true,
  });
  await assert.rejects(tools.run('mudar_status_os', { os_id: 'o1', status: 'em_andamento' }, { userId: 'u' }), /concluída/);
  assert.equal(writes.length, 0, 'OS fechada não é alterada');
  const cancelled = await tools.run('cancelar_os', { os_id: 'o1', confirmado: false }, { userId: 'u' });
  assert.equal(cancelled.ok, false);
});
