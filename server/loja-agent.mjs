/**
 * Ferramentas da loja do site para o agente de IA (WhatsApp).
 *
 * Fluxo típico: o dono manda as fotos (cada uma chega como imagem pendente, guardada em
 * comprovantes_financeiros) e depois "cadastra esse violão Tagima AC34 preto seminovo 340, em destaque".
 * O cadastro junta as fotos recentes ao produto, escreve os textos com a IA da loja e publica.
 * "Vendi o Tagima AC34, tira do site" marca como esgotado. Toda alteração fica em loja_ia_acoes
 * para o "desfaz".
 */

import fs from 'node:fs';
import path from 'node:path';
import { STATUS_PRODUTO, limparTextosIA, money, promptTextosProduto, slugify } from './loja-core.mjs';
import { normalize, similarity } from './os-agent.mjs';

const FOTO_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FOTOS_JANELA_MS = 30 * 60 * 1000;
const DESFAZER_JANELA_MS = 12 * 3600 * 1000;
const MAX_FOTOS = 12;

/** Embalagem típica por tipo de peça (peso em g, medidas em cm), usada no frete quando ninguém informou. */
const MEDIDAS = [
  { termos: ['contrabaixo', 'baixo'], medidas: { peso_g: 5500, altura_cm: 130, largura_cm: 45, comprimento_cm: 15 } },
  { termos: ['guitarra'], medidas: { peso_g: 5000, altura_cm: 110, largura_cm: 42, comprimento_cm: 13 } },
  { termos: ['violao', 'viola', 'violino', 'violoncelo'], medidas: { peso_g: 3500, altura_cm: 110, largura_cm: 45, comprimento_cm: 15 } },
  { termos: ['ukulele', 'cavaquinho', 'cavaco', 'bandolim'], medidas: { peso_g: 1500, altura_cm: 75, largura_cm: 30, comprimento_cm: 12 } },
  { termos: ['amplificador', 'amp', 'cubo', 'caixa'], medidas: { peso_g: 8000, altura_cm: 45, largura_cm: 45, comprimento_cm: 30 } },
  { termos: ['pedal', 'pedaleira', 'efeito'], medidas: { peso_g: 700, altura_cm: 20, largura_cm: 15, comprimento_cm: 10 } },
  { termos: ['case', 'bag', 'capa', 'estojo'], medidas: { peso_g: 2500, altura_cm: 115, largura_cm: 45, comprimento_cm: 15 } },
];
const MEDIDAS_ACESSORIO = { peso_g: 400, altura_cm: 20, largura_cm: 15, comprimento_cm: 8 };

export function medidasPadrao(...textos) {
  const tokens = normalize(textos.filter(Boolean).join(' ')).split(' ');
  const achado = MEDIDAS.find((item) => item.termos.some((termo) => tokens.includes(termo)));
  return { ...(achado ? achado.medidas : MEDIDAS_ACESSORIO) };
}

