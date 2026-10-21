// Portal do cliente: API interna chamada só pelo servidor do site (assinada com HMAC) e rotas do painel
// para contas vinculadas e cadastros duplicados. Fica desligado sem PORTAL_SHARED_SECRET e PORTAL_TENANT_ID.
import express from 'express';
import {
  agendaTemperature, findDuplicateGroups, formatCpf, generateCode, hashCode, hashCpf, isValidCpf, maskCpf, maskPhone,
  nextWorkingDays, onlyDigits, phoneKey, phonesMatch, pickPrimaryClient, verifyPortalRequest, whatsappNumber,
} from './portal-core.mjs';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const LIMITS = { inicioPorConta: 5, inicioPorIp: 15, envioPorCpf: 3 };
const ACTIVE_ORDER_STATUSES = ['pendente', 'em_andamento', 'atraso'];

class PortalError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const GENERIC_MISMATCH = new PortalError(
  422,
  'dados_nao_conferem',
  'Não encontramos um cadastro com esses dados. Confira o CPF e o telefone ou fale com a loja.',
);

export function createPortal({ pool, uuid, now, todayDate, sendCustomerMessage, tenantId: tenantIdOption, tenantEmail, secret, devCodes = false, log = console }) {
  // A empresa do site: PORTAL_TENANT_ID, o e-mail de login da loja (PORTAL_TENANT_EMAIL) ou,
  // sem nenhum dos dois, a única conta principal do sistema.
  let tenantId = tenantIdOption || null;
  const isEnabled = () => Boolean(secret && secret.length >= 32 && tenantId);

  async function resolveTenant() {
    if (tenantId) return;
    if (tenantEmail) {
      const [[user]] = await pool.query('SELECT id, conta_id FROM usuarios WHERE email = ? LIMIT 1', [String(tenantEmail).trim().toLowerCase()]);
      if (user) tenantId = user.conta_id || user.id;
      else log.error(`[portal] PORTAL_TENANT_EMAIL não encontrado: ${tenantEmail}`);
      return;
    }
    const [owners] = await pool.query(
      "SELECT id FROM usuarios WHERE (conta_id IS NULL OR conta_id = '' OR conta_id = id) AND COALESCE(ativo, 1) = 1 LIMIT 2",
    );
    if (owners.length === 1) tenantId = owners[0].id;
    else if (secret) log.warn('[portal] Mais de uma conta no sistema: defina PORTAL_TENANT_EMAIL para escolher a loja do site.');
  }

  async function ensureSchema() {
    await resolveTenant();
    await pool.query(`CREATE TABLE IF NOT EXISTS portal_contas (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      google_sub varchar(64) NOT NULL,
      email varchar(255) DEFAULT NULL,
      email_verificado tinyint(1) NOT NULL DEFAULT 0,
      nome varchar(255) DEFAULT NULL,
      foto_url varchar(500) DEFAULT NULL,
      cpf varchar(14) DEFAULT NULL,
      telefone varchar(30) DEFAULT NULL,
      verificado_em varchar(50) DEFAULT NULL,
      ultimo_acesso varchar(50) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      updated_at varchar(50) NOT NULL,
      UNIQUE KEY unique_portal_conta_google (user_id, google_sub),
      INDEX idx_portal_contas_cpf (user_id, cpf)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS portal_vinculos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      conta_id varchar(36) NOT NULL,
      cliente_id varchar(36) NOT NULL,
      origem varchar(40) NOT NULL,
      created_at varchar(50) NOT NULL,
      UNIQUE KEY unique_portal_vinculo (conta_id, cliente_id),
      INDEX idx_portal_vinculos_cliente (user_id, cliente_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS portal_verificacoes (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      conta_id varchar(36) NOT NULL,
      cpf varchar(14) NOT NULL,
      telefone varchar(30) NOT NULL,
      modo varchar(20) NOT NULL,
      cliente_ids json DEFAULT NULL,
      codigo_hash varchar(64) NOT NULL,
      tentativas int NOT NULL DEFAULT 0,
      expira_em varchar(50) NOT NULL,
      usado_em varchar(50) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      INDEX idx_portal_verificacoes_conta (conta_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS portal_eventos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      conta_id varchar(36) DEFAULT NULL,
      tipo varchar(40) NOT NULL,
      chave varchar(64) DEFAULT NULL,
      ip varchar(45) DEFAULT NULL,
      created_at varchar(50) NOT NULL,
      INDEX idx_portal_eventos_tipo (user_id, tipo, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS portal_config (
      user_id varchar(36) NOT NULL PRIMARY KEY,
      portal_ativo tinyint(1) NOT NULL DEFAULT 1,
      capacidade_diaria int NOT NULL DEFAULT 4,
      updated_at varchar(50) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  // ---------- Utilitários ----------

  const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  async function audit(conn, { contaId, acao, recursoId = null, detalhes = null, ip = null, actor = null }) {
    await conn.query(
      `INSERT INTO auditoria (id, user_id, actor_user_id, actor_email, actor_role, acao, recurso, recurso_id, detalhes, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), actor?.accountId || tenantId, actor?.userId || contaId, actor?.email || null, actor?.role || 'cliente_portal',
        acao, 'portal', recursoId, detalhes ? JSON.stringify(detalhes) : null, ip, now()],
    );
  }

  async function recordEvent(tipo, { contaId = null, chave = null, ip = null } = {}) {
    await pool.query('INSERT INTO portal_eventos (id, user_id, conta_id, tipo, chave, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), tenantId, contaId, tipo, chave, ip, now()]);
  }

  async function countEvents(tipo, field, value) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total FROM portal_eventos WHERE user_id = ? AND tipo = ? AND \`${field}\` = ? AND created_at >= ?`,
      [tenantId, tipo, value, hourAgo()],
    );
    return Number(row.total);
  }

  async function getConfig(userId = tenantId) {
    const [[row]] = await pool.query('SELECT portal_ativo, capacidade_diaria FROM portal_config WHERE user_id = ?', [userId]);
    return { portal_ativo: row ? Number(row.portal_ativo) === 1 : true, capacidade_diaria: row ? Number(row.capacidade_diaria) : 4 };
  }

  async function loadAccount(contaId) {
    const [[conta]] = await pool.query('SELECT * FROM portal_contas WHERE id = ? AND user_id = ?', [contaId, tenantId]);
    if (!conta) throw new PortalError(404, 'conta_nao_encontrada', 'Conta não encontrada.');
    return conta;
  }

  async function linkedClientIds(contaId) {
    const [rows] = await pool.query('SELECT cliente_id FROM portal_vinculos WHERE conta_id = ? AND user_id = ?', [contaId, tenantId]);
    return rows.map((r) => r.cliente_id);
  }

  async function requireLinked(contaId) {
    const conta = await loadAccount(contaId);
    const ids = await linkedClientIds(contaId);
    if (!conta.verificado_em || !ids.length) throw new PortalError(403, 'nao_verificado', 'Confirme seu CPF e telefone para ver seus serviços.');
    return { conta, ids };
  }

  function publicAccount(conta, ids) {
    return {
      id: conta.id,
      nome: conta.nome,
      email: conta.email,
      foto_url: conta.foto_url,
      verificado: Boolean(conta.verificado_em && ids.length),
      cpf: maskCpf(conta.cpf),
      telefone: maskPhone(conta.telefone),
    };
  }

  // ---------- Verificação CPF + telefone ----------

  async function startVerification(contaId, { cpf, telefone, ip }) {
    const conta = await loadAccount(contaId);
    const cpfDigits = onlyDigits(cpf);
    if (!isValidCpf(cpfDigits)) throw new PortalError(400, 'cpf_invalido', 'CPF inválido. Confira os números.');
    if (!phoneKey(telefone) || onlyDigits(telefone).length < 10) {
      throw new PortalError(400, 'telefone_invalido', 'Informe o telefone com DDD.');
    }

    if (await countEvents('verificacao_inicio', 'conta_id', contaId) >= LIMITS.inicioPorConta
      || (ip && await countEvents('verificacao_inicio', 'ip', ip) >= LIMITS.inicioPorIp)) {
      throw new PortalError(429, 'muitas_tentativas', 'Muitas tentativas. Tente de novo em 1 hora ou fale com a loja.');
    }
    const cpfHash = hashCpf(secret, cpfDigits);
    if (await countEvents('codigo_enviado', 'chave', cpfHash) >= LIMITS.envioPorCpf) {
      throw new PortalError(429, 'muitas_tentativas', 'Muitas tentativas. Tente de novo em 1 hora ou fale com a loja.');
    }
    await recordEvent('verificacao_inicio', { contaId, ip });

    const final8 = phoneKey(telefone).final8;
    const [rows] = await pool.query(
      `SELECT id, nome, cpf_cnpj, telefone FROM clientes
        WHERE user_id = ?
          AND (REGEXP_REPLACE(IFNULL(cpf_cnpj, ''), '[^0-9]', '') = ?
               OR REGEXP_REPLACE(IFNULL(telefone, ''), '[^0-9]', '') LIKE ?)`,
      [tenantId, cpfDigits, `%${final8}`],
    );
    const cpfOf = (r) => onlyDigits(r.cpf_cnpj);
    const sameCpf = rows.filter((r) => cpfOf(r) === cpfDigits);
    const phoneNoCpf = rows.filter((r) => !isValidCpf(cpfOf(r)) && phonesMatch(r.telefone, telefone));

    let modo;
    let alvo;
    let clienteIds;
    if (sameCpf.length) {
      const match = sameCpf.find((r) => phonesMatch(r.telefone, telefone));
      if (!match) {
        await audit(pool, { contaId, acao: 'portal_verificacao_recusada', detalhes: { cpf: maskCpf(cpfDigits), motivo: 'telefone_diferente' }, ip });
        throw GENERIC_MISMATCH;
      }
      modo = 'cliente';
      alvo = match.telefone;
      clienteIds = [...new Set([...sameCpf, ...phoneNoCpf].map((r) => r.id))];
    } else if (phoneNoCpf.length) {
      modo = 'telefone';
      alvo = phoneNoCpf[0].telefone;
      clienteIds = phoneNoCpf.map((r) => r.id);
    } else if (rows.some((r) => phonesMatch(r.telefone, telefone))) {
      // O telefone pertence a outro cliente com outro CPF.
      await audit(pool, { contaId, acao: 'portal_verificacao_recusada', detalhes: { cpf: maskCpf(cpfDigits), motivo: 'telefone_de_outro_cpf' }, ip });
      throw GENERIC_MISMATCH;
    } else {
      modo = 'novo';
      alvo = telefone;
      clienteIds = [];
    }

    // Uma verificação aberta por vez.
    await pool.query('UPDATE portal_verificacoes SET usado_em = ? WHERE conta_id = ? AND usado_em IS NULL', [now(), contaId]);
    const id = uuid();
    const code = generateCode();
    const expiraEm = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await pool.query(
      `INSERT INTO portal_verificacoes (id, user_id, conta_id, cpf, telefone, modo, cliente_ids, codigo_hash, expira_em, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantId, contaId, cpfDigits, String(alvo), modo, JSON.stringify(clienteIds), hashCode(secret, id, code), expiraEm, now()],
    );

    const mensagem = `Seu código de acesso à área do cliente é ${code}.\n\nEle vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`;
    if (devCodes) {
      log.warn(`[portal] código de teste para ${maskPhone(alvo)}: ${code}`);
    } else {
      try {
        await sendCustomerMessage(tenantId, whatsappNumber(alvo), mensagem, { templateType: 'portal_codigo' });
      } catch (error) {
        await pool.query('UPDATE portal_verificacoes SET usado_em = ? WHERE id = ?', [now(), id]);
        log.error('[portal] falha ao enviar código:', error.message);
        throw new PortalError(502, 'whatsapp_indisponivel', 'Não conseguimos enviar o código pelo WhatsApp agora. Tente de novo em alguns minutos ou fale com a loja.');
      }
    }
    await recordEvent('codigo_enviado', { contaId, chave: cpfHash, ip });
    await audit(pool, { contaId, acao: 'portal_codigo_enviado', recursoId: id, detalhes: { cpf: maskCpf(cpfDigits), telefone: maskPhone(alvo), modo }, ip });
    log.info?.(`[portal] código enviado conta=${contaId} modo=${modo} conta_nome=${conta.nome || ''}`);
    return { verificacao_id: id, telefone: maskPhone(alvo), expira_em: expiraEm };
  }

  async function confirmVerification(contaId, { verificacao_id: verificationId, codigo, ip }) {
    const conta = await loadAccount(contaId);
    const [[v]] = await pool.query('SELECT * FROM portal_verificacoes WHERE id = ? AND conta_id = ? AND user_id = ?', [verificationId, contaId, tenantId]);
    if (!v || v.usado_em || v.expira_em < now()) {
      throw new PortalError(410, 'codigo_expirado', 'Esse código expirou. Peça um novo.');
    }
    if (Number(v.tentativas) >= MAX_CODE_ATTEMPTS) {
      await pool.query('UPDATE portal_verificacoes SET usado_em = ? WHERE id = ?', [now(), v.id]);
      throw new PortalError(429, 'muitas_tentativas', 'Muitas tentativas com o código. Peça um novo.');
    }
    if (hashCode(secret, v.id, codigo) !== v.codigo_hash) {
      await pool.query('UPDATE portal_verificacoes SET tentativas = tentativas + 1 WHERE id = ?', [v.id]);
      const restantes = MAX_CODE_ATTEMPTS - Number(v.tentativas) - 1;
      throw new PortalError(400, 'codigo_incorreto', restantes > 0 ? `Código incorreto. Você tem mais ${restantes} tentativa${restantes > 1 ? 's' : ''}.` : 'Código incorreto. Peça um novo.', { restantes });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE portal_verificacoes SET usado_em = ? WHERE id = ?', [now(), v.id]);
      let clienteIds = Array.isArray(v.cliente_ids) ? v.cliente_ids : JSON.parse(v.cliente_ids || '[]');

      if (v.modo === 'novo') {
        const clienteId = uuid();
        await conn.query(
          `INSERT INTO clientes (id, user_id, nome, cpf_cnpj, telefone, email, avaliou, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [clienteId, tenantId, conta.nome || 'Cliente do site', formatCpf(v.cpf), v.telefone, conta.email, now(), now()],
        );
        clienteIds = [clienteId];
      } else if (v.modo === 'telefone' && clienteIds.length) {
        // Cadastros achados pelo telefone verificado e sem CPF passam a ter o CPF informado.
        await conn.query(
          `UPDATE clientes SET cpf_cnpj = ?, updated_at = ?
            WHERE user_id = ? AND id IN (?) AND REGEXP_REPLACE(IFNULL(cpf_cnpj, ''), '[^0-9]', '') = ''`,
          [formatCpf(v.cpf), now(), tenantId, clienteIds],
        );
      }

      for (const clienteId of clienteIds) {
        await conn.query(
          'INSERT IGNORE INTO portal_vinculos (id, user_id, conta_id, cliente_id, origem, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), tenantId, contaId, clienteId, v.modo === 'novo' ? 'novo_cadastro' : v.modo === 'telefone' ? 'telefone' : 'cpf_telefone', now()],
        );
      }
      await conn.query('UPDATE portal_contas SET cpf = ?, telefone = ?, verificado_em = ?, updated_at = ? WHERE id = ?',
        [v.cpf, v.telefone, now(), now(), contaId]);
      await audit(conn, { contaId, acao: 'portal_conta_vinculada', recursoId: contaId, detalhes: { modo: v.modo, clientes: clienteIds }, ip });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    const ids = await linkedClientIds(contaId);
    return publicAccount(await loadAccount(contaId), ids);
  }

  // ---------- Dados do cliente ----------

  async function companyInfo() {
    const [[row]] = await pool.query(
      `SELECT nome_empresa, cnpj, COALESCE(telefone_empresa, telefone) AS telefone, email, endereco, horario_funcionamento, dias_funcionamento
         FROM configuracoes_empresa WHERE user_id = ? LIMIT 1`,
      [tenantId],
    );
    return row || {};
  }

  const ORDER_FIELDS = `o.id, o.numero, o.status, o.data_entrada, o.data_previsao, o.data_entrega, o.modelo, o.acessorios,
    o.valor_servicos, o.desconto, o.valor_total, o.valor_pago, o.status_financeiro, o.forma_pagamento,
    o.problema_descricao, o.problemas_descricoes, o.servico_descricao, o.servicos_descricoes, o.observacoes, o.cliente_id,
    COALESCE(i.nome, '') AS instrumento, COALESCE(m.nome, '') AS marca, c.nome AS cliente_nome`;

  function listText(json, fallback) {
    let items = json;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = null; }
    }
    if (Array.isArray(items) && items.length) return items.map(String).join(', ');
    return fallback || '';
  }

  function shapeOrder(o) {
    return {
      id: o.id,
      numero: o.numero,
      status: o.status,
      instrumento: [o.instrumento, o.marca, o.modelo].filter(Boolean).join(' '),
      data_entrada: o.data_entrada ? String(o.data_entrada).slice(0, 10) : null,
      data_previsao: o.data_previsao ? String(o.data_previsao).slice(0, 10) : null,
      data_entrega: o.data_entrega ? String(o.data_entrega).slice(0, 10) : null,
      problemas: listText(o.problemas_descricoes, o.problema_descricao),
      servicos: listText(o.servicos_descricoes, o.servico_descricao),
      valor_total: Number(o.valor_total || 0),
      valor_pago: Number(o.valor_pago || 0),
      status_financeiro: o.status_financeiro,
    };
  }

  async function listOrders(contaId) {
    const { ids } = await requireLinked(contaId);
    const [rows] = await pool.query(
      `SELECT ${ORDER_FIELDS} FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
         LEFT JOIN instrumentos i ON i.id = o.instrumento_id
         LEFT JOIN marcas m ON m.id = o.marca_id
        WHERE o.user_id = ? AND o.cliente_id IN (?)
        ORDER BY o.numero DESC LIMIT 200`,
      [tenantId, ids],
    );
    return rows.map(shapeOrder);
  }

  async function orderDetail(contaId, orderId) {
    const { ids } = await requireLinked(contaId);
    const [[o]] = await pool.query(
      `SELECT ${ORDER_FIELDS} FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
         LEFT JOIN instrumentos i ON i.id = o.instrumento_id
         LEFT JOIN marcas m ON m.id = o.marca_id
        WHERE o.user_id = ? AND o.id = ? AND o.cliente_id IN (?)`,
      [tenantId, orderId, ids],
    );
    if (!o) throw new PortalError(404, 'os_nao_encontrada', 'Ordem de serviço não encontrada.');
    const [pagamentos] = await pool.query(
      `SELECT valor, forma_pagamento, data_pagamento FROM os_pagamentos
        WHERE user_id = ? AND ordem_servico_id = ? AND COALESCE(status, 'confirmado') <> 'cancelado'
        ORDER BY data_pagamento`,
      [tenantId, o.id],
    );
    const [aditivos] = await pool.query(
      `SELECT numero, titulo, justificativa, valor_adicional, valor_total_novo, prazo_novo, status, enviado_em, aprovado_em, recusado_em
         FROM os_aditivos WHERE user_id = ? AND ordem_servico_id = ? AND status IN ('enviado', 'aprovado', 'recusado')
        ORDER BY numero`,
      [tenantId, o.id],
    );
    const base = shapeOrder(o);
    const linha = [
      base.data_entrada && { data: base.data_entrada, evento: 'Instrumento recebido na loja' },
      ...aditivos.map((a) => ({ data: String(a.aprovado_em || a.recusado_em || a.enviado_em || '').slice(0, 10), evento: `Aditivo #${a.numero} ${a.status === 'aprovado' ? 'aprovado' : a.status === 'recusado' ? 'recusado' : 'enviado'}: ${a.titulo}` })),
      ...pagamentos.map((p) => ({ data: String(p.data_pagamento).slice(0, 10), evento: `Pagamento de R$ ${Number(p.valor).toFixed(2).replace('.', ',')}${p.forma_pagamento ? ` (${p.forma_pagamento})` : ''}` })),
      base.status === 'concluido' && !base.data_entrega && { data: null, evento: 'Serviço concluído, pronto para retirada' },
      base.data_entrega && { data: base.data_entrega, evento: 'Instrumento entregue' },
    ].filter((e) => e && (e.data || e.evento)).sort((a, b) => String(a.data || '9').localeCompare(String(b.data || '9')));
    return {
      ...base,
      cliente_nome: o.cliente_nome,
      acessorios: o.acessorios || '',
      observacoes: o.observacoes || '',
      valor_servicos: Number(o.valor_servicos || 0),
      desconto: Number(o.desconto || 0),
      forma_pagamento: o.forma_pagamento,
      pagamentos: pagamentos.map((p) => ({ valor: Number(p.valor), forma: p.forma_pagamento, data: String(p.data_pagamento).slice(0, 10) })),
      aditivos: aditivos.map((a) => ({ numero: a.numero, titulo: a.titulo, justificativa: a.justificativa, valor_adicional: Number(a.valor_adicional), status: a.status, prazo_novo: a.prazo_novo ? String(a.prazo_novo).slice(0, 10) : null })),
      linha_do_tempo: linha,
      empresa: await companyInfo(),
    };
  }

  async function listQuotes(contaId) {
    const { ids } = await requireLinked(contaId);
    try {
      const [rows] = await pool.query(
        `SELECT id, numero, status, valor_total, validade, equipamento, servico_descricao, data_previsao, enviado_em
           FROM orcamentos WHERE user_id = ? AND cliente_id IN (?) AND status IN ('enviado', 'aprovado', 'recusado')
          ORDER BY numero DESC LIMIT 50`,
        [tenantId, ids],
      );
      return rows.map((q) => ({
        id: q.id, numero: q.numero, valor_total: Number(q.valor_total || 0), equipamento: q.equipamento, servicos: q.servico_descricao,
        validade: q.validade ? String(q.validade).slice(0, 10) : null, data_previsao: q.data_previsao,
        status: q.status === 'enviado' && q.validade && String(q.validade).slice(0, 10) < todayDate() ? 'expirado' : q.status,
      }));
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return [];
      throw error;
    }
  }

  async function agenda() {
    const { capacidade_diaria: capacidade } = await getConfig();
    const today = todayDate();
    const dias = nextWorkingDays(today, 12);
    const [rows] = await pool.query(
      `SELECT GREATEST(LEFT(data_previsao, 10), ?) AS dia, COUNT(*) AS total
         FROM ordens_servico
        WHERE user_id = ? AND status IN (?) AND data_previsao IS NOT NULL AND LEFT(data_previsao, 10) <= ?
        GROUP BY dia`,
      [today, tenantId, ACTIVE_ORDER_STATUSES, dias[dias.length - 1]],
    );
    const ocupacao = Object.fromEntries(rows.map((r) => [String(r.dia).slice(0, 10), Number(r.total)]));
    const temp = agendaTemperature({ capacidade, dias, ocupacao });
    return { nivel: temp.nivel, dias: temp.dias, primeiro_dia_livre: temp.primeiroDiaLivre, atualizado_em: now() };
  }

  async function preferences(contaId) {
    const { ids } = await requireLinked(contaId);
    const [prefs] = await pool.query(
      'SELECT lembretes_manutencao_autorizado FROM comunicacao_preferencias WHERE user_id = ? AND cliente_id IN (?)', [tenantId, ids]);
    const [clients] = await pool.query('SELECT avaliou FROM clientes WHERE user_id = ? AND id IN (?)', [tenantId, ids]);
    return {
      lembretes_manutencao: prefs.some((p) => Number(p.lembretes_manutencao_autorizado) === 1),
      avaliou: clients.some((c) => Number(c.avaliou) === 1),
    };
  }

  async function updatePreferences(contaId, body, ip) {
    const { ids } = await requireLinked(contaId);
    if (typeof body.lembretes_manutencao === 'boolean') {
      const ativo = body.lembretes_manutencao;
      for (const clienteId of ids) {
        await pool.query(
          `INSERT INTO comunicacao_preferencias
             (id, user_id, cliente_id, lembretes_manutencao_autorizado, origem_consentimento, consentido_em, descadastrado_em, motivo_descadastro, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'portal', ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE lembretes_manutencao_autorizado = VALUES(lembretes_manutencao_autorizado),
             origem_consentimento = 'portal', consentido_em = VALUES(consentido_em),
             descadastrado_em = VALUES(descadastrado_em), motivo_descadastro = VALUES(motivo_descadastro), updated_at = VALUES(updated_at)`,
          [uuid(), tenantId, clienteId, ativo ? 1 : 0, ativo ? now() : null, ativo ? null : now(), ativo ? null : 'Desativado pelo cliente na área do cliente', now(), now()],
        );
      }
    }
    if (typeof body.avaliou === 'boolean') {
      await pool.query('UPDATE clientes SET avaliou = ?, updated_at = ? WHERE user_id = ? AND id IN (?)', [body.avaliou ? 1 : 0, now(), tenantId, ids]);
      if (body.avaliou) {
        await pool.query(
          `UPDATE avaliacoes_lembretes SET status = 'cancelado', mensagem_erro = 'Cliente informou que já avaliou', updated_at = ?
            WHERE user_id = ? AND cliente_id IN (?) AND status = 'pendente'`,
          [now(), tenantId, ids],
        );
      }
    }
    await audit(pool, { contaId, acao: 'portal_preferencias', detalhes: body, ip });
    return preferences(contaId);
  }

  // ---------- Rotas internas (site -> sistema) ----------

  const router = express.Router();

  router.use((req, res, next) => {
    if (!isEnabled()) return res.status(503).json({ erro: 'portal_desativado' });
    const ok = verifyPortalRequest({
      secret,
      method: req.method,
      path: req.originalUrl,
      body: req.rawBody ? req.rawBody.toString('utf8') : '',
      timestamp: req.get('x-portal-timestamp'),
      signature: req.get('x-portal-signature'),
    });
    if (!ok) return res.status(401).json({ erro: 'assinatura_invalida' });
    next();
  });

  router.use(async (_req, res, next) => {
    try {
      const config = await getConfig();
      if (!config.portal_ativo) return res.status(503).json({ erro: 'portal_desativado', mensagem: 'A área do cliente está temporariamente desligada.' });
      next();
    } catch (error) {
      next(error);
    }
  });

  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof PortalError) {
        return res.status(error.status).json({ erro: error.code, mensagem: error.message, ...error.extra });
      }
      log.error('[portal] erro:', error);
      res.status(500).json({ erro: 'erro_interno', mensagem: 'Erro inesperado. Tente de novo.' });
    }
  };

  const clientIp = (req) => String(req.body?.ip || req.get('x-portal-client-ip') || '').slice(0, 45) || null;

  router.post('/contas/sync', handle(async (req) => {
    const sub = String(req.body.google_sub || '').slice(0, 64);
    if (!sub) throw new PortalError(400, 'google_sub_obrigatorio', 'Conta Google inválida.');
    const values = {
      email: String(req.body.email || '').toLowerCase().slice(0, 255) || null,
      email_verificado: req.body.email_verificado ? 1 : 0,
      nome: String(req.body.nome || '').slice(0, 255) || null,
      foto_url: String(req.body.foto_url || '').slice(0, 500) || null,
    };
    await pool.query(
      `INSERT INTO portal_contas (id, user_id, google_sub, email, email_verificado, nome, foto_url, ultimo_acesso, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), email_verificado = VALUES(email_verificado), nome = VALUES(nome),
         foto_url = VALUES(foto_url), ultimo_acesso = VALUES(ultimo_acesso), updated_at = VALUES(updated_at)`,
      [uuid(), tenantId, sub, values.email, values.email_verificado, values.nome, values.foto_url, now(), now(), now()],
    );
    const [[conta]] = await pool.query('SELECT * FROM portal_contas WHERE user_id = ? AND google_sub = ?', [tenantId, sub]);
    return publicAccount(conta, await linkedClientIds(conta.id));
  }));

  router.get('/contas/:id', handle(async (req) => {
    const conta = await loadAccount(req.params.id);
    return publicAccount(conta, await linkedClientIds(conta.id));
  }));

  router.post('/contas/:id/verificacao', handle((req) => startVerification(req.params.id, { ...req.body, ip: clientIp(req) })));
  router.post('/contas/:id/verificacao/confirmar', handle((req) => confirmVerification(req.params.id, { ...req.body, ip: clientIp(req) })));
  router.get('/contas/:id/ordens', handle(async (req) => ({ ordens: await listOrders(req.params.id) })));
  router.get('/contas/:id/ordens/:ordemId', handle((req) => orderDetail(req.params.id, req.params.ordemId)));
  router.get('/contas/:id/orcamentos', handle(async (req) => ({ orcamentos: await listQuotes(req.params.id) })));
  router.get('/contas/:id/preferencias', handle((req) => preferences(req.params.id)));
  router.put('/contas/:id/preferencias', handle((req) => updatePreferences(req.params.id, req.body || {}, clientIp(req))));
  router.get('/agenda', handle(() => agenda()));

  // ---------- Rotas do painel (usuário logado do sistema) ----------

  const adminRouter = express.Router();
  const adminHandle = (fn) => async (req, res) => {
    try {
      res.json({ data: await fn(req) });
    } catch (error) {
      if (error instanceof PortalError) return res.status(error.status).json({ error: { message: error.message } });
      log.error('[portal-admin] erro:', error);
      res.status(500).json({ error: { message: error.message || 'Erro inesperado' } });
    }
  };

  adminRouter.get('/config', adminHandle(async (req) => ({ ...(await getConfig(req.auth.accountId)), integrado: isEnabled() && req.auth.accountId === tenantId })));

  adminRouter.put('/config', adminHandle(async (req) => {
    const capacidade = Math.max(1, Math.min(100, Number(req.body.capacidade_diaria) || 4));
    const ativo = req.body.portal_ativo === false ? 0 : 1;
    await pool.query(
      `INSERT INTO portal_config (user_id, portal_ativo, capacidade_diaria, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE portal_ativo = VALUES(portal_ativo), capacidade_diaria = VALUES(capacidade_diaria), updated_at = VALUES(updated_at)`,
      [req.auth.accountId, ativo, capacidade, now()],
    );
    return getConfig(req.auth.accountId);
  }));

  adminRouter.get('/contas', adminHandle(async (req) => {
    const [contas] = await pool.query(
      `SELECT id, email, nome, cpf, telefone, verificado_em, ultimo_acesso, created_at FROM portal_contas
        WHERE user_id = ? ORDER BY COALESCE(ultimo_acesso, created_at) DESC LIMIT 500`,
      [req.auth.accountId],
    );
    const [vinculos] = await pool.query(
      `SELECT v.conta_id, v.cliente_id, v.origem, v.created_at, c.nome AS cliente_nome
         FROM portal_vinculos v JOIN clientes c ON c.id = v.cliente_id
        WHERE v.user_id = ?`,
      [req.auth.accountId],
    );
    return {
      contas: contas.map((c) => ({
        id: c.id, email: c.email, nome: c.nome, cpf: maskCpf(c.cpf), telefone: maskPhone(c.telefone),
        verificado_em: c.verificado_em, ultimo_acesso: c.ultimo_acesso, created_at: c.created_at,
        clientes: vinculos.filter((v) => v.conta_id === c.id).map((v) => ({ id: v.cliente_id, nome: v.cliente_nome, origem: v.origem })),
      })),
    };
  }));

  adminRouter.delete('/contas/:contaId/vinculos/:clienteId', adminHandle(async (req) => {
    await pool.query('DELETE FROM portal_vinculos WHERE user_id = ? AND conta_id = ? AND cliente_id = ?',
      [req.auth.accountId, req.params.contaId, req.params.clienteId]);
    const [[restante]] = await pool.query('SELECT COUNT(*) AS total FROM portal_vinculos WHERE conta_id = ?', [req.params.contaId]);
    if (Number(restante.total) === 0) {
      await pool.query('UPDATE portal_contas SET verificado_em = NULL, updated_at = ? WHERE id = ? AND user_id = ?', [now(), req.params.contaId, req.auth.accountId]);
    }
    await audit(pool, { contaId: req.params.contaId, acao: 'portal_vinculo_removido', recursoId: req.params.clienteId, actor: { ...req.auth } });
    return { ok: true };
  }));

  // Cadastros duplicados de clientes.

  async function orderCounts(userId) {
    const [rows] = await pool.query('SELECT cliente_id, COUNT(*) AS total FROM ordens_servico WHERE user_id = ? GROUP BY cliente_id', [userId]);
    return Object.fromEntries(rows.map((r) => [r.cliente_id, Number(r.total)]));
  }

  adminRouter.get('/clientes-duplicados', adminHandle(async (req) => {
    const userId = req.auth.accountId;
    const [clients] = await pool.query('SELECT id, nome, cpf_cnpj, telefone, email, endereco, created_at FROM clientes WHERE user_id = ?', [userId]);
    const counts = await orderCounts(userId);
    const groups = findDuplicateGroups(clients).map((g) => {
      const principal = pickPrimaryClient(g.clientes, counts);
      return {
        motivo: g.motivo,
        sugerido_id: principal.id,
        clientes: g.clientes.map((c) => ({ ...c, ordens: counts[c.id] || 0 })),
      };
    });
    const order = { cpf: 0, telefone: 1, telefone_nomes_diferentes: 2 };
    groups.sort((a, b) => order[a.motivo] - order[b.motivo]);
    return { grupos: groups, total_clientes: clients.length };
  }));

  adminRouter.post('/clientes-duplicados/mesclar', adminHandle(async (req) => {
    const userId = req.auth.accountId;
    const keepId = String(req.body.manter_id || '');
    const mergeIds = [...new Set((req.body.mesclar_ids || []).map(String))].filter((id) => id && id !== keepId);
    if (!keepId || !mergeIds.length) throw new PortalError(400, 'dados_invalidos', 'Escolha o cadastro que fica e os que serão unidos.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [members] = await conn.query('SELECT * FROM clientes WHERE user_id = ? AND id IN (?) FOR UPDATE', [userId, [keepId, ...mergeIds]]);
      const keep = members.find((c) => c.id === keepId);
      const others = members.filter((c) => c.id !== keepId);
      if (!keep || others.length !== mergeIds.length) throw new PortalError(404, 'cliente_nao_encontrado', 'Algum cadastro não foi encontrado.');
      const cpfs = new Set(members.map((c) => onlyDigits(c.cpf_cnpj)).filter((d) => isValidCpf(d)));
      if (cpfs.size > 1) throw new PortalError(409, 'cpfs_diferentes', 'Esses cadastros têm CPFs diferentes e não podem ser unidos.');

      const [tables] = await conn.query(
        `SELECT TABLE_NAME AS t,
                SUM(COLUMN_NAME = 'user_id') AS has_user
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'clientes' AND COLUMN_NAME IN ('cliente_id', 'user_id')
          GROUP BY TABLE_NAME
         HAVING SUM(COLUMN_NAME = 'cliente_id') > 0`,
      );
      const moved = {};
      for (const { t, has_user: hasUser } of tables) {
        const scope = Number(hasUser) ? ' AND user_id = ?' : '';
        const scopeParams = Number(hasUser) ? [userId] : [];
        if (t === 'comunicacao_preferencias' || t === 'portal_vinculos') {
          // Tabelas com cliente único: mantém o registro do cadastro que fica e descarta os repetidos.
          const [result] = await conn.query(`UPDATE IGNORE \`${t}\` SET cliente_id = ? WHERE cliente_id IN (?)${scope}`, [keepId, mergeIds, ...scopeParams]);
          await conn.query(`DELETE FROM \`${t}\` WHERE cliente_id IN (?)${scope}`, [mergeIds, ...scopeParams]);
          moved[t] = result.affectedRows;
        } else {
          const [result] = await conn.query(`UPDATE \`${t}\` SET cliente_id = ? WHERE cliente_id IN (?)${scope}`, [keepId, mergeIds, ...scopeParams]);
          if (result.affectedRows) moved[t] = result.affectedRows;
        }
      }

      const fill = {};
      for (const field of ['cpf_cnpj', 'telefone', 'email', 'endereco']) {
        if (!String(keep[field] || '').trim()) {
          const donor = others.find((c) => String(c[field] || '').trim());
          if (donor) fill[field] = donor[field];
        }
      }
      const avaliou = members.some((c) => Number(c.avaliou) === 1) ? 1 : 0;
      const sets = [...Object.keys(fill).map((f) => `\`${f}\` = ?`), 'avaliou = ?', 'updated_at = ?'];
      await conn.query(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...Object.values(fill), avaliou, now(), keepId, userId]);

      await audit(conn, {
        contaId: keepId,
        acao: 'clientes_mesclados',
        recursoId: keepId,
        detalhes: { mantido: keepId, removidos: others, registros_movidos: moved, campos_preenchidos: Object.keys(fill) },
        actor: { ...req.auth },
      });
      await conn.query('DELETE FROM clientes WHERE user_id = ? AND id IN (?)', [userId, mergeIds]);
      await conn.commit();
      return { ok: true, mantido: keepId, removidos: mergeIds.length, registros_movidos: moved };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }));

  return { get enabled() { return isEnabled(); }, ensureSchema, router, adminRouter, startVerification, confirmVerification };
}
