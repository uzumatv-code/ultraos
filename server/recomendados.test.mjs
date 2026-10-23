import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRecomendados } from './recomendados.mjs';
import { signPortalRequest } from './portal-core.mjs';

const TENANT = 'conta-1';
const SECRET = 'x'.repeat(40);

/** Banco em memória com só o que os recomendados usam. */
function fakePool() {
  const recs = new Map();
  const cliques = [];
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE')) return [[]];
    if (s.startsWith('SELECT COALESCE(MAX(ordem)')) return [[{ ordem: recs.size + 1 }]];
    if (s.startsWith('INSERT INTO loja_recomendados')) {
      const [id, userId, titulo, link, anuncio, ordem, created, updated] = params;
      recs.set(id, {
        id, user_id: userId, titulo, link_afiliado: link, url_anuncio: anuncio, ordem, created_at: created, updated_at: updated, ativo: 0,
        categoria: null, marca: null, motivo: null, preco: null, preco_de: null, preco_em: null, imagem: null, disponivel_ml: null, ml_tipo: null, ml_id: null,
      });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT * FROM loja_recomendados WHERE id = ? AND user_id = ?')) {
      const r = recs.get(params[0]);
      return [[r && r.user_id === params[1] ? { ...r } : undefined].filter(Boolean)];
    }
    if (s.startsWith('SELECT * FROM loja_recomendados WHERE id = ?')) return [[recs.get(params[0])].filter(Boolean).map((r) => ({ ...r }))];
    if (s.startsWith("UPDATE loja_recomendados SET titulo = IF(titulo = ''")) {
      const [titulo, url, tipo, mlId, imagem, preco, precoDe, precoNulo, precoEm, disponivel, , updated, id] = params;
      const r = recs.get(id);
      Object.assign(r, {
        titulo: r.titulo || titulo, url_anuncio: url, ml_tipo: tipo, ml_id: mlId, imagem, preco: preco ?? r.preco, preco_de: precoDe,
        preco_em: precoNulo == null ? r.preco_em : precoEm, disponivel_ml: disponivel ?? r.disponivel_ml, sincronia_erro: null, updated_at: updated,
      });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE loja_recomendados SET sincronia_erro')) {
      recs.get(params[2]).sincronia_erro = params[0];
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE loja_recomendados SET titulo = ?')) {
      const [titulo, categoria, marca, motivo, link, anuncio, preco, precoDe, ativo, ordem] = params;
      Object.assign(recs.get(params[params.length - 1]), { titulo, categoria, marca, motivo, link_afiliado: link, url_anuncio: anuncio, preco, preco_de: precoDe, ativo, ordem });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT recomendado_id, COUNT(*)')) {
      const grupos = {};
      for (const c of cliques.filter((x) => x.user_id === params[1])) {
        grupos[c.recomendado_id] ??= { recomendado_id: c.recomendado_id, total: 0, recentes: 0 };
        grupos[c.recomendado_id].total += 1;
        if (c.created_at > params[0]) grupos[c.recomendado_id].recentes += 1;
      }
      return [Object.values(grupos)];
    }
    if (s.startsWith('SELECT id, link_afiliado FROM loja_recomendados')) {
      const r = recs.get(params[0]);
      return [[r && r.user_id === params[1] && r.ativo === 1 && r.disponivel_ml !== 0 ? r : undefined].filter(Boolean)];
    }
    if (s.includes('AND ativo = 1 AND (disponivel_ml IS NULL OR disponivel_ml = 1)')) {
      return [[...recs.values()].filter((r) => r.user_id === params[0] && r.ativo === 1 && r.disponivel_ml !== 0)];
    }
    if (s.startsWith('INSERT INTO loja_recomendado_cliques')) {
      const [id, userId, recId, origem, created] = params;
      cliques.push({ id, user_id: userId, recomendado_id: recId, origem, created_at: created });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT * FROM loja_recomendados WHERE user_id = ?')) return [[...recs.values()].filter((r) => r.user_id === params[0])];
    throw new Error(`SQL não simulado: ${s}`);
  };
  return { query, recs, cliques };
}

