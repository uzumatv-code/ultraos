import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLojaTools, medidasPadrao, rankProdutos } from './loja-agent.mjs';

/** Banco em memória com só o que as ferramentas da loja usam. */
function fakePool({ fotos = [] } = {}) {
  const produtos = new Map();
  const acoes = [];
  const comprovantes = [...fotos];
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO loja_produtos')) {
      const cols = s.match(/\(id, user_id, slug, (.*?), created_at, updated_at\)/)[1].split(', ');
      const [id, userId, slug, ...rest] = params;
      const row = { id, user_id: userId, slug, imagens: null, publicado_em: null, created_at: new Date().toISOString() };
      cols.forEach((c, i) => { row[c] = rest[i]; });
      produtos.set(id, row);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT * FROM loja_produtos WHERE id = ? AND user_id = ?')) {
      const p = produtos.get(params[0]);
      return [[p && p.user_id === params[1] ? { ...p } : undefined].filter(Boolean)];
    }
    if (s.startsWith('SELECT id FROM loja_produtos WHERE user_id = ? AND slug = ?')) {
      return [[...produtos.values()].filter((p) => p.slug === params[1] && p.id !== params[2])];
    }
    if (s.includes("tipo = 'fisico' AND created_at >= ?")) {
      return [[...produtos.values()].filter((p) => p.user_id === params[0] && p.created_at >= params[1])];
    }
    if (s.startsWith('SELECT * FROM loja_produtos WHERE user_id = ? AND tipo')) {
      const status = params.slice(1);
      return [[...produtos.values()].filter((p) => p.user_id === params[0] && status.includes(p.status))];
    }
    if (s.startsWith('UPDATE loja_produtos SET imagens = ?')) {
      produtos.get(params[2]).imagens = params[0];
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE loja_produtos SET')) {
      const cols = [...s.matchAll(/`(\w+)` = \?/g)].map((m) => m[1]);
      const p = produtos.get(params[params.length - 1]);
      cols.forEach((c, i) => { p[c] = params[i]; });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM loja_produtos')) { produtos.delete(params[0]); return [{ affectedRows: 1 }]; }
    if (s.startsWith('SELECT id, tipo_mime, conteudo FROM comprovantes_financeiros')) return [comprovantes.filter((c) => c.user_id === params[0])];
    if (s.startsWith('DELETE FROM comprovantes_financeiros')) {
      const i = comprovantes.findIndex((c) => c.id === params[0]);
      if (i >= 0) comprovantes.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO loja_ia_acoes')) {
      const [id, userId, telefone, produtoId, acao, antes, createdAt] = params;
      acoes.push({ id, user_id: userId, telefone, produto_id: produtoId, acao, antes, desfeita: 0, created_at: createdAt });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT * FROM loja_ia_acoes')) return [[...acoes].reverse().filter((a) => !a.desfeita && a.user_id === params[0]).slice(0, 1)];
    if (s.startsWith('UPDATE loja_ia_acoes SET desfeita = 1')) { acoes.find((a) => a.id === params[0]).desfeita = 1; return [{ affectedRows: 1 }]; }
    if (s.startsWith('SELECT COUNT(*) AS n FROM loja_pedido_itens')) return [[{ n: 0 }]];
    throw new Error(`SQL não previsto no teste: ${s.slice(0, 80)}`);
  };
  return { query, produtos, acoes, comprovantes };
}

function setup(opts = {}) {
  const pool = fakePool(opts);
  let n = 0;
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loja-ia-'));
  const tools = createLojaTools({
    pool, uuid: () => `id-${(n += 1)}`, now: () => new Date().toISOString(), uploadsDir, siteUrl: 'https://site.test',
    gerarIA: opts.gerarIA || null, log: { warn() {} },
  });
  const ctx = { userId: 'u1', phone: '5561', actions: [] };
  return { pool, tools, ctx, uploadsDir };
}

test('medidas padrão de frete pelo tipo da peça', () => {
  assert.equal(medidasPadrao('Violão Tagima AC34 Preto').peso_g, 3500);
  assert.equal(medidasPadrao('Guitarra Strinberg').altura_cm, 110);
  assert.equal(medidasPadrao('Pedal Boss DS-1').peso_g, 700);
  assert.equal(medidasPadrao('Encordoamento 010').peso_g, 400);
});

test('busca tolera erro de digitação e marca ambiguidade', () => {
  const rows = [
    { id: 'a', titulo: 'Violão Tagima AC34 Preto' },
    { id: 'b', titulo: 'Violão Tagima AC34 Natural' },
    { id: 'c', titulo: 'Guitarra Fender Stratocaster' },
  ];
  const preto = rankProdutos(rows, 'tagima ac34 preto');
  assert.equal(preto.scored[0].row.id, 'a');
  assert.equal(preto.ambiguo, false);
  const qualquer = rankProdutos(rows, 'tagma ac34');
  assert.equal(qualquer.ambiguo, true);
  assert.equal(rankProdutos(rows, 'fendr strato').scored[0].row.id, 'c');
});

