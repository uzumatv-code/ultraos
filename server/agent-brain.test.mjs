import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAgentBrain, buildSystemPrompt } from './agent-brain.mjs';

function fakeOpenAi(script) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      requests.push(JSON.parse(raw));
      const out = script[requests.length - 1];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` })));
}

test('executa a ferramenta pedida pelo modelo e devolve a resposta final', async () => {
  const fake = await fakeOpenAi([
    { id: 'r1', output: [{ type: 'function_call', call_id: 'c1', name: 'criar_conta_pagar', arguments: JSON.stringify({ descricao: 'Conta de água', valor: 199, vencimento: '2026-10-10', recorrente: true, periodicidade: 'mensal' }) }] },
    { id: 'r2', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Pronto! Conta de água cadastrada.' }] }] },
  ]);
  const created = [];
  const brain = createAgentBrain({
    pool: { query: async () => [[]] }, now: () => '', todayDate: () => '2026-10-01', timezone: 'America/Sao_Paulo',
    apiKey: 'k', model: 'gpt-test', baseUrl: fake.url, formatBRL: String,
    actions: { createPayable: async (u, a) => { created.push(a); return { ok: true, ids: ['x'] }; } },
  });
  const result = await brain.converse({ authorized: { user_id: 'u', nome: 'Samuel Silva' }, phone: '1', message: 'cadastra conta de agua 199 dia 10 todo mes', canWrite: true });
  fake.server.close();

  assert.equal(result.reply, 'Pronto! Conta de água cadastrada.');
  assert.equal(created[0].valor, 199);
  assert.equal(created[0].recorrente, true);
  assert.equal(result.actions[0].type, 'conta_pagar');
  assert.equal(fake.requests[1].previous_response_id, 'r1');
  assert.equal(fake.requests[1].input[0].type, 'function_call_output');
  assert.equal(fake.requests[0].input.at(-1).content, 'cadastra conta de agua 199 dia 10 todo mes');
});

test('número só de consulta não executa ferramentas de escrita', async () => {
  const fake = await fakeOpenAi([
    { id: 'r1', output: [{ type: 'function_call', call_id: 'c1', name: 'registrar_despesa', arguments: '{"descricao":"x","valor":1}' }] },
    { id: 'r2', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Sem permissão.' }] }] },
  ]);
  let wrote = false;
  const brain = createAgentBrain({
    pool: { query: async () => [[]] }, now: () => '', todayDate: () => '2026-10-01', timezone: 'America/Sao_Paulo',
    apiKey: 'k', model: 'gpt-test', baseUrl: fake.url, formatBRL: String,
    actions: { registerExpense: async () => { wrote = true; return {}; } },
  });
  await brain.converse({ authorized: { user_id: 'u' }, phone: '1', message: 'gastei 1', canWrite: false });
  fake.server.close();
  assert.equal(wrote, false);
  assert.match(fake.requests[1].input[0].output, /sem permiss/i);
});

test('prompt orienta perguntar recorrência e carrega a data de hoje', () => {
  const prompt = buildSystemPrompt({ nome: 'Samuel', hojeIso: '2026-10-01', diaSemana: 'quinta-feira', timezone: 'America/Sao_Paulo', canWrite: true });
  assert.match(prompt, /recorrente/i);
  assert.match(prompt, /2026-10-01/);
});