async function iniciar(t) {
  // API do Mercado Livre falsa: um anúncio ativo, sem foto (nada é baixado da internet).
  const ml = express();
  ml.get('/items/MLB123456789', (_req, res) => res.json({ id: 'MLB123456789', title: 'Encordoamento EXL110', price: 49.9, status: 'active' }));
  const mlServer = ml.listen(0);
  const pool = fakePool();
  let n = 0;
  const rec = createRecomendados({
    pool, uuid: () => `id-${++n}`, now: () => new Date().toISOString(), getTenantId: () => TENANT, secret: SECRET,
    uploadsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rec-')), osPublicUrl: 'https://os.exemplo.com', log: { error() {}, info() {} },
    mlApiUrl: `http://127.0.0.1:${mlServer.address().port}`,
  });
  await rec.ensureSchema();
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/api/loja/v1/recomendados', rec.router);
  app.use('/api/loja-admin/recomendados', (req, _res, next) => { req.auth = { accountId: TENANT }; next(); }, rec.adminRouter);
  const server = app.listen(0);
  t.after(() => { server.close(); mlServer.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const painel = async (metodo, caminho, corpo) => {
    const res = await fetch(`${base}/api/loja-admin/recomendados${caminho}`, {
      method: metodo, headers: { 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  const site = async (metodo, caminho, corpo, { assinar = true } = {}) => {
    const full = `/api/loja/v1/recomendados${caminho}`;
    const raw = corpo ? JSON.stringify(corpo) : '';
    const { timestamp, signature } = signPortalRequest({ secret: SECRET, method: metodo, path: full, body: raw });
    const headers = { ...(raw ? { 'content-type': 'application/json' } : {}), ...(assinar ? { 'x-portal-timestamp': timestamp, 'x-portal-signature': signature } : {}) };
    const res = await fetch(base + full, { method: metodo, headers, body: raw || undefined });
    return { status: res.status, body: await res.json() };
  };
  return { painel, site, pool };
}

test('cadastro preenche pelo anúncio, publicação exige o motivo e o site só vê o que está ativo', async (t) => {
  const { painel, site } = await iniciar(t);
  assert.equal((await painel('POST', '/', { link_afiliado: 'https://golpe.com/x' })).status, 400);

  const criado = await painel('POST', '/', {
    link_afiliado: 'https://mercadolivre.com/sec/1AbCdEf',
    url_anuncio: 'https://produto.mercadolivre.com.br/MLB-123456789-encordoamento-_JM',
  });
  assert.equal(criado.status, 200);
  const r = criado.body.data;
  assert.equal(r.titulo, 'Encordoamento EXL110');
  assert.equal(r.preco, 49.9);
  assert.equal(r.ml_id, 'MLB123456789');
  assert.equal(r.disponivel_ml, true);
  assert.equal(r.ativo, false);
  assert.equal(r.aviso, null);
  assert.deepEqual((await site('GET', '/')).body.recomendados, []);

  const semMotivo = await painel('PUT', `/${r.id}`, { ativo: true });
  assert.equal(semMotivo.status, 400);
  assert.match(semMotivo.body.error.message, /por que/);

  const publicado = await painel('PUT', `/${r.id}`, { ativo: true, motivo: 'É a corda que usamos nas regulagens.', categoria: 'Cordas' });
  assert.equal(publicado.body.data.ativo, true);

  const vitrine = (await site('GET', '/')).body.recomendados;
  assert.equal(vitrine.length, 1);
  assert.equal(vitrine[0].motivo, 'É a corda que usamos nas regulagens.');
  assert.equal(vitrine[0].loja, 'Mercado Livre');
  assert.equal(vitrine[0].link_afiliado, undefined, 'o link só sai pelo clique');
});

test('clique: exige assinatura, conta só gente e devolve o link de afiliado', async (t) => {
  const { painel, site, pool } = await iniciar(t);
  const r = (await painel('POST', '/', { link_afiliado: 'https://meli.la/2xYz', url_anuncio: 'https://produto.mercadolivre.com.br/MLB-123456789-x' })).body.data;
  assert.equal((await site('POST', `/${r.id}/clique`, { origem: 'vitrine' })).status, 404, 'fora do site ainda');
  await painel('PUT', `/${r.id}`, { ativo: true, motivo: 'Boa.' });

  assert.equal((await site('POST', `/${r.id}/clique`, { origem: 'vitrine' }, { assinar: false })).status, 401);
  const clique = await site('POST', `/${r.id}/clique`, { origem: 'Vitrine' });
  assert.equal(clique.body.url, 'https://meli.la/2xYz');
  await site('POST', `/${r.id}/clique`, { origem: 'vitrine', contar: false });
  assert.equal(pool.cliques.length, 1);
  assert.equal(pool.cliques[0].origem, 'vitrine');

  const lista = (await painel('GET', '/')).body.data;
  assert.equal(lista.recomendados[0].cliques_total, 1);
  assert.equal(lista.recomendados[0].cliques_30d, 1);

  // Pausado no Mercado Livre: some da vitrine e o clique não leva mais ao anúncio parado.
  pool.recs.get(r.id).disponivel_ml = 0;
  assert.deepEqual((await site('GET', '/')).body.recomendados, []);
  assert.equal((await site('POST', `/${r.id}/clique`, { origem: 'os' })).status, 404);
  assert.equal(pool.cliques.length, 1);
});

test('anúncio que não dá para identificar vira aviso, e o cadastro continua para preencher à mão', async (t) => {
  const { painel } = await iniciar(t);
  // Endereço do anúncio sem id: falha antes de qualquer chamada ao Mercado Livre.
  const criado = await painel('POST', '/', { link_afiliado: 'https://mercadolivre.com/sec/1AbCdEf', url_anuncio: 'https://www.mercadolivre.com.br/ofertas', titulo: 'Afinador' });
  assert.equal(criado.status, 200);
  assert.equal(criado.body.data.titulo, 'Afinador');
  assert.match(criado.body.data.aviso, /identificar o anúncio/);
});
