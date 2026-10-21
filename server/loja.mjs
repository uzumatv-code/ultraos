// Loja do site: produtos físicos (novos e seminovos), cursos em vídeo e ebooks.
// Rotas internas assinadas (site -> sistema), aviso de pagamento do Mercado Pago e rotas do painel.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  STATUS_PRODUTO, TIPOS, TRANSICOES_PAINEL, mercadoPagoPreference, mercadoPagoSignatureValid, melhorEnvioPayload,
  money, normalizeCep, orderStatusFromPayment, parseMelhorEnvio, slugify, validateCart,
} from './loja-core.mjs';
import { verifyPortalRequest } from './portal-core.mjs';

const RESERVA_MS = 30 * 60 * 1000;
const IMAGE_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

class LojaError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Data no fuso de Brasília no formato que o Mercado Pago aceita (yyyy-MM-ddTHH:mm:ss.SSS-03:00). */
function brasiliaIso(date) {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 23)}-03:00`;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function createLoja({
  pool, uuid, now, getTenantId, secret, uploadsDir, sendCustomerMessage, ensureReceitaCategoria, log = console,
  mpAccessToken, mpWebhookSecret, melhorEnvioToken, melhorEnvioEmail, siteUrl, osPublicUrl,
  mpApiUrl = 'https://api.mercadopago.com', melhorEnvioApiUrl = 'https://melhorenvio.com.br/api/v2',
}) {
  const site = (siteUrl || 'https://luthieriabrasilia.com.br').replace(/\/+$/, '');
  const osUrl = (osPublicUrl || 'https://os.luthieriabrasilia.com.br').replace(/\/+$/, '');
  const imagensDir = path.join(uploadsDir, 'loja');
  const privadoDir = path.join(uploadsDir, 'privado', 'ebooks');
  const tenant = () => getTenantId();
  const MP_API = mpApiUrl.replace(/\/+$/, '');
  const ME_API = melhorEnvioApiUrl.replace(/\/+$/, '');

  async function ensureSchema() {
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_produtos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      tipo varchar(10) NOT NULL DEFAULT 'fisico',
      titulo varchar(200) NOT NULL,
      slug varchar(100) NOT NULL,
      subtitulo varchar(300) DEFAULT NULL,
      descricao text DEFAULT NULL,
      condicao varchar(10) DEFAULT NULL,
      marca varchar(100) DEFAULT NULL,
      categoria varchar(100) DEFAULT NULL,
      sku varchar(60) DEFAULT NULL,
      preco decimal(10,2) NOT NULL DEFAULT 0.00,
      preco_de decimal(10,2) DEFAULT NULL,
      estoque int NOT NULL DEFAULT 0,
      peso_g int DEFAULT NULL,
      altura_cm int DEFAULT NULL,
      largura_cm int DEFAULT NULL,
      comprimento_cm int DEFAULT NULL,
      garantia varchar(200) DEFAULT NULL,
      laudo text DEFAULT NULL,
      especificacoes json DEFAULT NULL,
      imagens json DEFAULT NULL,
      ebook_arquivo varchar(255) DEFAULT NULL,
      ebook_paginas int DEFAULT NULL,
      carga_horaria varchar(60) DEFAULT NULL,
      destaque tinyint(1) NOT NULL DEFAULT 0,
      status varchar(12) NOT NULL DEFAULT 'rascunho',
      seo_titulo varchar(70) DEFAULT NULL,
      seo_descricao varchar(170) DEFAULT NULL,
      publicado_em varchar(50) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      updated_at varchar(50) NOT NULL,
      UNIQUE KEY unique_loja_produto_slug (user_id, slug),
      INDEX idx_loja_produtos_status (user_id, status, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_aulas (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      produto_id varchar(36) NOT NULL,
      modulo varchar(150) DEFAULT NULL,
      titulo varchar(200) NOT NULL,
      descricao text DEFAULT NULL,
      video_url varchar(500) DEFAULT NULL,
      duracao_min int DEFAULT NULL,
      ordem int NOT NULL DEFAULT 0,
      gratis tinyint(1) NOT NULL DEFAULT 0,
      created_at varchar(50) NOT NULL,
      updated_at varchar(50) NOT NULL,
      INDEX idx_loja_aulas_produto (produto_id, ordem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_pedidos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      numero int NOT NULL,
      conta_id varchar(36) NOT NULL,
      cliente_id varchar(36) DEFAULT NULL,
      comprador_nome varchar(255) DEFAULT NULL,
      comprador_email varchar(255) DEFAULT NULL,
      comprador_telefone varchar(30) DEFAULT NULL,
      status varchar(25) NOT NULL DEFAULT 'aguardando_pagamento',
      subtotal decimal(10,2) NOT NULL DEFAULT 0.00,
      frete decimal(10,2) NOT NULL DEFAULT 0.00,
      total decimal(10,2) NOT NULL DEFAULT 0.00,
      entrega_tipo varchar(10) NOT NULL,
      frete_servico json DEFAULT NULL,
      endereco json DEFAULT NULL,
      mp_preference_id varchar(100) DEFAULT NULL,
      mp_init_point varchar(500) DEFAULT NULL,
      mp_payment_id varchar(40) DEFAULT NULL,
      forma_pagamento varchar(40) DEFAULT NULL,
      rastreio_codigo varchar(60) DEFAULT NULL,
      rastreio_url varchar(500) DEFAULT NULL,
      observacoes text DEFAULT NULL,
      expira_em varchar(50) DEFAULT NULL,
      pago_em varchar(50) DEFAULT NULL,
      enviado_em varchar(50) DEFAULT NULL,
      entregue_em varchar(50) DEFAULT NULL,
      cancelado_em varchar(50) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      updated_at varchar(50) NOT NULL,
      UNIQUE KEY unique_loja_pedido_numero (user_id, numero),
      INDEX idx_loja_pedidos_conta (conta_id),
      INDEX idx_loja_pedidos_status (user_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_pedido_itens (
      id varchar(36) NOT NULL PRIMARY KEY,
      pedido_id varchar(36) NOT NULL,
      produto_id varchar(36) NOT NULL,
      tipo varchar(10) NOT NULL,
      titulo varchar(200) NOT NULL,
      preco_unit decimal(10,2) NOT NULL,
      quantidade int NOT NULL,
      INDEX idx_loja_itens_pedido (pedido_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_acessos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      conta_id varchar(36) NOT NULL,
      produto_id varchar(36) NOT NULL,
      pedido_id varchar(36) DEFAULT NULL,
      concedido_em varchar(50) NOT NULL,
      revogado_em varchar(50) DEFAULT NULL,
      UNIQUE KEY unique_loja_acesso (conta_id, produto_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_progresso (
      conta_id varchar(36) NOT NULL,
      aula_id varchar(36) NOT NULL,
      concluido_em varchar(50) NOT NULL,
      PRIMARY KEY (conta_id, aula_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_mp_eventos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) DEFAULT NULL,
      chave varchar(120) NOT NULL,
      pedido_id varchar(36) DEFAULT NULL,
      status varchar(30) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      UNIQUE KEY unique_loja_mp_evento (chave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS loja_config (
      user_id varchar(36) NOT NULL PRIMARY KEY,
      loja_ativa tinyint(1) NOT NULL DEFAULT 1,
      cep_origem varchar(8) DEFAULT '71909720',
      retirada_ativa tinyint(1) NOT NULL DEFAULT 1,
      retirada_texto varchar(300) DEFAULT 'Retire na loja: Vitrinni Shopping, Águas Claras (segunda a sábado, a partir das 10h)',
      envio_ativo tinyint(1) NOT NULL DEFAULT 1,
      prazo_postagem_dias int NOT NULL DEFAULT 2,
      updated_at varchar(50) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    fs.mkdirSync(imagensDir, { recursive: true });
    fs.mkdirSync(privadoDir, { recursive: true });
  }

  async function getConfig(userId = tenant()) {
    const [[row]] = await pool.query('SELECT * FROM loja_config WHERE user_id = ?', [userId]);
    return {
      loja_ativa: row ? Number(row.loja_ativa) === 1 : true,
      cep_origem: row?.cep_origem || '71909720',
      retirada_ativa: row ? Number(row.retirada_ativa) === 1 : true,
      retirada_texto: row?.retirada_texto || 'Retire na loja: Vitrinni Shopping, Águas Claras (segunda a sábado, a partir das 10h)',
      envio_ativo: row ? Number(row.envio_ativo) === 1 : true,
      prazo_postagem_dias: row ? Number(row.prazo_postagem_dias) : 2,
    };
  }

  // ---------- Formatação ----------

  function imagemUrl(p) {
    return `${osUrl}/uploads/loja/${p}`;
  }

  function publicProduct(p, { detalhe = false } = {}) {
    const imagens = parseJson(p.imagens, []).map((img) => ({ url: imagemUrl(img.path), alt: img.alt || p.titulo }));
    const base = {
      id: p.id,
      tipo: p.tipo,
      titulo: p.titulo,
      slug: p.slug,
      subtitulo: p.subtitulo,
      condicao: p.condicao,
      marca: p.marca,
      categoria: p.categoria,
      preco: Number(p.preco),
      preco_de: p.preco_de ? Number(p.preco_de) : null,
      disponivel: p.status === 'publicado' && (p.tipo !== 'fisico' || Number(p.estoque) > 0),
      status: p.status,
      destaque: Number(p.destaque) === 1,
      imagens,
      updated_at: p.updated_at,
    };
    if (!detalhe) return base;
    return {
      ...base,
      descricao: p.descricao || '',
      sku: p.sku,
      estoque: p.tipo === 'fisico' ? Number(p.estoque) : null,
      garantia: p.garantia,
      laudo: p.laudo,
      especificacoes: parseJson(p.especificacoes, []),
      ebook_paginas: p.ebook_paginas,
      carga_horaria: p.carga_horaria,
      seo_titulo: p.seo_titulo,
      seo_descricao: p.seo_descricao,
      peso_g: p.peso_g,
    };
  }

  async function lessonsOf(produtoId, { comVideo }) {
    const [rows] = await pool.query(
      'SELECT id, modulo, titulo, descricao, video_url, duracao_min, ordem, gratis FROM loja_aulas WHERE produto_id = ? ORDER BY ordem, created_at',
      [produtoId],
    );
    return rows.map((a) => ({
      id: a.id, modulo: a.modulo, titulo: a.titulo, descricao: a.descricao, duracao_min: a.duracao_min, gratis: Number(a.gratis) === 1,
      video_url: comVideo || Number(a.gratis) === 1 ? a.video_url : null,
    }));
  }

  // ---------- Catálogo público ----------

  async function catalog() {
    const [rows] = await pool.query(
      `SELECT * FROM loja_produtos WHERE user_id = ? AND status IN ('publicado', 'esgotado')
        ORDER BY destaque DESC, status = 'esgotado', COALESCE(publicado_em, created_at) DESC`,
      [tenant()],
    );
    return rows.map((p) => publicProduct(p));
  }

  async function productBySlug(slug) {
    const [[p]] = await pool.query(
      "SELECT * FROM loja_produtos WHERE user_id = ? AND slug = ? AND status IN ('publicado', 'esgotado')",
      [tenant(), String(slug).slice(0, 100)],
    );
    if (!p) throw new LojaError(404, 'produto_nao_encontrado', 'Produto não encontrado.');
    const produto = publicProduct(p, { detalhe: true });
    if (p.tipo === 'curso') produto.aulas = await lessonsOf(p.id, { comVideo: false });
    return produto;
  }

  // ---------- Carrinho, frete e pedido ----------

  async function reservations(conn = pool) {
    const [rows] = await conn.query(
      `SELECT i.produto_id, SUM(i.quantidade) AS qtd FROM loja_pedido_itens i JOIN loja_pedidos p ON p.id = i.pedido_id
        WHERE p.user_id = ? AND p.status = 'aguardando_pagamento' AND p.expira_em > ? AND i.tipo = 'fisico'
        GROUP BY i.produto_id`,
      [tenant(), now()],
    );
    return Object.fromEntries(rows.map((r) => [r.produto_id, Number(r.qtd)]));
  }

  async function loadCart(itensPedidos, conn = pool) {
    const ids = [...new Set((itensPedidos || []).map((i) => String(i.produto_id)))].slice(0, 30);
    if (!ids.length) throw new LojaError(400, 'carrinho_vazio', 'Carrinho vazio.');
    const [rows] = await conn.query('SELECT * FROM loja_produtos WHERE user_id = ? AND id IN (?)', [tenant(), ids]);
    const carrinho = validateCart(itensPedidos, new Map(rows.map((r) => [r.id, r])), await reservations(conn));
    if (carrinho.erro) throw new LojaError(409, 'carrinho_invalido', carrinho.erro);
    return carrinho;
  }

  async function shippingOptions(cep, itens) {
    const config = await getConfig();
    const opcoes = [];
    if (config.retirada_ativa) opcoes.push({ id: 'retirada', nome: 'Retirar na loja', preco: 0, prazo_dias: null, descricao: config.retirada_texto });
    if (config.envio_ativo && melhorEnvioToken && cep) {
      try {
        const res = await fetch(`${ME_API}/me/shipment/calculate`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${melhorEnvioToken}`,
            'User-Agent': `Servicos Prime Luthieria (${melhorEnvioEmail || 'contato@luthieriabrasilia.com.br'})`,
          },
          body: JSON.stringify(melhorEnvioPayload({ cepOrigem: config.cep_origem, cepDestino: cep, itens })),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) log.error('[loja] Melhor Envio respondeu', res.status, JSON.stringify(data)?.slice(0, 300));
        opcoes.push(...parseMelhorEnvio(data, config.prazo_postagem_dias));
      } catch (error) {
        log.error('[loja] falha no cálculo de frete:', error.message);
      }
    }
    return opcoes;
  }

  async function quote({ itens: itensPedidos, cep }) {
    const carrinho = await loadCart(itensPedidos);
    if (!carrinho.temFisico) return { subtotal: carrinho.subtotal, opcoes: [{ id: 'digital', nome: 'Acesso imediato na sua conta', preco: 0, prazo_dias: 0 }] };
    const cepOk = normalizeCep(cep);
    if (cep && !cepOk) throw new LojaError(400, 'cep_invalido', 'CEP inválido.');
    return { subtotal: carrinho.subtotal, opcoes: await shippingOptions(cepOk, carrinho.itens) };
  }

  async function verifiedAccount(contaId) {
    const [[conta]] = await pool.query('SELECT * FROM portal_contas WHERE id = ? AND user_id = ?', [contaId, tenant()]);
    if (!conta) throw new LojaError(404, 'conta_nao_encontrada', 'Conta não encontrada.');
    const [vinculos] = await pool.query('SELECT cliente_id FROM portal_vinculos WHERE conta_id = ?', [contaId]);
    if (!conta.verificado_em || !vinculos.length) {
      throw new LojaError(403, 'nao_verificado', 'Confirme seu CPF e telefone na sua conta antes de comprar.');
    }
    return { conta, clienteId: vinculos[0].cliente_id };
  }

  function validAddress(e) {
    const endereco = {
      destinatario: String(e?.destinatario || '').trim().slice(0, 120),
      cep: normalizeCep(e?.cep),
      logradouro: String(e?.logradouro || '').trim().slice(0, 150),
      numero: String(e?.numero || '').trim().slice(0, 20),
      complemento: String(e?.complemento || '').trim().slice(0, 80),
      bairro: String(e?.bairro || '').trim().slice(0, 80),
      cidade: String(e?.cidade || '').trim().slice(0, 80),
      uf: String(e?.uf || '').trim().toUpperCase().slice(0, 2),
    };
    const faltando = ['destinatario', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'].filter((k) => !endereco[k]);
    if (faltando.length) throw new LojaError(400, 'endereco_incompleto', 'Preencha o endereço de entrega completo.');
    return endereco;
  }

  async function createOrder(contaId, body) {
    if (!mpAccessToken) throw new LojaError(503, 'pagamento_indisponivel', 'O pagamento online ainda não está disponível. Fale com a loja pelo WhatsApp.');
    const { conta, clienteId } = await verifiedAccount(contaId);
    const carrinho = await loadCart(body.itens);
    let entregaTipo = 'digital';
    let frete = 0;
    let freteServico = null;
    let endereco = null;

    if (carrinho.temFisico) {
      const escolha = String(body.entrega?.opcao || '');
      if (escolha === 'retirada') {
        if (!(await getConfig()).retirada_ativa) throw new LojaError(400, 'entrega_invalida', 'Retirada indisponível.');
        entregaTipo = 'retirada';
        freteServico = { id: 'retirada', nome: 'Retirar na loja' };
      } else if (escolha.startsWith('me:')) {
        endereco = validAddress(body.entrega?.endereco);
        const opcoes = await shippingOptions(endereco.cep, carrinho.itens);
        const opcao = opcoes.find((o) => o.id === escolha);
        if (!opcao) throw new LojaError(409, 'frete_mudou', 'Essa opção de frete não está mais disponível. Calcule o frete de novo.');
        entregaTipo = 'envio';
        frete = opcao.preco;
        freteServico = opcao;
      } else {
        throw new LojaError(400, 'entrega_invalida', 'Escolha como receber o pedido.');
      }
    }

    const total = money(carrinho.subtotal + frete);
    const expiraEm = new Date(Date.now() + RESERVA_MS);
    const pedidoId = uuid();
    const conn = await pool.getConnection();
    let numero;
    try {
      await conn.beginTransaction();
      // Revalida estoque dentro da transação (outra compra pode ter reservado a peça).
      await loadCart(body.itens, conn);
      const [[ultimo]] = await conn.query('SELECT COALESCE(MAX(numero), 1000) AS n FROM loja_pedidos WHERE user_id = ? FOR UPDATE', [tenant()]);
      numero = Number(ultimo.n) + 1;
      await conn.query(
        `INSERT INTO loja_pedidos (id, user_id, numero, conta_id, cliente_id, comprador_nome, comprador_email, comprador_telefone, status,
           subtotal, frete, total, entrega_tipo, frete_servico, endereco, expira_em, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_pagamento', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pedidoId, tenant(), numero, contaId, clienteId, conta.nome, conta.email, conta.telefone, carrinho.subtotal, frete, total, entregaTipo,
          freteServico ? JSON.stringify(freteServico) : null, endereco ? JSON.stringify(endereco) : null, expiraEm.toISOString(), now(), now()],
      );
      for (const item of carrinho.itens) {
        await conn.query(
          'INSERT INTO loja_pedido_itens (id, pedido_id, produto_id, tipo, titulo, preco_unit, quantidade) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), pedidoId, item.produto_id, item.tipo, item.titulo, item.preco_unit, item.quantidade],
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const preference = mercadoPagoPreference({
      pedido: { id: pedidoId, numero },
      itens: carrinho.itens,
      frete,
      comprador: { email: conta.email, nome: conta.nome },
      siteUrl: site,
      notificationUrl: `${osUrl}/api/loja/v1/webhooks/mercadopago`,
      expiraEm: brasiliaIso(expiraEm),
    });
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': pedidoId },
      body: JSON.stringify(preference),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.init_point) {
      log.error('[loja] Mercado Pago recusou a preferência:', res.status, JSON.stringify(data).slice(0, 400));
      await pool.query("UPDATE loja_pedidos SET status = 'cancelado', cancelado_em = ?, observacoes = 'Falha ao criar pagamento', updated_at = ? WHERE id = ?", [now(), now(), pedidoId]);
      throw new LojaError(502, 'pagamento_indisponivel', 'Não conseguimos abrir o pagamento agora. Tente de novo em alguns minutos.');
    }
    await pool.query('UPDATE loja_pedidos SET mp_preference_id = ?, mp_init_point = ?, updated_at = ? WHERE id = ?', [data.id, data.init_point, now(), pedidoId]);
    return { pedido_id: pedidoId, numero, total, pagamento_url: data.init_point };
  }

  // ---------- Pagamento confirmado pelo Mercado Pago ----------

  async function fetchPayment(paymentId) {
    const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Mercado Pago payments ${res.status}`);
    return res.json();
  }

  async function notifyCustomer(pedido, mensagem) {
    if (!pedido.comprador_telefone) return;
    try {
      await sendCustomerMessage(pedido.user_id, pedido.comprador_telefone, mensagem, { templateType: 'loja_pedido' });
    } catch (error) {
      log.warn('[loja] aviso ao cliente não enviado:', error.message);
    }
  }

  async function applyPayment(payment) {
    const pedidoId = String(payment.external_reference || '');
    if (!pedidoId) return { ignorado: 'sem_referencia' };
    const novoStatus = orderStatusFromPayment(payment.status);
    const chave = `${payment.id}:${payment.status}`;
    const conn = await pool.getConnection();
    let aviso = null;
    try {
      await conn.beginTransaction();
      const [[pedido]] = await conn.query('SELECT * FROM loja_pedidos WHERE id = ? FOR UPDATE', [pedidoId]);
      if (!pedido) {
        await conn.rollback();
        return { ignorado: 'pedido_inexistente' };
      }
      const [dup] = await conn.query('INSERT IGNORE INTO loja_mp_eventos (id, user_id, chave, pedido_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), pedido.user_id, chave, pedidoId, payment.status, now()]);
      if (dup.affectedRows === 0) {
        await conn.rollback();
        return { ignorado: 'evento_repetido' };
      }
      const [itens] = await conn.query('SELECT * FROM loja_pedido_itens WHERE pedido_id = ?', [pedidoId]);
      const jaPago = ['pago', 'em_separacao', 'enviado', 'entregue'].includes(pedido.status);

      if (novoStatus === 'pago' && !jaPago) {
        const avisosEstoque = [];
        for (const item of itens.filter((i) => i.tipo === 'fisico')) {
          const [r] = await conn.query('UPDATE loja_produtos SET estoque = estoque - ?, updated_at = ? WHERE id = ? AND estoque >= ?',
            [item.quantidade, now(), item.produto_id, item.quantidade]);
          if (r.affectedRows === 0) avisosEstoque.push(item.titulo);
          await conn.query("UPDATE loja_produtos SET status = 'esgotado' WHERE id = ? AND estoque <= 0 AND status = 'publicado'", [item.produto_id]);
        }
        for (const item of itens.filter((i) => i.tipo !== 'fisico')) {
          await conn.query(
            `INSERT INTO loja_acessos (id, user_id, conta_id, produto_id, pedido_id, concedido_em) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE revogado_em = NULL, pedido_id = VALUES(pedido_id), concedido_em = VALUES(concedido_em)`,
            [uuid(), pedido.user_id, pedido.conta_id, item.produto_id, pedidoId, now()],
          );
        }
        const soDigital = itens.every((i) => i.tipo !== 'fisico');
        const forma = payment.payment_type_id === 'bank_transfer' ? 'pix' : payment.payment_type_id === 'credit_card' ? 'credito'
          : payment.payment_type_id === 'debit_card' ? 'debito' : payment.payment_type_id === 'ticket' ? 'boleto' : 'credito';
        await conn.query(
          `UPDATE loja_pedidos SET status = ?, pago_em = ?, mp_payment_id = ?, forma_pagamento = ?, entregue_em = ?,
             observacoes = CONCAT(COALESCE(observacoes, ''), ?), updated_at = ? WHERE id = ?`,
          [soDigital ? 'entregue' : 'pago', now(), String(payment.id), forma, soDigital ? now() : null,
            avisosEstoque.length ? `Pago sem estoque suficiente: ${avisosEstoque.join(', ')}. ` : '', now(), pedidoId],
        );
        const categoriaId = ensureReceitaCategoria ? await ensureReceitaCategoria(pedido.user_id, conn) : null;
        await conn.query(
          `INSERT INTO transacoes_financeiras (id, user_id, descricao, valor, tipo, data, categoria_id, forma_pagamento, origem, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'receita', ?, ?, ?, 'loja', ?, ?)`,
          [uuid(), pedido.user_id, `Venda na loja do site · pedido #${pedido.numero}`, pedido.total, now(), categoriaId, forma, now(), now()],
        );
        aviso = soDigital
          ? `Pagamento confirmado! Seu pedido #${pedido.numero} já está liberado na sua conta: ${site}/minha-conta?aba=biblioteca`
          : `Pagamento confirmado! Recebemos o pedido #${pedido.numero} e já vamos separar. Acompanhe em ${site}/minha-conta?aba=pedidos`;
      } else if (novoStatus === 'reembolsado' && pedido.status !== 'reembolsado') {
        if (jaPago && !['enviado', 'entregue'].includes(pedido.status)) {
          for (const item of itens.filter((i) => i.tipo === 'fisico')) {
            await conn.query("UPDATE loja_produtos SET estoque = estoque + ?, status = IF(status = 'esgotado', 'publicado', status), updated_at = ? WHERE id = ?",
              [item.quantidade, now(), item.produto_id]);
          }
        }
        await conn.query('UPDATE loja_acessos SET revogado_em = ? WHERE pedido_id = ? AND revogado_em IS NULL', [now(), pedidoId]);
        await conn.query("UPDATE loja_pedidos SET status = 'reembolsado', cancelado_em = ?, updated_at = ? WHERE id = ?", [now(), now(), pedidoId]);
      } else if (novoStatus === 'cancelado' && pedido.status === 'aguardando_pagamento') {
        await conn.query("UPDATE loja_pedidos SET status = 'cancelado', cancelado_em = ?, updated_at = ? WHERE id = ?", [now(), now(), pedidoId]);
      }
      await conn.commit();
      if (aviso) await notifyCustomer(pedido, aviso);
      return { pedido: pedido.numero, status: novoStatus };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async function reconcile() {
    if (!mpAccessToken || !tenant()) return;
    try {
      await pool.query(
        "UPDATE loja_pedidos SET status = 'expirado', cancelado_em = ?, updated_at = ? WHERE status = 'aguardando_pagamento' AND expira_em < ?",
        [now(), now(), new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()],
      );
      const [pendentes] = await pool.query(
        "SELECT id FROM loja_pedidos WHERE user_id = ? AND status IN ('aguardando_pagamento', 'expirado') AND created_at > ? LIMIT 50",
        [tenant(), new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()],
      );
      for (const { id } of pendentes) {
        const res = await fetch(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` }, signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        for (const payment of data.results || []) await applyPayment(payment);
      }
    } catch (error) {
      log.error('[loja] conferência de pagamentos falhou:', error.message);
    }
  }

  function startJobs() {
    setInterval(() => void reconcile(), 15 * 60 * 1000).unref();
    setTimeout(() => void reconcile(), 60 * 1000).unref();
  }

  // ---------- Área do cliente ----------

  async function customerOrders(contaId) {
    const [pedidos] = await pool.query(
      "SELECT * FROM loja_pedidos WHERE conta_id = ? AND user_id = ? AND status <> 'expirado' ORDER BY numero DESC LIMIT 100",
      [contaId, tenant()],
    );
    if (!pedidos.length) return [];
    const [itens] = await pool.query('SELECT * FROM loja_pedido_itens WHERE pedido_id IN (?)', [pedidos.map((p) => p.id)]);
    return pedidos.map((p) => ({
      id: p.id, numero: p.numero, status: p.status, total: Number(p.total), frete: Number(p.frete), entrega_tipo: p.entrega_tipo,
      frete_servico: parseJson(p.frete_servico, null), rastreio_codigo: p.rastreio_codigo, rastreio_url: p.rastreio_url,
      criado_em: p.created_at, pago_em: p.pago_em, enviado_em: p.enviado_em, entregue_em: p.entregue_em,
      pagamento_url: p.status === 'aguardando_pagamento' && p.expira_em > now() ? p.mp_init_point : null,
      itens: itens.filter((i) => i.pedido_id === p.id).map((i) => ({ titulo: i.titulo, tipo: i.tipo, quantidade: i.quantidade, preco_unit: Number(i.preco_unit) })),
    }));
  }

  async function library(contaId) {
    const [rows] = await pool.query(
      `SELECT p.* FROM loja_acessos a JOIN loja_produtos p ON p.id = a.produto_id
        WHERE a.conta_id = ? AND a.user_id = ? AND a.revogado_em IS NULL ORDER BY a.concedido_em DESC`,
      [contaId, tenant()],
    );
    const [progresso] = await pool.query('SELECT aula_id FROM loja_progresso WHERE conta_id = ?', [contaId]);
    const feitas = new Set(progresso.map((r) => r.aula_id));
    const out = [];
    for (const p of rows) {
      const item = publicProduct(p);
      if (p.tipo === 'curso') {
        const [aulas] = await pool.query('SELECT id FROM loja_aulas WHERE produto_id = ?', [p.id]);
        item.aulas_total = aulas.length;
        item.aulas_concluidas = aulas.filter((a) => feitas.has(a.id)).length;
      }
      out.push(item);
    }
    return out;
  }

  async function hasAccess(contaId, produtoId) {
    const [[row]] = await pool.query('SELECT id FROM loja_acessos WHERE conta_id = ? AND produto_id = ? AND revogado_em IS NULL', [contaId, produtoId]);
    return Boolean(row);
  }

  async function courseForCustomer(contaId, slug) {
    const [[p]] = await pool.query("SELECT * FROM loja_produtos WHERE user_id = ? AND slug = ? AND tipo = 'curso'", [tenant(), slug]);
    if (!p || !(await hasAccess(contaId, p.id))) throw new LojaError(403, 'sem_acesso', 'Você ainda não tem acesso a este curso.');
    const aulas = await lessonsOf(p.id, { comVideo: true });
    const [progresso] = await pool.query('SELECT aula_id FROM loja_progresso WHERE conta_id = ?', [contaId]);
    const feitas = new Set(progresso.map((r) => r.aula_id));
    return { ...publicProduct(p, { detalhe: true }), aulas: aulas.map((a) => ({ ...a, concluida: feitas.has(a.id) })) };
  }

  async function ebookFile(contaId, produtoId) {
    const [[p]] = await pool.query("SELECT * FROM loja_produtos WHERE user_id = ? AND id = ? AND tipo = 'ebook'", [tenant(), produtoId]);
    if (!p || !(await hasAccess(contaId, p.id))) throw new LojaError(403, 'sem_acesso', 'Você ainda não tem acesso a este ebook.');
    if (!p.ebook_arquivo) throw new LojaError(404, 'arquivo_indisponivel', 'O arquivo deste ebook ainda não foi enviado pela loja.');
    const arquivo = path.join(privadoDir, path.basename(p.ebook_arquivo));
    if (!fs.existsSync(arquivo)) throw new LojaError(404, 'arquivo_indisponivel', 'O arquivo deste ebook não está disponível. Fale com a loja.');
    return { arquivo, nome: `${p.slug}.pdf` };
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
      if (error instanceof LojaError) return res.status(error.status).json({ erro: error.code, mensagem: error.message });
      log.error('[loja] erro:', error);
      res.status(500).json({ erro: 'erro_interno', mensagem: 'Erro inesperado. Tente de novo.' });
    }
  };

  router.get('/catalogo', handle(async () => ({ produtos: await catalog(), config: { loja_ativa: (await getConfig()).loja_ativa } })));
  router.get('/produtos/:slug', handle((req) => productBySlug(req.params.slug)));
  router.post('/frete', handle((req) => quote(req.body || {})));
  router.post('/contas/:id/pedidos', handle((req) => createOrder(req.params.id, req.body || {})));
  router.get('/contas/:id/pedidos', handle(async (req) => ({ pedidos: await customerOrders(req.params.id) })));
  router.get('/contas/:id/biblioteca', handle(async (req) => ({ itens: await library(req.params.id) })));
  router.get('/contas/:id/cursos/:slug', handle((req) => courseForCustomer(req.params.id, req.params.slug)));
  router.post('/contas/:id/aulas/:aulaId/concluir', handle(async (req) => {
    const [[aula]] = await pool.query('SELECT produto_id FROM loja_aulas WHERE id = ?', [req.params.aulaId]);
    if (!aula || !(await hasAccess(req.params.id, aula.produto_id))) throw new LojaError(403, 'sem_acesso', 'Sem acesso a esta aula.');
    if (req.body?.concluida === false) await pool.query('DELETE FROM loja_progresso WHERE conta_id = ? AND aula_id = ?', [req.params.id, req.params.aulaId]);
    else await pool.query('INSERT IGNORE INTO loja_progresso (conta_id, aula_id, concluido_em) VALUES (?, ?, ?)', [req.params.id, req.params.aulaId, now()]);
    return { ok: true };
  }));
  router.get('/contas/:id/ebooks/:produtoId', async (req, res) => {
    try {
      const { arquivo, nome } = await ebookFile(req.params.id, req.params.produtoId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      fs.createReadStream(arquivo).pipe(res);
    } catch (error) {
      if (error instanceof LojaError) return res.status(error.status).json({ erro: error.code, mensagem: error.message });
      log.error('[loja] erro no ebook:', error);
      res.status(500).json({ erro: 'erro_interno' });
    }
  });

  // ---------- Aviso de pagamento (Mercado Pago chama direto) ----------

  const webhookRouter = express.Router();
  webhookRouter.post('/mercadopago', async (req, res) => {
    const dataId = String(req.query['data.id'] || req.body?.data?.id || req.query.id || '');
    const tipo = String(req.query.type || req.body?.type || req.query.topic || '');
    if (mpWebhookSecret && !mercadoPagoSignatureValid({
      secret: mpWebhookSecret, signatureHeader: req.get('x-signature'), requestId: req.get('x-request-id'), dataId,
    })) {
      log.warn('[loja] aviso do Mercado Pago com assinatura inválida');
      return res.status(401).json({ erro: 'assinatura_invalida' });
    }
    res.status(200).json({ ok: true });
    if (tipo !== 'payment' || !dataId || !mpAccessToken) return;
    try {
      // A verdade vem da API do Mercado Pago, nunca do corpo do aviso.
      const payment = await fetchPayment(dataId);
      const r = await applyPayment(payment);
      log.info?.(`[loja] pagamento ${dataId}: ${JSON.stringify(r)}`);
    } catch (error) {
      log.error('[loja] falha ao processar aviso de pagamento:', error.message);
    }
  });

  // ---------- Painel ----------

  const adminRouter = express.Router();
  const adminHandle = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (error) {
      if (error instanceof LojaError) return res.status(error.status).json({ error: { message: error.message } });
      log.error('[loja-admin] erro:', error);
      res.status(500).json({ error: { message: error.message || 'Erro inesperado' } });
    }
  };

  async function ownProduct(req) {
    const [[p]] = await pool.query('SELECT * FROM loja_produtos WHERE id = ? AND user_id = ?', [req.params.id, req.auth.accountId]);
    if (!p) throw new LojaError(404, 'produto_nao_encontrado', 'Produto não encontrado.');
    return p;
  }

  function adminProduct(p) {
    return {
      ...p,
      preco: Number(p.preco),
      preco_de: p.preco_de == null ? null : Number(p.preco_de),
      estoque: Number(p.estoque),
      destaque: Number(p.destaque) === 1,
      imagens: parseJson(p.imagens, []).map((img) => ({ ...img, url: imagemUrl(img.path) })),
      especificacoes: parseJson(p.especificacoes, []),
      tem_arquivo: Boolean(p.ebook_arquivo),
    };
  }

  const CAMPOS = ['tipo', 'titulo', 'subtitulo', 'descricao', 'condicao', 'marca', 'categoria', 'sku', 'preco', 'preco_de', 'estoque',
    'peso_g', 'altura_cm', 'largura_cm', 'comprimento_cm', 'garantia', 'laudo', 'especificacoes', 'ebook_paginas', 'carga_horaria',
    'destaque', 'status', 'seo_titulo', 'seo_descricao'];

  function cleanProductInput(body, atual = {}) {
    const out = {};
    for (const campo of CAMPOS) if (campo in body) out[campo] = body[campo];
    if ('tipo' in out && !TIPOS.includes(out.tipo)) throw new LojaError(400, 'tipo_invalido', 'Tipo inválido.');
    if ('status' in out && !STATUS_PRODUTO.includes(out.status)) throw new LojaError(400, 'status_invalido', 'Status inválido.');
    if ('titulo' in out && !String(out.titulo).trim()) throw new LojaError(400, 'titulo_obrigatorio', 'Informe o nome do produto.');
    for (const n of ['preco', 'preco_de']) if (n in out) out[n] = out[n] === '' || out[n] == null ? (n === 'preco' ? 0 : null) : money(out[n]);
    for (const n of ['estoque', 'peso_g', 'altura_cm', 'largura_cm', 'comprimento_cm', 'ebook_paginas']) {
      if (n in out) out[n] = out[n] === '' || out[n] == null ? (n === 'estoque' ? 0 : null) : Math.max(0, Math.round(Number(out[n]) || 0));
    }
    if ('destaque' in out) out.destaque = out.destaque ? 1 : 0;
    if ('especificacoes' in out) out.especificacoes = JSON.stringify(Array.isArray(out.especificacoes) ? out.especificacoes.slice(0, 30) : []);
    if ('condicao' in out && !['novo', 'seminovo', null, ''].includes(out.condicao)) throw new LojaError(400, 'condicao_invalida', 'Condição inválida.');
    const tipo = out.tipo || atual.tipo || 'fisico';
    const status = out.status || atual.status;
    if (status === 'publicado') {
      const preco = 'preco' in out ? out.preco : Number(atual.preco);
      if (!(preco > 0)) throw new LojaError(400, 'preco_obrigatorio', 'Para publicar, informe o preço.');
      if (tipo === 'fisico') {
        const medidas = ['peso_g', 'altura_cm', 'largura_cm', 'comprimento_cm'].every((m) => (m in out ? out[m] : atual[m]) > 0);
        if (!medidas) throw new LojaError(400, 'medidas_obrigatorias', 'Para publicar um produto físico, informe peso e medidas da embalagem (usados no frete).');
      }
    }
    return out;
  }

  async function uniqueSlug(userId, titulo, ignorarId = null) {
    const base = slugify(titulo) || 'produto';
    let slug = base;
    for (let i = 2; i < 100; i += 1) {
      const [[row]] = await pool.query('SELECT id FROM loja_produtos WHERE user_id = ? AND slug = ? AND id <> ?', [userId, slug, ignorarId || '']);
      if (!row) return slug;
      slug = `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  adminRouter.get('/status', adminHandle(async (req) => ({
    integrado: Boolean(secret && tenant() === req.auth.accountId),
    mercado_pago: Boolean(mpAccessToken),
    aviso_assinado: Boolean(mpWebhookSecret),
    melhor_envio: Boolean(melhorEnvioToken),
    url_aviso_pagamento: `${osUrl}/api/loja/v1/webhooks/mercadopago`,
    config: await getConfig(req.auth.accountId),
  })));

  adminRouter.put('/config', adminHandle(async (req) => {
    const b = req.body || {};
    const cep = normalizeCep(b.cep_origem);
    if (!cep) throw new LojaError(400, 'cep_invalido', 'CEP de origem inválido.');
    await pool.query(
      `INSERT INTO loja_config (user_id, loja_ativa, cep_origem, retirada_ativa, retirada_texto, envio_ativo, prazo_postagem_dias, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE loja_ativa = VALUES(loja_ativa), cep_origem = VALUES(cep_origem), retirada_ativa = VALUES(retirada_ativa),
         retirada_texto = VALUES(retirada_texto), envio_ativo = VALUES(envio_ativo), prazo_postagem_dias = VALUES(prazo_postagem_dias), updated_at = VALUES(updated_at)`,
      [req.auth.accountId, b.loja_ativa === false ? 0 : 1, cep, b.retirada_ativa === false ? 0 : 1, String(b.retirada_texto || '').slice(0, 300) || null,
        b.envio_ativo === false ? 0 : 1, Math.max(0, Math.min(30, Number(b.prazo_postagem_dias) || 0)), now()],
    );
    return getConfig(req.auth.accountId);
  }));

  adminRouter.get('/produtos', adminHandle(async (req) => {
    const [rows] = await pool.query('SELECT * FROM loja_produtos WHERE user_id = ? ORDER BY updated_at DESC', [req.auth.accountId]);
    return { produtos: rows.map(adminProduct) };
  }));

  adminRouter.post('/produtos', adminHandle(async (req) => {
    const dados = cleanProductInput({ status: 'rascunho', ...req.body });
    const id = uuid();
    const slug = await uniqueSlug(req.auth.accountId, dados.titulo);
    const cols = Object.keys(dados);
    await pool.query(
      `INSERT INTO loja_produtos (id, user_id, slug, ${cols.join(', ')}, publicado_em, created_at, updated_at)
       VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')}, ?, ?, ?)`,
      [id, req.auth.accountId, slug, ...cols.map((c) => dados[c]), dados.status === 'publicado' ? now() : null, now(), now()],
    );
    return adminProduct((await pool.query('SELECT * FROM loja_produtos WHERE id = ?', [id]))[0][0]);
  }));

  adminRouter.get('/produtos/:id', adminHandle(async (req) => {
    const p = adminProduct(await ownProduct(req));
    const [aulas] = await pool.query('SELECT * FROM loja_aulas WHERE produto_id = ? ORDER BY ordem, created_at', [p.id]);
    return { ...p, aulas: aulas.map((a) => ({ ...a, gratis: Number(a.gratis) === 1 })) };
  }));

  adminRouter.put('/produtos/:id', adminHandle(async (req) => {
    const atual = await ownProduct(req);
    const dados = cleanProductInput(req.body || {}, atual);
    if (dados.titulo && req.body.atualizar_slug) dados.slug = await uniqueSlug(req.auth.accountId, dados.titulo, atual.id);
    if (dados.status === 'publicado' && !atual.publicado_em) dados.publicado_em = now();
    const cols = Object.keys(dados);
    if (cols.length) {
      await pool.query(`UPDATE loja_produtos SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...cols.map((c) => dados[c]), now(), atual.id]);
    }
    return adminProduct((await pool.query('SELECT * FROM loja_produtos WHERE id = ?', [atual.id]))[0][0]);
  }));

  adminRouter.delete('/produtos/:id', adminHandle(async (req) => {
    const p = await ownProduct(req);
    const [[uso]] = await pool.query('SELECT COUNT(*) AS n FROM loja_pedido_itens WHERE produto_id = ?', [p.id]);
    if (Number(uso.n) > 0) {
      await pool.query("UPDATE loja_produtos SET status = 'arquivado', updated_at = ? WHERE id = ?", [now(), p.id]);
      return { arquivado: true };
    }
    await pool.query('DELETE FROM loja_aulas WHERE produto_id = ?', [p.id]);
    await pool.query('DELETE FROM loja_produtos WHERE id = ?', [p.id]);
    fs.rmSync(path.join(imagensDir, p.id), { recursive: true, force: true });
    return { excluido: true };
  }));

  adminRouter.post('/produtos/:id/imagens', express.raw({ type: ['image/*'], limit: '8mb' }), adminHandle(async (req) => {
    const p = await ownProduct(req);
    const ext = IMAGE_TYPES[String(req.get('content-type') || '').split(';')[0]];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw new LojaError(400, 'imagem_invalida', 'Envie uma imagem JPG, PNG ou WebP.');
    const imagens = parseJson(p.imagens, []);
    if (imagens.length >= 12) throw new LojaError(400, 'imagens_demais', 'Máximo de 12 fotos por produto.');
    const nome = `${uuid()}.${ext}`;
    fs.mkdirSync(path.join(imagensDir, p.id), { recursive: true });
    fs.writeFileSync(path.join(imagensDir, p.id, nome), req.body);
    imagens.push({ path: `${p.id}/${nome}`, alt: String(req.query.alt || '').slice(0, 200) || p.titulo });
    await pool.query('UPDATE loja_produtos SET imagens = ?, updated_at = ? WHERE id = ?', [JSON.stringify(imagens), now(), p.id]);
    return adminProduct({ ...p, imagens: JSON.stringify(imagens) });
  }));

  adminRouter.put('/produtos/:id/imagens', adminHandle(async (req) => {
    const p = await ownProduct(req);
    const atuais = parseJson(p.imagens, []);
    const pedidas = Array.isArray(req.body?.imagens) ? req.body.imagens : [];
    const validas = pedidas
      .map((img) => ({ path: String(img.path || ''), alt: String(img.alt || '').slice(0, 200) }))
      .filter((img) => atuais.some((a) => a.path === img.path));
    for (const removida of atuais.filter((a) => !validas.some((v) => v.path === a.path))) {
      fs.rmSync(path.join(imagensDir, removida.path), { force: true });
    }
    await pool.query('UPDATE loja_produtos SET imagens = ?, updated_at = ? WHERE id = ?', [JSON.stringify(validas), now(), p.id]);
    return adminProduct({ ...p, imagens: JSON.stringify(validas) });
  }));

  adminRouter.post('/produtos/:id/ebook', express.raw({ type: ['application/pdf'], limit: '60mb' }), adminHandle(async (req) => {
    const p = await ownProduct(req);
    if (p.tipo !== 'ebook') throw new LojaError(400, 'tipo_invalido', 'Só ebooks recebem arquivo PDF.');
    if (!Buffer.isBuffer(req.body) || req.body.subarray(0, 5).toString() !== '%PDF-') throw new LojaError(400, 'pdf_invalido', 'Envie um arquivo PDF.');
    const nome = `${p.id}.pdf`;
    fs.writeFileSync(path.join(privadoDir, nome), req.body);
    await pool.query('UPDATE loja_produtos SET ebook_arquivo = ?, updated_at = ? WHERE id = ?', [nome, now(), p.id]);
    return { ok: true, tamanho: req.body.length };
  }));

  adminRouter.post('/produtos/:id/aulas', adminHandle(async (req) => {
    const p = await ownProduct(req);
    const b = req.body || {};
    if (!String(b.titulo || '').trim()) throw new LojaError(400, 'titulo_obrigatorio', 'Informe o título da aula.');
    const [[{ ordem }]] = await pool.query('SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM loja_aulas WHERE produto_id = ?', [p.id]);
    const id = uuid();
    await pool.query(
      `INSERT INTO loja_aulas (id, user_id, produto_id, modulo, titulo, descricao, video_url, duracao_min, ordem, gratis, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.auth.accountId, p.id, String(b.modulo || '').slice(0, 150) || null, String(b.titulo).slice(0, 200), b.descricao || null,
        String(b.video_url || '').slice(0, 500) || null, Number(b.duracao_min) || null, ordem, b.gratis ? 1 : 0, now(), now()],
    );
    return { id };
  }));

  adminRouter.put('/aulas/:aulaId', adminHandle(async (req) => {
    const b = req.body || {};
    await pool.query(
      `UPDATE loja_aulas SET modulo = ?, titulo = ?, descricao = ?, video_url = ?, duracao_min = ?, ordem = ?, gratis = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
      [String(b.modulo || '').slice(0, 150) || null, String(b.titulo || '').slice(0, 200), b.descricao || null, String(b.video_url || '').slice(0, 500) || null,
        Number(b.duracao_min) || null, Number(b.ordem) || 0, b.gratis ? 1 : 0, now(), req.params.aulaId, req.auth.accountId],
    );
    return { ok: true };
  }));

  adminRouter.delete('/aulas/:aulaId', adminHandle(async (req) => {
    await pool.query('DELETE FROM loja_aulas WHERE id = ? AND user_id = ?', [req.params.aulaId, req.auth.accountId]);
    return { ok: true };
  }));

  adminRouter.get('/pedidos', adminHandle(async (req) => {
    const status = String(req.query.status || '');
    const [pedidos] = await pool.query(
      `SELECT * FROM loja_pedidos WHERE user_id = ? ${status ? 'AND status = ?' : "AND status <> 'expirado'"} ORDER BY numero DESC LIMIT 300`,
      status ? [req.auth.accountId, status] : [req.auth.accountId],
    );
    const ids = pedidos.map((p) => p.id);
    const [itens] = ids.length ? await pool.query('SELECT * FROM loja_pedido_itens WHERE pedido_id IN (?)', [ids]) : [[]];
    return {
      pedidos: pedidos.map((p) => ({
        ...p, subtotal: Number(p.subtotal), frete: Number(p.frete), total: Number(p.total),
        endereco: parseJson(p.endereco, null), frete_servico: parseJson(p.frete_servico, null),
        itens: itens.filter((i) => i.pedido_id === p.id).map((i) => ({ ...i, preco_unit: Number(i.preco_unit) })),
      })),
    };
  }));

  adminRouter.put('/pedidos/:pedidoId/status', adminHandle(async (req) => {
    const [[p]] = await pool.query('SELECT * FROM loja_pedidos WHERE id = ? AND user_id = ?', [req.params.pedidoId, req.auth.accountId]);
    if (!p) throw new LojaError(404, 'pedido_nao_encontrado', 'Pedido não encontrado.');
    const novo = String(req.body?.status || '');
    if (!(TRANSICOES_PAINEL[p.status] || []).includes(novo)) throw new LojaError(400, 'transicao_invalida', `Não é possível mudar de "${p.status}" para "${novo}".`);
    const rastreio = String(req.body?.rastreio_codigo || p.rastreio_codigo || '').trim().slice(0, 60) || null;
    const rastreioUrl = String(req.body?.rastreio_url || p.rastreio_url || '').trim().slice(0, 500) || null;
    if (novo === 'enviado' && p.entrega_tipo === 'envio' && !rastreio) throw new LojaError(400, 'rastreio_obrigatorio', 'Informe o código de rastreio para marcar como enviado.');
    await pool.query(
      `UPDATE loja_pedidos SET status = ?, rastreio_codigo = ?, rastreio_url = ?, enviado_em = IF(? = 'enviado', ?, enviado_em),
         entregue_em = IF(? = 'entregue', ?, entregue_em), cancelado_em = IF(? = 'cancelado', ?, cancelado_em), updated_at = ? WHERE id = ?`,
      [novo, rastreio, rastreioUrl, novo, now(), novo, now(), novo, now(), now(), p.id],
    );
    if (novo === 'cancelado' && p.status !== 'aguardando_pagamento') {
      const [itens] = await pool.query("SELECT * FROM loja_pedido_itens WHERE pedido_id = ? AND tipo = 'fisico'", [p.id]);
      for (const item of itens) {
        await pool.query("UPDATE loja_produtos SET estoque = estoque + ?, status = IF(status = 'esgotado', 'publicado', status) WHERE id = ?", [item.quantidade, item.produto_id]);
      }
      await pool.query('UPDATE loja_acessos SET revogado_em = ? WHERE pedido_id = ?', [now(), p.id]);
    }
    const mensagens = {
      em_separacao: `Seu pedido #${p.numero} está sendo separado.`,
      enviado: `Seu pedido #${p.numero} foi enviado!${rastreio ? ` Código de rastreio: ${rastreio}.` : ''} Acompanhe em ${site}/minha-conta?aba=pedidos`,
      entregue: p.entrega_tipo === 'retirada' ? `Pedido #${p.numero} retirado. Obrigado pela compra!` : `Pedido #${p.numero} entregue. Obrigado pela compra!`,
    };
    if (novo === 'pago' || mensagens[novo]) await notifyCustomer(p, mensagens[novo] || '');
    return { ok: true };
  }));

  return { ensureSchema, router, webhookRouter, adminRouter, startJobs, applyPayment, reconcile, getConfig };
}