/** Ordena produtos pela parecença com o que foi dito; ambiguo quando os dois primeiros empatam. */
export function rankProdutos(rows, busca) {
  const scored = rows
    .map((row) => ({ row, score: similarity(busca, [row.titulo, row.marca, row.categoria, row.sku].filter(Boolean).join(' ')) }))
    .filter((item) => item.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  const ambiguo = scored.length > 1 && scored[0].score - scored[1].score < 0.12;
  return { scored, ambiguo };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export const LOJA_TOOLS = [
  {
    type: 'function',
    name: 'loja_buscar_produto',
    description: 'Procura produtos da LOJA DO SITE pelo nome falado (tolera erro de digitação). Use antes de alterar, vender ou excluir. Retorna ambiguo=true quando houver mais de um parecido: aí pergunte qual.',
    parameters: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Ex.: "tagima ac34 preto"' },
        incluir_fora_do_site: { type: 'boolean', description: 'Inclui rascunhos, esgotados e arquivados (padrão: só publicados e rascunhos)' },
      },
      required: ['busca'],
    },
  },
  {
    type: 'function',
    name: 'loja_cadastrar_produto',
    description:
      'Cadastra um produto físico (instrumento, equipamento ou acessório) na loja do site, juntando as FOTOS enviadas pelo WhatsApp nos últimos 30 minutos, ' +
      'escrevendo os textos de venda com IA e publicando. Preço é obrigatório.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Nome de vitrine, ex.: "Violão Tagima AC34 Preto". Corrija a grafia de marca/modelo.' },
        preco: { type: 'number', description: 'Preço de venda em reais' },
        preco_de: { type: 'number', description: 'Preço "de" riscado, se a pessoa falar em promoção' },
        condicao: { type: 'string', enum: ['novo', 'seminovo'] },
        marca: { type: 'string' },
        categoria: { type: 'string', description: 'Violões, Guitarras, Contrabaixos, Ukuleles, Amplificadores, Pedais, Acessórios…' },
        destaque: { type: 'boolean', description: 'Aparece em destaque na vitrine' },
        publicar: { type: 'boolean', description: 'Padrão true. false = salva como rascunho, fora do site' },
        estado: { type: 'string', description: 'Anotações sobre o estado/revisão do seminovo, se a pessoa disser (vira o laudo; nunca invente)' },
        estoque: { type: 'integer', description: 'Quantidade; padrão 1' },
        usar_fotos_recentes: { type: 'boolean', description: 'Padrão true: anexa as fotos enviadas nos últimos 30 min' },
      },
      required: ['titulo', 'preco'],
    },
  },
  {
    type: 'function',
    name: 'loja_atualizar_produto',
    description: 'Altera um produto da loja: preço, preço "de", destaque, nome, condição, estoque, tirar do site (publicar=false) ou voltar ao site (publicar=true), anexar fotos recentes, reescrever os textos.',
    parameters: {
      type: 'object',
      properties: {
        produto_id: { type: 'string' },
        preco: { type: 'number' },
        preco_de: { type: ['number', 'null'] },
        destaque: { type: 'boolean' },
        titulo: { type: 'string' },
        condicao: { type: 'string', enum: ['novo', 'seminovo'] },
        estoque: { type: 'integer' },
        publicar: { type: 'boolean' },
        adicionar_fotos_recentes: { type: 'boolean' },
        reescrever_textos: { type: 'boolean' },
      },
      required: ['produto_id'],
    },
  },
  {
    type: 'function',
    name: 'loja_marcar_vendido',
    description: 'Marca o produto como VENDIDO fora do site (balcão, WhatsApp): estoque zero e indisponível na loja. Use para "vendi", "tira do site", "já foi".',
    parameters: { type: 'object', properties: { produto_id: { type: 'string' } }, required: ['produto_id'] },
  },
  {
    type: 'function',
    name: 'loja_excluir_produto',
    description: 'Apaga o produto de vez (com fotos). Só chame com confirmado=true depois que a pessoa CONFIRMAR explicitamente a exclusão; para só tirar do site use loja_marcar_vendido ou publicar=false.',
    parameters: { type: 'object', properties: { produto_id: { type: 'string' }, confirmado: { type: 'boolean' } }, required: ['produto_id', 'confirmado'] },
  },
  {
    type: 'function',
    name: 'loja_desfazer_ultima_acao',
    description: 'Desfaz a última alteração feita na loja por este WhatsApp nas últimas 12 horas (cadastro, preço, venda, tirar do site…).',
    parameters: { type: 'object', properties: {} },
  },
];

export const LOJA_TOOL_NAMES = new Set(LOJA_TOOLS.map((tool) => tool.name));
export const LOJA_WRITE_TOOLS = new Set(['loja_cadastrar_produto', 'loja_atualizar_produto', 'loja_marcar_vendido', 'loja_excluir_produto', 'loja_desfazer_ultima_acao']);

