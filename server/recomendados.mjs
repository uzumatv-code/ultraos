// Recomendados: produtos do Mercado Livre indicados pela oficina, com link de afiliado.
// Não passam pelo carrinho: o site mostra a vitrine e cada clique vem para cá (conta o clique e devolve o link).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { dadosDaPagina, dadosDoItem, dadosDoProduto, idAnuncio, origemClique, urlMercadoLivre } from './recomendados-core.mjs';
import { verifyPortalRequest } from './portal-core.mjs';

const IMAGE_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const DIA_MS = 24 * 60 * 60 * 1000;
// A página do anúncio às vezes recusa robôs; com cara de navegador o plano B funciona mais vezes.
const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

class RecomendadoError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createRecomendados({
  pool, uuid, now, getTenantId, secret, uploadsDir, osPublicUrl, mlAccessToken, log = console,
  mlApiUrl = 'https://api.mercadolibre.com',
}) {
  const osUrl = (osPublicUrl || 'https://os.luthieriabrasilia.com.br').replace(/\/+$/, '');
  const imagensDir = path.join(uploadsDir, 'loja', 'recomendados');
  const tenant = () => getTenantId();
  const ML_API = mlApiUrl.replace(/\/+$/, '');

  async function ensureSchema() {
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_recomendados (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      titulo varchar(200) NOT NULL DEFAULT '',
      categoria varchar(100) DEFAULT NULL,
      marca varchar(100) DEFAULT NULL,
      motivo varchar(400) DEFAULT NULL,
      link_afiliado varchar(500) NOT NULL,
      url_anuncio varchar(500) DEFAULT NULL,
      ml_tipo varchar(10) DEFAULT NULL,
      ml_id varchar(30) DEFAULT NULL,
      preco decimal(10,2) DEFAULT NULL,
      preco_de decimal(10,2) DEFAULT NULL,
      preco_em varchar(50) DEFAULT NULL,
      imagem varchar(255) DEFAULT NULL,
      disponivel_ml tinyint(1) DEFAULT NULL,
      ativo tinyint(1) NOT NULL DEFAULT 0,
      ordem int NOT NULL DEFAULT 0,
      sincronizado_em varchar(50) DEFAULT NULL,
      sincronia_erro varchar(200) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      updated_at varchar(50) NOT NULL,
      INDEX idx_loja_recomendados_ativo (user_id, ativo, ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_recomendado_cliques (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      recomendado_id varchar(36) NOT NULL,
      origem varchar(30) NOT NULL DEFAULT 'site',
      created_at varchar(50) NOT NULL,
      INDEX idx_loja_recomendado_cliques (recomendado_id, created_at),
      INDEX idx_loja_recomendado_cliques_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    fs.mkdirSync(imagensDir, { recursive: true });
  }

  // ---------- Formatação ----------

  const imagemUrl = (nome) => (nome ? `${osUrl}/uploads/loja/recomendados/${nome}` : null);
  const numero = (v) => (v == null ? null : Number(v));

  function publico(r) {
    return {
      id: r.id,
      titulo: r.titulo,
      categoria: r.categoria,
      marca: r.marca,
      motivo: r.motivo,
      preco: numero(r.preco),
      preco_de: numero(r.preco_de),
      preco_em: r.preco_em,
      imagem: r.imagem ? { url: imagemUrl(r.imagem), alt: r.titulo } : null,
      loja: 'Mercado Livre',
      updated_at: r.updated_at,
    };
  }

  function admin(r, cliques = {}) {
    return {
      ...r,
      preco: numero(r.preco),
      preco_de: numero(r.preco_de),
      disponivel_ml: r.disponivel_ml == null ? null : Number(r.disponivel_ml) === 1,
      ativo: Number(r.ativo) === 1,
      ordem: Number(r.ordem),
      imagem_url: imagemUrl(r.imagem),
      cliques_30d: cliques[r.id]?.recentes ?? 0,
      cliques_total: cliques[r.id]?.total ?? 0,
    };
  }

  // ---------- Mercado Livre ----------

  /** Link curto de afiliado (mercadolivre.com/sec/…, meli.la/…) → endereço do anúncio, seguindo só redirecionamentos do Mercado Livre. */
  async function resolverLink(link) {
    let atual = urlMercadoLivre(link);
    for (let i = 0; atual && i < 5; i += 1) {
      if (idAnuncio(atual.toString())) return atual.toString();
      const res = await fetch(atual, { redirect: 'manual', headers: { 'User-Agent': UA_NAVEGADOR }, signal: AbortSignal.timeout(10000) });
      const proximo = res.headers.get('location');
      if (!proximo) return null;
      atual = urlMercadoLivre(new URL(proximo, atual).toString());
    }
    return null;
  }

  async function lerApi(ml) {
    const res = await fetch(`${ML_API}/${ml.tipo === 'produto' ? 'products' : 'items'}/${ml.id}`, {
      headers: { Accept: 'application/json', ...(mlAccessToken ? { Authorization: `Bearer ${mlAccessToken}` } : {}) },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`API do Mercado Livre respondeu ${res.status}`);
    const json = await res.json();
    return ml.tipo === 'produto' ? dadosDoProduto(json) : dadosDoItem(json);
  }

  async function lerPagina(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA_NAVEGADOR, Accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`página do anúncio respondeu ${res.status}`);
    return dadosDaPagina((await res.text()).slice(0, 2_000_000));
  }

  /** Dados do anúncio: API primeiro, página como plano B. Devolve também o endereço e o id descobertos. */
  async function buscarAnuncio({ link_afiliado, url_anuncio }) {
    const endereco = (urlMercadoLivre(url_anuncio) && url_anuncio) || (await resolverLink(link_afiliado).catch(() => null));
    const ml = endereco ? idAnuncio(endereco) : null;
    if (!ml) throw new RecomendadoError(422, 'anuncio_nao_identificado', 'Não deu para identificar o anúncio pelo link. Cole também o endereço do anúncio ou preencha os dados à mão.');
    let dados = null;
    const falhas = [];
    try { dados = await lerApi(ml); } catch (error) { falhas.push(error.message); }
    if (!dados?.titulo) {
      try { dados = { ...(await lerPagina(endereco)), ...Object.fromEntries(Object.entries(dados || {}).filter(([, v]) => v != null)) }; } catch (error) { falhas.push(error.message); }
    }
    if (!dados?.titulo && !dados?.preco) {
      throw new RecomendadoError(502, 'anuncio_sem_dados', `O Mercado Livre não devolveu os dados agora (${falhas.join('; ') || 'sem resposta'}). Preencha à mão ou tente de novo.`);
    }
    return { dados, url_anuncio: endereco, ml };
  }

  async function baixarImagem(url, recomendadoId) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const ext = IMAGE_TYPES[String(res.headers.get('content-type') || '').split(';')[0]];
    if (!res.ok || !ext) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) return null;
    return salvarImagem(recomendadoId, buffer, ext);
  }

  function salvarImagem(recomendadoId, buffer, ext) {
    const nome = `${recomendadoId}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(imagensDir, nome), buffer);
    return nome;
  }

  const apagarImagem = (nome) => { if (nome) fs.rmSync(path.join(imagensDir, path.basename(nome)), { force: true }); };

  /**
   * Atualiza preço e disponibilidade a partir do anúncio. Nome e foto só são preenchidos quando estão vazios:
   * o que a oficina escreveu ou enviou nunca é trocado sozinho.
   */
  async function sincronizar(r) {
    try {
      const { dados, url_anuncio, ml } = await buscarAnuncio(r);
      let imagem = r.imagem;
      if (!imagem && dados.imagem_url) imagem = await baixarImagem(dados.imagem_url, r.id).catch(() => null);
      await pool.query(
        `UPDATE loja_recomendados SET titulo = IF(titulo = '', ?, titulo), url_anuncio = ?, ml_tipo = ?, ml_id = ?, imagem = ?,
           preco = COALESCE(?, preco), preco_de = ?, preco_em = IF(? IS NULL, preco_em, ?), disponivel_ml = COALESCE(?, disponivel_ml),
           sincronizado_em = ?, sincronia_erro = NULL, updated_at = ? WHERE id = ?`,
        [dados.titulo || '', url_anuncio, ml.tipo, ml.id, imagem, dados.preco, dados.preco ? dados.preco_de : numero(r.preco_de),
          dados.preco, now(), dados.disponivel == null ? null : dados.disponivel ? 1 : 0, now(), now(), r.id],
      );
      return { ok: true };
    } catch (error) {
      const mensagem = error instanceof RecomendadoError ? error.message : `Falha ao consultar o Mercado Livre: ${error.message}`;
      await pool.query('UPDATE loja_recomendados SET sincronia_erro = ?, sincronizado_em = ? WHERE id = ?', [mensagem.slice(0, 200), now(), r.id]);
      return { ok: false, erro: mensagem };
    }
  }

  async function sincronizarTodos() {
    if (!tenant()) return;
    try {
      const [rows] = await pool.query(
        'SELECT * FROM loja_recomendados WHERE user_id = ? AND ativo = 1 AND (sincronizado_em IS NULL OR sincronizado_em < ?) LIMIT 200',
        [tenant(), new Date(Date.now() - DIA_MS + 60 * 60 * 1000).toISOString()],
      );
      let falhas = 0;
      for (const r of rows) {
        if (!(await sincronizar(r)).ok) falhas += 1;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      if (rows.length) log.info?.(`[recomendados] ${rows.length} anúncio(s) conferido(s), ${falhas} com falha.`);
    } catch (error) {
      log.error('[recomendados] conferência diária falhou:', error.message);
    }
  }

  function startJobs() {
    setInterval(() => void sincronizarTodos(), 6 * 60 * 60 * 1000).unref();
    setTimeout(() => void sincronizarTodos(), 5 * 60 * 1000).unref();
  }

  // ---------- Rotas internas (site -> sistema) ----------

  const router = express.Router();
  router.use((req, res, next) => {
    if (!secret || !tenant()) return res.status(503).json({ erro: 'loja_desativada' });
    const ok = verifyPortalRequest({
      secret, method: req.method, path: req.originalUrl, body: req.rawBody ? req.rawBody.toString('utf8') : '',
      timestamp: req.get('x-portal-timestamp'), signature: req.get('x-portal-signature'),
    });
    if (!ok) return res.status(401).json({ erro: 'assinatura_invalida' });
    next();
  });

  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof RecomendadoError) return res.status(error.status).json({ erro: error.code, mensagem: error.message });
      log.error('[recomendados] erro:', error);
      res.status(500).json({ erro: 'erro_interno', mensagem: 'Erro inesperado. Tente de novo.' });
    }
  };

  // Anúncio pausado ou encerrado no Mercado Livre sai da vitrine sozinho (volta quando a conferência o vê ativo).
  router.get('/', handle(async () => {
    const [rows] = await pool.query(
      `SELECT * FROM loja_recomendados WHERE user_id = ? AND ativo = 1 AND (disponivel_ml IS NULL OR disponivel_ml = 1)
        ORDER BY ordem, created_at DESC`,
      [tenant()],
    );
    return { recomendados: rows.map(publico) };
  }));

  // Clique no site: conta (a não ser que seja robô) e devolve o link de afiliado para o redirecionamento.
  // Anúncio pausado no Mercado Livre devolve 404: links antigos (WhatsApp, recibo) levam de volta à vitrine.
  router.post('/:id/clique', handle(async (req) => {
    const [[r]] = await pool.query(
      `SELECT id, link_afiliado FROM loja_recomendados WHERE id = ? AND user_id = ? AND ativo = 1
        AND (disponivel_ml IS NULL OR disponivel_ml = 1)`,
      [String(req.params.id).slice(0, 36), tenant()],
    );
    if (!r || !urlMercadoLivre(r.link_afiliado)) throw new RecomendadoError(404, 'recomendado_nao_encontrado', 'Indicação não encontrada.');
    if (req.body?.contar !== false) {
      await pool.query('INSERT INTO loja_recomendado_cliques (id, user_id, recomendado_id, origem, created_at) VALUES (?, ?, ?, ?, ?)',
        [uuid(), tenant(), r.id, origemClique(req.body?.origem), now()]);
    }
    return { url: r.link_afiliado };
  }));

  // ---------- Painel ----------

  const adminRouter = express.Router();
  const adminHandle = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (error) {
      if (error instanceof RecomendadoError) return res.status(error.status).json({ error: { message: error.message } });
      log.error('[recomendados-admin] erro:', error);
      res.status(500).json({ error: { message: error.message || 'Erro inesperado' } });
    }
  };

  async function proprio(req) {
    const [[r]] = await pool.query('SELECT * FROM loja_recomendados WHERE id = ? AND user_id = ?', [req.params.id, req.auth.accountId]);
    if (!r) throw new RecomendadoError(404, 'recomendado_nao_encontrado', 'Indicação não encontrada.');
    return r;
  }

  async function cliquesPorItem(userId) {
    const [rows] = await pool.query(
      `SELECT recomendado_id, COUNT(*) AS total, SUM(created_at > ?) AS recentes FROM loja_recomendado_cliques
        WHERE user_id = ? GROUP BY recomendado_id`,
      [new Date(Date.now() - 30 * DIA_MS).toISOString(), userId],
    );
    return Object.fromEntries(rows.map((c) => [c.recomendado_id, { total: Number(c.total), recentes: Number(c.recentes || 0) }]));
  }

  async function lerAdmin(id, userId) {
    const [[r]] = await pool.query('SELECT * FROM loja_recomendados WHERE id = ?', [id]);
    return admin(r, await cliquesPorItem(userId));
  }

  function linkValido(valor) {
    const url = urlMercadoLivre(valor);
    if (!url) throw new RecomendadoError(400, 'link_invalido', 'Cole o link de afiliado gerado no Mercado Livre (começa com https:// e é do mercadolivre.com ou meli.la).');
    return url.toString().slice(0, 500);
  }

  const texto = (v, max) => {
    const t = String(v ?? '').trim().slice(0, max);
    return t || null;
  };
  const valor = (v) => (v === '' || v == null || !(Number(v) > 0) ? null : Math.round(Number(v) * 100) / 100);

  adminRouter.get('/', adminHandle(async (req) => {
    const [rows] = await pool.query('SELECT * FROM loja_recomendados WHERE user_id = ? ORDER BY ordem, created_at DESC', [req.auth.accountId]);
    const cliques = await cliquesPorItem(req.auth.accountId);
    return {
      recomendados: rows.map((r) => admin(r, cliques)),
      integrado: Boolean(secret && tenant() === req.auth.accountId),
      api_com_token: Boolean(mlAccessToken),
    };
  }));

  // Cadastro em um passo: cola o link, o sistema tenta preencher nome, foto e preço. Nasce fora do site, para revisar.
  adminRouter.post('/', adminHandle(async (req) => {
    const link = linkValido(req.body?.link_afiliado);
    const anuncio = texto(req.body?.url_anuncio, 500);
    if (anuncio && !urlMercadoLivre(anuncio)) throw new RecomendadoError(400, 'anuncio_invalido', 'O endereço do anúncio precisa ser do Mercado Livre.');
    const id = uuid();
    const [[{ ordem }]] = await pool.query('SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM loja_recomendados WHERE user_id = ?', [req.auth.accountId]);
    await pool.query(
      `INSERT INTO loja_recomendados (id, user_id, titulo, link_afiliado, url_anuncio, ordem, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.auth.accountId, texto(req.body?.titulo, 200) || '', link, anuncio, ordem, now(), now()],
    );
    const [[novo]] = await pool.query('SELECT * FROM loja_recomendados WHERE id = ?', [id]);
    const sincronia = await sincronizar(novo);
    return { ...(await lerAdmin(id, req.auth.accountId)), aviso: sincronia.ok ? null : sincronia.erro };
  }));

  adminRouter.put('/:id', adminHandle(async (req) => {
    const atual = await proprio(req);
    const b = req.body || {};
    const dados = {
      titulo: 'titulo' in b ? texto(b.titulo, 200) || '' : atual.titulo,
      categoria: 'categoria' in b ? texto(b.categoria, 100) : atual.categoria,
      marca: 'marca' in b ? texto(b.marca, 100) : atual.marca,
      motivo: 'motivo' in b ? texto(b.motivo, 400) : atual.motivo,
      link_afiliado: 'link_afiliado' in b ? linkValido(b.link_afiliado) : atual.link_afiliado,
      url_anuncio: 'url_anuncio' in b ? texto(b.url_anuncio, 500) : atual.url_anuncio,
      preco: 'preco' in b ? valor(b.preco) : numero(atual.preco),
      preco_de: 'preco_de' in b ? valor(b.preco_de) : numero(atual.preco_de),
      ativo: 'ativo' in b ? (b.ativo ? 1 : 0) : Number(atual.ativo),
      ordem: 'ordem' in b ? Math.max(0, Math.round(Number(b.ordem) || 0)) : Number(atual.ordem),
    };
    if (dados.url_anuncio && !urlMercadoLivre(dados.url_anuncio)) throw new RecomendadoError(400, 'anuncio_invalido', 'O endereço do anúncio precisa ser do Mercado Livre.');
    if (dados.preco_de && dados.preco && dados.preco_de <= dados.preco) dados.preco_de = null;
    if (dados.ativo) {
      if (!dados.titulo) throw new RecomendadoError(400, 'titulo_obrigatorio', 'Para mostrar no site, informe o nome do produto.');
      if (!dados.motivo) throw new RecomendadoError(400, 'motivo_obrigatorio', 'Para mostrar no site, escreva por que a oficina recomenda. É o que faz o cliente confiar na indicação.');
    }
    // Preço digitado à mão vale como consultado agora.
    const precoMudou = dados.preco !== numero(atual.preco);
    const ml = dados.url_anuncio !== atual.url_anuncio ? idAnuncio(dados.url_anuncio) : null;
    await pool.query(
      `UPDATE loja_recomendados SET titulo = ?, categoria = ?, marca = ?, motivo = ?, link_afiliado = ?, url_anuncio = ?, preco = ?, preco_de = ?,
         ativo = ?, ordem = ?, preco_em = IF(?, ?, preco_em), ml_tipo = IF(?, ?, ml_tipo), ml_id = IF(?, ?, ml_id), updated_at = ? WHERE id = ?`,
      [dados.titulo, dados.categoria, dados.marca, dados.motivo, dados.link_afiliado, dados.url_anuncio, dados.preco, dados.preco_de, dados.ativo, dados.ordem,
        precoMudou && dados.preco ? 1 : 0, now(), ml ? 1 : 0, ml?.tipo ?? null, ml ? 1 : 0, ml?.id ?? null, now(), atual.id],
    );
    return lerAdmin(atual.id, req.auth.accountId);
  }));

  adminRouter.post('/:id/sincronizar', adminHandle(async (req) => {
    const r = await proprio(req);
    const sincronia = await sincronizar(r);
    return { ...(await lerAdmin(r.id, req.auth.accountId)), aviso: sincronia.ok ? null : sincronia.erro };
  }));

  adminRouter.post('/:id/imagem', express.raw({ type: ['image/*'], limit: '8mb' }), adminHandle(async (req) => {
    const r = await proprio(req);
    const ext = IMAGE_TYPES[String(req.get('content-type') || '').split(';')[0]];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw new RecomendadoError(400, 'imagem_invalida', 'Envie uma imagem JPG, PNG ou WebP.');
    const nome = salvarImagem(r.id, req.body, ext);
    await pool.query('UPDATE loja_recomendados SET imagem = ?, updated_at = ? WHERE id = ?', [nome, now(), r.id]);
    apagarImagem(r.imagem);
    return lerAdmin(r.id, req.auth.accountId);
  }));

  adminRouter.delete('/:id/imagem', adminHandle(async (req) => {
    const r = await proprio(req);
    await pool.query('UPDATE loja_recomendados SET imagem = NULL, updated_at = ? WHERE id = ?', [now(), r.id]);
    apagarImagem(r.imagem);
    return lerAdmin(r.id, req.auth.accountId);
  }));

  adminRouter.delete('/:id', adminHandle(async (req) => {
    const r = await proprio(req);
    await pool.query('DELETE FROM loja_recomendado_cliques WHERE recomendado_id = ?', [r.id]);
    await pool.query('DELETE FROM loja_recomendados WHERE id = ?', [r.id]);
    apagarImagem(r.imagem);
    return { excluido: true };
  }));

  return { ensureSchema, router, adminRouter, startJobs, sincronizarTodos };
}
