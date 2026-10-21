import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agendaTemperature, findDuplicateGroups, formatCpf, generateCode, hashCode, isValidCpf, maskCpf, maskPhone,
  nextWorkingDays, phoneKey, phonesMatch, pickPrimaryClient, signPortalRequest, verifyPortalRequest, whatsappNumber,
} from './portal-core.mjs';

test('CPF: valida dígitos, formata e mascara', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('52998224726'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('123'), false);
  assert.equal(formatCpf('52998224725'), '529.982.247-25');
  assert.equal(maskCpf('529.982.247-25'), '***.982.247-**');
});

test('telefone: compara com e sem 9, DDD e +55', () => {
  assert.equal(phonesMatch('(61) 98112-6864', '61981126864'), true);
  assert.equal(phonesMatch('+55 61 8112-6864', '61981126864'), true);
  assert.equal(phonesMatch('556181126864', '(61) 9 8112-6864'), true);
  assert.equal(phonesMatch('98112-6864', '(61) 98112-6864'), true);
  assert.equal(phonesMatch('(62) 98112-6864', '(61) 98112-6864'), false);
  assert.equal(phonesMatch('(61) 98112-6865', '(61) 98112-6864'), false);
  assert.equal(phonesMatch('', '(61) 98112-6864'), false);
  assert.deepEqual(phoneKey('(61) 98112-6864'), { ddd: '61', final8: '81126864' });
  assert.equal(maskPhone('61981126864'), '(61) ****-6864');
  assert.equal(whatsappNumber('(61) 98112-6864'), '5561981126864');
  assert.equal(whatsappNumber('5561981126864'), '5561981126864');
});

test('assinatura: aceita a própria, recusa alterada, velha ou sem segredo', () => {
  const secret = 'segredo-de-teste';
  const body = JSON.stringify({ cpf: '52998224725' });
  const { timestamp, signature } = signPortalRequest({ secret, method: 'post', path: '/api/portal/v1/x', body, timestamp: 1_000_000 });
  const base = { secret, method: 'POST', path: '/api/portal/v1/x', body, timestamp, signature, now: 1_000_000 };
  assert.equal(verifyPortalRequest(base), true);
  assert.equal(verifyPortalRequest({ ...base, body: body.replace('25', '26') }), false);
  assert.equal(verifyPortalRequest({ ...base, path: '/api/portal/v1/y' }), false);
  assert.equal(verifyPortalRequest({ ...base, now: 1_000_000 + 6 * 60 * 1000 }), false);
  assert.equal(verifyPortalRequest({ ...base, secret: '' }), false);
  assert.equal(verifyPortalRequest({ ...base, signature: 'zz' }), false);
});

test('código: 6 dígitos e hash depende do id e do código', () => {
  const code = generateCode();
  assert.match(code, /^\d{6}$/);
  assert.equal(hashCode('s', 'v1', '123456'), hashCode('s', 'v1', '123 456'));
  assert.notEqual(hashCode('s', 'v1', '123456'), hashCode('s', 'v2', '123456'));
});

test('agenda: níveis e primeiro dia com folga', () => {
  const dias = ['2026-10-21', '2026-10-22', '2026-10-23'];
  const t = agendaTemperature({ capacidade: 4, dias, ocupacao: { '2026-10-21': 5, '2026-10-22': 4, '2026-10-23': 1 } });
  assert.deepEqual(t.dias.map((d) => d.nivel), ['cheia', 'cheia', 'tranquila']);
  assert.equal(t.primeiroDiaLivre, '2026-10-23');
  assert.equal(t.nivel, 'moderada');
  assert.equal(agendaTemperature({ capacidade: 0, dias, ocupacao: {} }).nivel, 'tranquila');
});

test('dias úteis pulam domingo', () => {
  // 2026-10-24 é sábado, 25 domingo
  assert.deepEqual(nextWorkingDays('2026-10-24', 3), ['2026-10-24', '2026-10-26', '2026-10-27']);
});

test('duplicados: CPF junta, telefone sugere, CPFs diferentes nunca juntam', () => {
  const clients = [
    { id: 'a', nome: 'João Silva', cpf_cnpj: '529.982.247-25', telefone: '61981126864' },
    { id: 'b', nome: 'Joao S.', cpf_cnpj: '52998224725', telefone: '' },
    { id: 'c', nome: 'Maria', cpf_cnpj: '', telefone: '(61) 9999-0000' },
    { id: 'd', nome: 'maria souza', cpf_cnpj: null, telefone: '61999990000' },
    { id: 'e', nome: 'Pedro', cpf_cnpj: '', telefone: '6199990000' },
    { id: 'f', nome: 'Ana', cpf_cnpj: '111.444.777-35', telefone: '61988887777' },
    { id: 'g', nome: 'Ana', cpf_cnpj: '529.982.247-25', telefone: '61988887777' },
    { id: 'h', nome: 'Sozinho', cpf_cnpj: '', telefone: '' },
  ];
  const groups = findDuplicateGroups(clients);
  const byIds = Object.fromEntries(groups.map((g) => [g.clientes.map((c) => c.id).sort().join(','), g.motivo]));
  assert.equal(byIds['a,b,g'], 'cpf');
  assert.equal(byIds['c,d,e'], 'telefone_nomes_diferentes');
  assert.equal(Object.keys(byIds).some((k) => k.includes('f')), false);
  assert.equal(Object.keys(byIds).some((k) => k.includes('h')), false);
});

test('cadastro principal: mais OS, depois mais completo', () => {
  const members = [
    { id: 'x', cpf_cnpj: '1', telefone: '1', email: 'a', created_at: '2024' },
    { id: 'y', cpf_cnpj: '', telefone: '1', email: '', created_at: '2023' },
  ];
  assert.equal(pickPrimaryClient(members, {}).id, 'x');
  assert.equal(pickPrimaryClient(members, { y: 3, x: 1 }).id, 'y');
});
