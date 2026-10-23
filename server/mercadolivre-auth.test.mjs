import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { createMercadoLivreAuth, pkce, tokensDaResposta, urlAutorizacao } from './mercadolivre-auth.mjs';

/** Banco em memória com só a tabela da conexão. */
function fakePool() {
  const linhas = new Map();
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE')) return [[]];
    if (s.startsWith('SELECT * FROM mercadolivre_conexao')) return [[linhas.get(params[0])].filter(Boolean).map((l) => ({ ...l }))];
    if (s.startsWith('INSERT INTO mercadolivre_conexao')) {
      const [userId, access, refresh, expira, mlUser, apelido, conectadoEm, updated] = params;
      const atual = linhas.get(userId) || {};
      linhas.set(userId, {
        user_id: userId, access_token: access, refresh_token: refresh, expira_em: expira, ml_user_id: mlUser ?? atual.ml_user_id,
        ml_apelido: apelido ?? atual.ml_apelido, conectado_em: conectadoEm ?? atual.conectado_em, erro: null, updated_at: updated,
      });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE mercadolivre_conexao SET access_token = NULL')) {
      Object.assign(linhas.get(params[2]), { access_token: null, refresh_token: null, erro: params[0] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM mercadolivre_conexao')) { linhas.delete(params[0]); return [{ affectedRows: 1 }]; }
    throw new Error(`SQL não simulado: ${s}`);
  };
  return { query, linhas };
}

/** Servidor OAuth do Mercado Livre falso: confere PKCE, gira o token de renovação (uso único) e responde /users/me. */
function fakeMercadoLivre(t) {
  const ml = { desafios: new Map(), refreshValidos: new Set(), trocas: 0, renovacoes: 0 };
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.post('/oauth/token', (req, res) => {
    const b = req.body;
    if (b.client_id !== 'app-1' || b.client_secret !== 'segredo') return res.status(401).json({ error: 'invalid_client' });
    let n;
    if (b.grant_type === 'authorization_code') {
      const desafio = ml.desafios.get(b.code);
      const confere = desafio && crypto.createHash('sha256').update(b.code_verifier || '').digest('base64url') === desafio;
      if (!confere || !b.redirect_uri.endsWith('/api/mercadolivre/callback')) return res.status(400).json({ error: 'invalid_grant' });
      ml.trocas += 1;
      n = `t${ml.trocas}`;
    } else if (b.grant_type === 'refresh_token') {
      if (!ml.refreshValidos.has(b.refresh_token)) return res.status(400).json({ error: 'invalid_grant', message: 'refresh usado' });
      ml.refreshValidos.delete(b.refresh_token);
      ml.renovacoes += 1;
      n = `r${ml.renovacoes}`;
    } else {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    ml.refreshValidos.add(`refresh-${n}`);
    res.json({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 21600, user_id: 99 });
  });
  app.get('/users/me', (req, res) => res.json({ nickname: req.get('authorization') ? 'LUTHIERIA_PRIME' : null }));
  const server = app.listen(0);
  t.after(() => server.close());
  return { ml, url: `http://127.0.0.1:${server.address().port}` };
}

async function iniciar(t) {
  const { ml, url } = fakeMercadoLivre(t);
  const pool = fakePool();
  const auth = createMercadoLivreAuth({
    pool, now: () => new Date().toISOString(), clientId: 'app-1', clientSecret: 'segredo', osPublicUrl: 'https://os.exemplo.com',
    apiUrl: url, authUrl: 'https://auth.mercadolivre.com.br', log: { error() {}, info() {} },
  });
  await auth.ensureSchema();
  const app = express();
  app.use('/api/mercadolivre', auth.callbackRouter);
  const server = app.listen(0);
  t.after(() => server.close());
  const callback = async (query) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/mercadolivre/callback?${new URLSearchParams(query)}`, { redirect: 'manual' });
    return new URL(res.headers.get('location'));
  };
  // Simula o navegador autorizando no ML: o código fica ligado ao desafio PKCE da URL.
  const autorizar = (urlConexao, code) => {
    const u = new URL(urlConexao);
    ml.desafios.set(code, u.searchParams.get('code_challenge'));
    return { code, state: u.searchParams.get('state') };
  };
  return { auth, pool, ml, callback, autorizar };
}

test('URL de autorização e PKCE', () => {
  const { verificador, desafio } = pkce();
  assert.equal(crypto.createHash('sha256').update(verificador).digest('base64url'), desafio);
  const u = new URL(urlAutorizacao({ authUrl: 'https://auth.mercadolivre.com.br', clientId: 'c', redirectUri: 'https://os.x/api/mercadolivre/callback', state: 's', desafio }));
  assert.equal(u.origin + u.pathname, 'https://auth.mercadolivre.com.br/authorization');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://os.x/api/mercadolivre/callback');
  assert.equal(tokensDaResposta({ access_token: 'a' }), null);
});

test('conectar: troca o código, guarda o acesso e o state não pode ser reutilizado', async (t) => {
  const { auth, pool, callback, autorizar } = await iniciar(t);
  assert.deepEqual(await auth.status('u1'), {
    configurado: true, conectado: false, apelido: null, conectado_em: null, erro: null, token_fixo: false, redirect_uri: 'https://os.exemplo.com/api/mercadolivre/callback',
  });
  const pedido = autorizar(auth.iniciar('u1').url, 'code-1');
  const volta = await callback(pedido);
  assert.equal(volta.pathname, '/loja/recomendados');
  assert.equal(volta.searchParams.get('ml'), 'conectado');
  assert.equal(pool.linhas.get('u1').access_token, 'access-t1');
  const st = await auth.status('u1');
  assert.equal(st.conectado, true);
  assert.equal(st.apelido, 'LUTHIERIA_PRIME');
  assert.equal(await auth.token('u1'), 'access-t1');

  const repetido = await callback(pedido);
  assert.equal(repetido.searchParams.get('ml'), 'erro');
  assert.match(repetido.searchParams.get('motivo'), /expirou/);
  assert.equal((await callback({ code: 'x', state: 'inventado' })).searchParams.get('ml'), 'erro');
});

test('verificador PKCE errado não conecta', async (t) => {
  const { auth, ml, callback } = await iniciar(t);
  const state = new URL(auth.iniciar('u1').url).searchParams.get('state');
  ml.desafios.set('code-x', 'desafio-de-outro');
  const volta = await callback({ code: 'code-x', state });
  assert.equal(volta.searchParams.get('ml'), 'erro');
  assert.equal((await auth.status('u1')).conectado, false);
});

test('renovação: perto de vencer troca o token (uma vez só, mesmo com pedidos simultâneos)', async (t) => {
  const { auth, pool, ml, callback, autorizar } = await iniciar(t);
  await callback(autorizar(auth.iniciar('u1').url, 'code-1'));
  pool.linhas.get('u1').expira_em = new Date(Date.now() + 60 * 1000).toISOString();
  const tokens = await Promise.all([auth.token('u1'), auth.token('u1'), auth.token('u1')]);
  assert.deepEqual(tokens, ['access-r1', 'access-r1', 'access-r1']);
  assert.equal(ml.renovacoes, 1);
  assert.equal(pool.linhas.get('u1').refresh_token, 'refresh-r1');
  assert.equal(await auth.token('u1'), 'access-r1', 'ainda válido: não renova de novo');
  assert.equal(await auth.token('u1', { forcar: true }), 'access-r2');
});

test('autorização revogada: desconecta e pede para conectar de novo', async (t) => {
  const { auth, pool, ml, callback, autorizar } = await iniciar(t);
  await callback(autorizar(auth.iniciar('u1').url, 'code-1'));
  ml.refreshValidos.clear();
  pool.linhas.get('u1').expira_em = new Date(Date.now() - 1000).toISOString();
  assert.equal(await auth.token('u1'), null);
  const st = await auth.status('u1');
  assert.equal(st.conectado, false);
  assert.match(st.erro, /Conecte a conta de novo/);
  await auth.desconectar('u1');
  assert.equal((await auth.status('u1')).erro, null);
});

test('sem client id/secret: não conecta e usa o token fixo, se houver', async () => {
  const auth = createMercadoLivreAuth({ pool: fakePool(), now: () => '', envToken: 'fixo', log: { error() {} } });
  assert.throws(() => auth.iniciar('u1'), /MERCADOLIVRE_CLIENT_ID/);
  assert.equal(await auth.token('u1'), 'fixo');
  assert.equal((await auth.status('u1')).configurado, false);
});