const RESTAURAVEIS = ['titulo', 'preco', 'preco_de', 'destaque', 'condicao', 'estoque', 'status', 'imagens', 'subtitulo', 'descricao', 'seo_titulo', 'seo_descricao', 'laudo', 'publicado_em'];

export function createLojaTools({ pool, uuid, now, uploadsDir, siteUrl, gerarIA = null, log = console }) {
  const site = (siteUrl || 'https://luthieriabrasilia.com.br').replace(/\/+$/, '');
  const imagensDir = path.join(uploadsDir, 'loja');

  async function ensureSchema() {
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_ia_acoes (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      telefone varchar(30) DEFAULT NULL,
      produto_id varchar(36) NOT NULL,
      acao varchar(30) NOT NULL,
      antes JSON DEFAULT NULL,
      desfeita tinyint(1) NOT NULL DEFAULT 0,
      created_at varchar(50) DEFAULT NULL,
      INDEX idx_loja_ia_acoes_user (user_id, telefone, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  const link = (p) => `${site}/${p.tipo === 'curso' ? 'cursos' : p.tipo === 'ebook' ? 'cursos' : 'loja'}/${p.slug}`;

  function resumo(p) {
    const imagens = parseJson(p.imagens, []);
    const noSite = p.status === 'publicado' && (p.tipo !== 'fisico' || Number(p.estoque) > 0);
    return {
      produto_id: p.id,
      titulo: p.titulo,
      preco: Number(p.preco),
      preco_de: p.preco_de == null ? null : Number(p.preco_de),
      condicao: p.condicao,
      status: p.status,
      no_site: noSite,
      destaque: Number(p.destaque) === 1,
      estoque: Number(p.estoque),
      fotos: imagens.length,
      link: noSite ? link(p) : null,
    };
  }

  async function produto(userId, id) {
    const [[p]] = await pool.query('SELECT * FROM loja_produtos WHERE id = ? AND user_id = ?', [id, userId]);
    if (!p) throw new Error('Produto não encontrado na loja. Use loja_buscar_produto para achar o id.');
    return p;
  }

  async function registrar(ctx, produtoId, acao, antes) {
    await pool.query('INSERT INTO loja_ia_acoes (id, user_id, telefone, produto_id, acao, antes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), ctx.userId, ctx.phone || null, produtoId, acao, antes ? JSON.stringify(antes) : null, now()]);
    ctx.actions?.push({ type: `loja_${acao}`, id: produtoId });
  }

  async function uniqueSlug(userId, titulo, ignorarId = '') {
    const base = slugify(titulo) || 'produto';
    let slug = base;
    for (let i = 2; i < 100; i += 1) {
      const [[row]] = await pool.query('SELECT id FROM loja_produtos WHERE user_id = ? AND slug = ? AND id <> ?', [userId, slug, ignorarId]);
      if (!row) return slug;
      slug = `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  /** Move para o produto as fotos mandadas pelo WhatsApp nos últimos 30 min (ainda não usadas como comprovante). */
  async function anexarFotosRecentes(userId, p) {
    const desde = new Date(Date.now() - FOTOS_JANELA_MS).toISOString();
    const [rows] = await pool.query(
      `SELECT id, tipo_mime, conteudo FROM comprovantes_financeiros
        WHERE user_id = ? AND origem = 'whatsapp' AND conta_pagar_id IS NULL AND transacao_financeira_id IS NULL
          AND created_at >= ? AND tipo_mime LIKE 'image/%'
        ORDER BY created_at ASC LIMIT ?`,
      [userId, desde, MAX_FOTOS],
    );
    const imagens = parseJson(p.imagens, []);
    let anexadas = 0;
    let ignoradas = 0;
    for (const row of rows) {
      const ext = FOTO_EXT[String(row.tipo_mime).toLowerCase()];
      if (!ext || imagens.length >= MAX_FOTOS) { ignoradas += 1; continue; }
      const nome = `${uuid()}.${ext}`;
      fs.mkdirSync(path.join(imagensDir, p.id), { recursive: true });
      fs.writeFileSync(path.join(imagensDir, p.id, nome), row.conteudo);
      imagens.push({ path: `${p.id}/${nome}`, alt: p.titulo });
      await pool.query('DELETE FROM comprovantes_financeiros WHERE id = ? AND user_id = ?', [row.id, userId]);
      anexadas += 1;
    }
    if (anexadas) await pool.query('UPDATE loja_produtos SET imagens = ?, updated_at = ? WHERE id = ?', [JSON.stringify(imagens), now(), p.id]);
    return { anexadas, ignoradas, imagens };
  }

  /** Textos de venda com a mesma IA do editor da loja; sem IA ou se falhar, o produto segue sem os textos. */
  async function escreverTextos(p, imagens) {
    if (!gerarIA) return {};
    const campos = ['subtitulo', 'descricao', 'seo_titulo', 'seo_descricao', ...(String(p.laudo || '').trim() ? ['laudo'] : [])];
    const pedido = promptTextosProduto(p, campos);
    if (!pedido || pedido.erro) return {};
    let imagem = null;
    const capa = imagens[0];
    if (capa) {
      const arquivo = path.join(imagensDir, capa.path);
      const mime = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }[path.extname(arquivo).slice(1).toLowerCase()];
      if (mime && fs.existsSync(arquivo) && fs.statSync(arquivo).size < 4 * 1024 * 1024) imagem = `data:${mime};base64,${fs.readFileSync(arquivo).toString('base64')}`;
    }
    try {
      return limparTextosIA(await gerarIA({ sistema: pedido.sistema, entrada: pedido.entrada, schema: pedido.schema, imagem }), pedido.campos);
    } catch (error) {
      log.warn?.('[loja-ia] textos com IA falharam:', error.message);
      return {};
    }
  }

  async function atualizarColunas(id, dados) {
    const cols = Object.keys(dados);
    if (!cols.length) return;
    await pool.query(`UPDATE loja_produtos SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => dados[c]), now(), id]);
  }

  function retrato(p) {
    return Object.fromEntries(RESTAURAVEIS.map((c) => [c, p[c] ?? null]));
  }

  async function buscar(userId, args) {
    const status = args.incluir_fora_do_site ? STATUS_PRODUTO : ['publicado', 'rascunho'];
    const [rows] = await pool.query(
      `SELECT * FROM loja_produtos WHERE user_id = ? AND tipo = 'fisico' AND status IN (${status.map(() => '?').join(',')}) ORDER BY updated_at DESC LIMIT 300`,
      [userId, ...status],
    );
    const { scored, ambiguo } = rankProdutos(rows, args.busca);
    return { encontrados: scored.length, ambiguo, produtos: scored.slice(0, 6).map(({ row, score }) => ({ ...resumo(row), confianca: Number(score.toFixed(2)) })) };
  }

  async function cadastrar(ctx, args) {
    const titulo = String(args.titulo || '').trim();
    const preco = money(args.preco);
    if (!titulo) throw new Error('Diga o nome do produto.');
    if (!(preco > 0)) throw new Error('Diga o preço de venda.');
    const id = uuid();
    const medidas = medidasPadrao(titulo, args.categoria);
    const dados = {
      tipo: 'fisico',
      titulo: titulo.slice(0, 200),
      condicao: args.condicao || null,
      marca: args.marca ? String(args.marca).slice(0, 100) : null,
      categoria: args.categoria ? String(args.categoria).slice(0, 100) : null,
      preco,
      preco_de: args.preco_de ? money(args.preco_de) : null,
      estoque: Math.max(1, Math.round(Number(args.estoque) || 1)),
      destaque: args.destaque ? 1 : 0,
      laudo: args.estado ? String(args.estado).slice(0, 2000) : null,
      status: 'rascunho',
      ...medidas,
    };
    const slug = await uniqueSlug(ctx.userId, dados.titulo);
    const cols = Object.keys(dados);
    await pool.query(
      `INSERT INTO loja_produtos (id, user_id, slug, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')}, ?, ?)`,
      [id, ctx.userId, slug, ...cols.map((c) => dados[c]), now(), now()],
    );
    let p = await produto(ctx.userId, id);
    const fotos = args.usar_fotos_recentes === false ? { anexadas: 0, ignoradas: 0, imagens: [] } : await anexarFotosRecentes(ctx.userId, p);
    const textos = await escreverTextos({ ...p, imagens: JSON.stringify(fotos.imagens) }, fotos.imagens);
    const publicar = args.publicar !== false;
    await atualizarColunas(id, { ...textos, ...(publicar ? { status: 'publicado', publicado_em: now() } : {}) });
    p = await produto(ctx.userId, id);
    await registrar(ctx, id, 'cadastro', null);
    return {
      ok: true,
      ...resumo(p),
      fotos_anexadas: fotos.anexadas,
      ...(fotos.ignoradas ? { fotos_ignoradas: fotos.ignoradas } : {}),
      textos_escritos_pela_ia: Object.keys(textos),
      medidas_frete_padrao: medidas,
      aviso: fotos.anexadas ? undefined : 'Produto sem fotos: peça para mandar as fotos e use loja_atualizar_produto com adicionar_fotos_recentes.',
    };
  }

  async function atualizar(ctx, args) {
    const p = await produto(ctx.userId, args.produto_id);
    const dados = {};
    if (args.titulo) dados.titulo = String(args.titulo).trim().slice(0, 200);
    if (args.preco != null) {
      const preco = money(args.preco);
      if (!(preco > 0)) throw new Error('Preço inválido.');
      dados.preco = preco;
    }
    if ('preco_de' in args) dados.preco_de = args.preco_de ? money(args.preco_de) : null;
    if (args.destaque != null) dados.destaque = args.destaque ? 1 : 0;
    if (args.condicao) dados.condicao = args.condicao;
    if (args.estoque != null) dados.estoque = Math.max(0, Math.round(Number(args.estoque) || 0));
    if (args.publicar === true) {
      dados.status = 'publicado';
      if (!p.publicado_em) dados.publicado_em = now();
      if (Number(dados.estoque ?? p.estoque) <= 0) dados.estoque = 1;
      for (const [campo, valor] of Object.entries(medidasPadrao(p.titulo, p.categoria))) if (!(Number(p[campo]) > 0)) dados[campo] = valor;
    } else if (args.publicar === false) {
      dados.status = 'rascunho';
    }
    if (dados.titulo) dados.slug = await uniqueSlug(ctx.userId, dados.titulo, p.id);
    let fotos = { anexadas: 0 };
    if (args.adicionar_fotos_recentes) fotos = await anexarFotosRecentes(ctx.userId, p);
    if (args.reescrever_textos) {
      const atual = await produto(ctx.userId, p.id);
      Object.assign(dados, await escreverTextos({ ...atual, ...dados }, parseJson(atual.imagens, [])));
    }
    if (!Object.keys(dados).length && !fotos.anexadas) return { ok: true, sem_mudanca: true, ...resumo(p) };
    await atualizarColunas(p.id, dados);
    await registrar(ctx, p.id, 'alteracao', retrato(p));
    return { ok: true, ...resumo(await produto(ctx.userId, p.id)), ...(fotos.anexadas ? { fotos_anexadas: fotos.anexadas } : {}) };
  }

  async function marcarVendido(ctx, args) {
    const p = await produto(ctx.userId, args.produto_id);
    if (p.status === 'esgotado' && Number(p.estoque) <= 0) return { ok: true, ja_estava_vendido: true, ...resumo(p) };
    await atualizarColunas(p.id, { status: 'esgotado', estoque: 0 });
    await registrar(ctx, p.id, 'venda', retrato(p));
    return { ok: true, ...resumo(await produto(ctx.userId, p.id)), preco_anunciado: Number(p.preco) };
  }

  async function excluir(ctx, args) {
    if (args.confirmado !== true) return { erro: 'Peça confirmação explícita antes de excluir de vez (ou só tire do site).' };
    const p = await produto(ctx.userId, args.produto_id);
    const [[uso]] = await pool.query('SELECT COUNT(*) AS n FROM loja_pedido_itens WHERE produto_id = ?', [p.id]);
    if (Number(uso.n) > 0) {
      await atualizarColunas(p.id, { status: 'arquivado' });
      await registrar(ctx, p.id, 'arquivamento', retrato(p));
      return { ok: true, arquivado: true, motivo: 'O produto tem pedidos no histórico, então foi arquivado em vez de apagado.' };
    }
    await pool.query('DELETE FROM loja_produtos WHERE id = ? AND user_id = ?', [p.id, ctx.userId]);
    fs.rmSync(path.join(imagensDir, p.id), { recursive: true, force: true });
    return { ok: true, excluido: true, titulo: p.titulo };
  }

  async function desfazer(ctx) {
    const desde = new Date(Date.now() - DESFAZER_JANELA_MS).toISOString();
    const [[acao]] = await pool.query(
      `SELECT * FROM loja_ia_acoes WHERE user_id = ? AND (telefone = ? OR ? IS NULL) AND desfeita = 0 AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
      [ctx.userId, ctx.phone || null, ctx.phone || null, desde],
    );
    if (!acao) return { erro: 'Não há alteração recente da loja para desfazer.' };
    const [[p]] = await pool.query('SELECT * FROM loja_produtos WHERE id = ? AND user_id = ?', [acao.produto_id, ctx.userId]);
    if (!p) {
      await pool.query('UPDATE loja_ia_acoes SET desfeita = 1 WHERE id = ?', [acao.id]);
      return { erro: 'O produto dessa alteração não existe mais.' };
    }
    let resultado;
    if (acao.acao === 'cadastro') {
      const [[uso]] = await pool.query('SELECT COUNT(*) AS n FROM loja_pedido_itens WHERE produto_id = ?', [p.id]);
      if (Number(uso.n) > 0) return { erro: 'Esse produto já tem pedido; não dá para desfazer o cadastro. Tire do site com loja_marcar_vendido.' };
      await pool.query('DELETE FROM loja_produtos WHERE id = ?', [p.id]);
      fs.rmSync(path.join(imagensDir, p.id), { recursive: true, force: true });
      resultado = { desfeito: 'cadastro', titulo: p.titulo, produto_removido: true };
    } else {
      const antes = parseJson(acao.antes, {});
      const dados = Object.fromEntries(Object.entries(antes).filter(([campo]) => RESTAURAVEIS.includes(campo)));
      if (typeof dados.imagens !== 'string') dados.imagens = JSON.stringify(dados.imagens || []);
      await atualizarColunas(p.id, dados);
      resultado = { desfeito: acao.acao, ...resumo(await produto(ctx.userId, p.id)) };
    }
    await pool.query('UPDATE loja_ia_acoes SET desfeita = 1 WHERE id = ?', [acao.id]);
    return { ok: true, ...resultado };
  }

  async function run(name, args, ctx) {
    switch (name) {
      case 'loja_buscar_produto': return buscar(ctx.userId, args);
      case 'loja_cadastrar_produto': return cadastrar(ctx, args);
      case 'loja_atualizar_produto': return atualizar(ctx, args);
      case 'loja_marcar_vendido': return marcarVendido(ctx, args);
      case 'loja_excluir_produto': return excluir(ctx, args);
      case 'loja_desfazer_ultima_acao': return desfazer(ctx);
      default: return { erro: `Ferramenta desconhecida: ${name}` };
    }
  }

  return { ensureSchema, run };
}
