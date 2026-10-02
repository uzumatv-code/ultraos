import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeHub, instrumentDatabase, tableOfWrite } from './realtime.mjs';

function fakeResponse() {
  const chunks = [];
  return { chunks, write: (data) => chunks.push(data) };
}

const events = (res) => res.chunks.filter((chunk) => chunk.startsWith('event: change')).map((chunk) => JSON.parse(chunk.split('data: ')[1]));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakePool() {
  const connection = {
    query: async () => [{ affectedRows: 1 }],
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
  };
  return { query: async () => [[]], getConnection: async () => connection };
}

test('reconhece a tabela de INSERT, UPDATE e DELETE', () => {
  assert.equal(tableOfWrite('INSERT INTO transacoes_financeiras (a) VALUES (?)'), 'transacoes_financeiras');
  assert.equal(tableOfWrite('  UPDATE `contas_pagar` SET x=1'), 'contas_pagar');
  assert.equal(tableOfWrite('DELETE FROM orcamentos WHERE id=?'), 'orcamentos');
  assert.equal(tableOfWrite('INSERT IGNORE INTO whatsapp_mensagens (id) VALUES (?)'), 'whatsapp_mensagens');
  assert.equal(tableOfWrite('SELECT * FROM contas_pagar'), null);
});

test('escrita avisa só o dono, agrupando vários avisos num único evento', async () => {
  const hub = createRealtimeHub({ debounceMs: 20 });
  const mine = fakeResponse();
  const other = fakeResponse();
  hub.subscribe('conta-1', mine);
  hub.subscribe('conta-2', other);
  const pool = instrumentDatabase(fakePool(), hub);

  await pool.query('INSERT INTO transacoes_financeiras (id,user_id) VALUES (?,?)', ['t1', 'conta-1']);
  await pool.query('UPDATE contas_pagar SET status=? WHERE user_id=? AND id=?', ['pago', 'conta-1', 'c1']);
  await wait(60);

  assert.equal(events(other).length, 0, 'outra conta não é avisada');
  assert.equal(events(mine).length, 1, 'dois avisos próximos viram um evento');
  assert.deepEqual(events(mine)[0].topics.sort(), ['financeiro']);
});

test('leitura e tabelas irrelevantes não geram evento', async () => {
  const hub = createRealtimeHub({ debounceMs: 10 });
  const res = fakeResponse();
  hub.subscribe('conta-1', res);
  const pool = instrumentDatabase(fakePool(), hub);
  await pool.query('SELECT * FROM contas_pagar WHERE user_id=?', ['conta-1']);
  await pool.query('INSERT INTO auditoria (id,user_id) VALUES (?,?)', ['a', 'conta-1']);
  await wait(40);
  assert.equal(events(res).length, 0);
});

test('em transação o aviso só sai no commit, e rollback não avisa', async () => {
  const hub = createRealtimeHub({ debounceMs: 10 });
  const res = fakeResponse();
  hub.subscribe('conta-1', res);
  const pool = instrumentDatabase(fakePool(), hub);

  let conn = await pool.getConnection();
  await conn.beginTransaction();
  await conn.query('UPDATE ordens_servico SET status=? WHERE user_id=?', ['concluido', 'conta-1']);
  await wait(40);
  assert.equal(events(res).length, 0, 'antes do commit ninguém é avisado');
  await conn.commit();
  await wait(40);
  assert.deepEqual(events(res)[0].topics.sort(), ['financeiro', 'ordens']);

  conn = await pool.getConnection();
  await conn.beginTransaction();
  await conn.query('UPDATE ordens_servico SET status=? WHERE user_id=?', ['pendente', 'conta-1']);
  await conn.rollback();
  await wait(40);
  assert.equal(events(res).length, 1, 'rollback não gera evento novo');
});

test('sem o dono nos parâmetros, avisa quem está conectado; sem conectados, nada acontece', async () => {
  const hub = createRealtimeHub({ debounceMs: 10 });
  const pool = instrumentDatabase(fakePool(), hub);
  await pool.query('UPDATE contas_pagar SET status=? WHERE id=?', ['pago', 'c1']); // ninguém conectado
  const res = fakeResponse();
  const unsubscribe = hub.subscribe('conta-1', res);
  await pool.query('UPDATE contas_pagar SET status=? WHERE id=?', ['pago', 'c1']);
  await wait(40);
  assert.equal(events(res).length, 1);
  unsubscribe();
  assert.equal(hub.count(), 0);
});
