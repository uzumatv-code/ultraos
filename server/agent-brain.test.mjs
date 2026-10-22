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

test('encaminha as ferramentas da loja e bloqueia escrita sem permissão', async () => {
  const fake = await fakeOpenAi([
    { id: 'r1', output: [{ type: 'function_call', call_id: 'c1', name: 'loja_cadastrar_produto', arguments: JSON.stringify({ titulo: 'Violão Tagima AC34 Preto', preco: 340, destaque: true }) }] },
    { id: 'r2', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Cadastrei o Violão Tagima AC34 Preto.' }] }] },
    { id: 'r3', output: [{ type: 'function_call', call_id: 'c2', name: 'loja_marcar_vendido', arguments: JSON.stringify({ produto_id: 'p1' }) }] },
    { id: 'r4', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Sem permissão.' }] }] },
  ]);
  const calls = [];
  const brain = createAgentBrain({
    pool: { query: async () => [[]] }, now: () => '', todayDate: () => '2026-10-01', timezone: 'America/Sao_Paulo',
    apiKey: 'k', model: 'gpt-test', baseUrl: fake.url, formatBRL: String, actions: { listRules: async () => [] },
    lojaTools: { run: async (name, args) => { calls.push({ name, args }); return { ok: true, produto_id: 'p1' }; } },
  });
  const ok = await brain.converse({ authorized: { user_id: 'u', nome: 'Samuel' }, phone: '1', message: 'cadastra esse violão tagima ac34 preto 340 em destaque', canWrite: true });
  assert.equal(ok.reply, 'Cadastrei o Violão Tagima AC34 Preto.');
  assert.equal(calls[0].name, 'loja_cadastrar_produto');
  assert.equal(calls[0].args.preco, 340);
  assert.ok(fake.requests[0].tools.some((tool) => tool.name === 'loja_cadastrar_produto'));

  await brain.converse({ authorized: { user_id: 'u', nome: 'Samuel' }, phone: '1', message: 'vendi o tagima', canWrite: false });
  fake.server.close();
  assert.equal(calls.length, 1, 'sem permissão de escrita a ferramenta não roda');
  assert.match(fake.requests[3].input[0].output, /permissão/);
});

test('prompt explica o fluxo da loja', () => {
  const prompt = buildSystemPrompt({ nome: 'Samuel', hojeIso: '2026-10-01', diaSemana: 'quarta-feira', timezone: 'America/Sao_Paulo', canWrite: true });
  assert.match(prompt, /loja_cadastrar_produto/);
  assert.match(prompt, /loja_marcar_vendido/);
});