test('cadastra com as fotos recentes, textos da IA, destaque e publica', async () => {
  const fotos = [
    { id: 'f1', user_id: 'u1', tipo_mime: 'image/jpeg', conteudo: Buffer.from('jpg1') },
    { id: 'f2', user_id: 'u1', tipo_mime: 'image/jpeg', conteudo: Buffer.from('jpg2') },
  ];
  const { pool, tools, ctx, uploadsDir } = setup({
    fotos,
    gerarIA: async () => ({ subtitulo: 'Violão seminovo revisado', descricao: 'Texto.', seo_titulo: 'Violão Tagima AC34', seo_descricao: 'x'.repeat(130) }),
  });
  const r = await tools.run('loja_cadastrar_produto', { titulo: 'Violão Tagima AC34 Preto', preco: 340, condicao: 'seminovo', destaque: true }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'publicado');
  assert.equal(r.destaque, true);
  assert.equal(r.fotos_anexadas, 2);
  assert.equal(r.link, 'https://site.test/loja/violao-tagima-ac34-preto');
  assert.deepEqual(r.textos_escritos_pela_ia.sort(), ['descricao', 'seo_descricao', 'seo_titulo', 'subtitulo']);
  const p = pool.produtos.get(r.produto_id);
  assert.equal(p.peso_g, 3500);
  assert.equal(JSON.parse(p.imagens).length, 2);
  assert.equal(pool.comprovantes.length, 0, 'as fotos saem da lista de comprovantes pendentes');
  assert.ok(fs.existsSync(path.join(uploadsDir, 'loja', JSON.parse(p.imagens)[0].path)));
  assert.equal(ctx.actions[0].type, 'loja_cadastro');
});

test('cadastro exige preço', async () => {
  const { tools, ctx } = setup();
  await assert.rejects(() => tools.run('loja_cadastrar_produto', { titulo: 'Violão Giannini' }, ctx), /preço/);
});

test('vendido tira do site e o desfaz devolve', async () => {
  const { tools, ctx } = setup();
  const novo = await tools.run('loja_cadastrar_produto', { titulo: 'Violão Tagima AC34 Preto', preco: 340 }, ctx);
  const busca = await tools.run('loja_buscar_produto', { busca: 'tagima ac 34 preto' }, ctx);
  assert.equal(busca.produtos[0].produto_id, novo.produto_id);

  const vendido = await tools.run('loja_marcar_vendido', { produto_id: novo.produto_id }, ctx);
  assert.equal(vendido.status, 'esgotado');
  assert.equal(vendido.no_site, false);
  assert.equal(vendido.preco_anunciado, 340);

  const desfeito = await tools.run('loja_desfazer_ultima_acao', {}, ctx);
  assert.equal(desfeito.desfeito, 'venda');
  assert.equal(desfeito.status, 'publicado');
  assert.equal(desfeito.no_site, true);
});

test('atualiza preço e destaque; excluir só com confirmação', async () => {
  const { pool, tools, ctx } = setup();
  const novo = await tools.run('loja_cadastrar_produto', { titulo: 'Pedal Boss DS-1', preco: 300 }, ctx);
  const r = await tools.run('loja_atualizar_produto', { produto_id: novo.produto_id, preco: 280, destaque: true }, ctx);
  assert.equal(r.preco, 280);
  assert.equal(r.destaque, true);

  const negado = await tools.run('loja_excluir_produto', { produto_id: novo.produto_id, confirmado: false }, ctx);
  assert.ok(negado.erro);
  assert.ok(pool.produtos.has(novo.produto_id));
  const ok = await tools.run('loja_excluir_produto', { produto_id: novo.produto_id, confirmado: true }, ctx);
  assert.equal(ok.excluido, true);
  assert.equal(pool.produtos.has(novo.produto_id), false);
});

test('desfazer o cadastro remove o produto', async () => {
  const { pool, tools, ctx } = setup();
  const novo = await tools.run('loja_cadastrar_produto', { titulo: 'Ukulele Kalani', preco: 250 }, ctx);
  const r = await tools.run('loja_desfazer_ultima_acao', {}, ctx);
  assert.equal(r.produto_removido, true);
  assert.equal(pool.produtos.has(novo.produto_id), false);
});

test('mesmo produto: nome contido no outro casa, cor ou modelo diferente não', async () => {
  const { mesmoProduto } = await import('./loja-agent.mjs');
  assert.equal(mesmoProduto('Violão Clássico Vogga VCA204 Preto', 'Violão Clássico Vogga VCA204'), true);
  assert.equal(mesmoProduto('Violão Vogga VCA204', 'Violão Clássico para iniciantes Vogga VCA204'), true);
  assert.equal(mesmoProduto('Violão Tagima AC34 Preto', 'Violão Tagima AC34 Natural'), false);
  assert.equal(mesmoProduto('Violão Vogga VCA204', 'Violão Vogga VCA203'), false);
});

test('cadastro repetido em seguida não duplica o produto', async () => {
  const { pool, tools, ctx } = setup();
  const primeiro = await tools.run('loja_cadastrar_produto', { titulo: 'Violão Clássico Vogga VCA204 Preto', preco: 250, preco_de: 350 }, ctx);
  const segundo = await tools.run('loja_cadastrar_produto', { titulo: 'Violão Clássico Vogga VCA204', preco: 250 }, ctx);
  assert.equal(segundo.ja_estava_cadastrado, true);
  assert.equal(segundo.produto_id, primeiro.produto_id);
  assert.equal(pool.produtos.size, 1);
});
