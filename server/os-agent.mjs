/**
 * Ferramentas de ordens de serviço para o agente de IA (WhatsApp).
 *
 * Regras de produto:
 *  - Para AGIR (iniciar, contratempo, finalizar, avisar o cliente) só valem OS abertas
 *    (pendente = aguardando, em_andamento = na bancada, atraso = contratempo).
 *  - Para CONSULTAR (problemas, serviços, pagamento, data de entrega) vale qualquer OS, inclusive as fechadas.
 *  - Nomes digitados de ouvido ("oto tetuliano") são encontrados por similaridade; havendo mais de um
 *    candidato plausível, a ferramenta devolve a lista e o agente pergunta antes de agir.
 */

import { renderForOrder } from './message-templates.mjs';

export const OPEN_STATUSES = ['pendente', 'em_andamento', 'atraso'];

export const STATUS_LABEL = {
  pendente: 'aguardando (ainda não começou)',
  em_andamento: 'na bancada (em andamento)',
  atraso: 'com contratempo',
  concluido: 'concluída (pronta/entregue)',
  cancelado: 'cancelada',
};

const NOTICE_TEMPLATE = { andamento: 'servico_andamento', contratempo: 'servico_atraso', pronto: 'servico_finalizado' };

/* ------------------------------------------------------------------ similaridade */

export function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function tokenScore(queryToken, candidateToken) {
  if (queryToken === candidateToken) return 1;
  if (queryToken.length >= 3 && (candidateToken.includes(queryToken) || (candidateToken.length >= 3 && queryToken.includes(candidateToken)))) return 0.95;
  const score = 1 - levenshtein(queryToken, candidateToken) / Math.max(queryToken.length, candidateToken.length);
  return score >= 0.72 ? score : 0;
}

/** 0..1: média, por palavra pesquisada, da melhor palavra parecida no texto candidato. */
export function similarity(query, candidateText) {
  const queryTokens = normalize(query).split(' ').filter((token) => token.length >= 2);
  const candidateTokens = normalize(candidateText).split(' ').filter(Boolean);
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const total = queryTokens.reduce((sum, token) => sum + Math.max(0, ...candidateTokens.map((candidate) => tokenScore(token, candidate))), 0);
  return total / queryTokens.length;
}

export function rankOrders(rows, { cliente, equipamento }) {
  return rows
    .map((row) => {
      const parts = [];
      if (cliente) parts.push(similarity(cliente, row.cliente_nome));
      if (equipamento) parts.push(similarity(equipamento, [row.instrumento, row.marca, row.modelo].filter(Boolean).join(' ')));
      const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 1;
      return { row, score };
    })
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score || Number(b.row.numero) - Number(a.row.numero));
}

/* ------------------------------------------------------------------ esquemas das ferramentas */

const STATUS_ENUM = ['em_andamento', 'atraso', 'concluido', 'pendente'];

export const OS_TOOLS = [
  {
    type: 'function',
    name: 'listar_os',
    description:
      'Lista ordens de serviço ABERTAS por situação. filtro: hoje (previstas para hoje), atrasadas (previsão vencida), bancada (em andamento), aguardando (ainda não iniciadas), contratempo, semana (próximos 7 dias) ou abertas (todas).',
    parameters: { type: 'object', properties: { filtro: { type: 'string', enum: ['hoje', 'atrasadas', 'bancada', 'aguardando', 'contratempo', 'semana', 'abertas'] } }, required: ['filtro'] },
  },
  {
    type: 'function',
    name: 'buscar_os',
    description:
      'Encontra ordens de serviço pelo nome do cliente e/ou equipamento (aceita erros de digitação). escopo "abertas" (padrão) para agir; "fechadas" ou "todas" para consultar histórico. ' +
      'Se voltar mais de uma OS plausível, PERGUNTE ao usuário qual é antes de agir.',
    parameters: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nome (ou parte) do cliente' },
        equipamento: { type: 'string', description: 'Instrumento, marca ou modelo (ex.: "violão tagima")' },
        numero: { type: 'integer', description: 'Número da OS, se o usuário disser' },
        escopo: { type: 'string', enum: ['abertas', 'fechadas', 'todas'] },
      },
    },
  },
  {
    type: 'function',
    name: 'detalhes_os',
    description:
      'Ficha completa de uma OS (qualquer status): cliente, equipamento, problemas relatados, serviços, valores, saldo, pagamentos feitos (com forma e data), datas de entrada/previsão/entrega e nota fiscal.',
    parameters: { type: 'object', properties: { os_id: { type: 'string' } }, required: ['os_id'] },
  },
  {
    type: 'function',
    name: 'mudar_status_os',
    description:
      'Muda a situação de uma OS ABERTA. em_andamento = iniciar serviço (vai para a bancada); atraso = contratempo; concluido = finalizar (pronta); pendente = voltar para aguardando. ' +
      'Não envia mensagem ao cliente: para avisar use avisar_cliente_os.',
    parameters: { type: 'object', properties: { os_id: { type: 'string' }, status: { type: 'string', enum: STATUS_ENUM } }, required: ['os_id', 'status'] },
  },
  {
    type: 'function',
    name: 'avisar_cliente_os',
    description:
      'Envia ao cliente, pelo WhatsApp, o aviso padrão da oficina. tipo: andamento (serviço iniciado), contratempo (houve imprevisto/atraso) ou pronto (instrumento pronto para retirar). ' +
      'complemento opcional é adicionado ao final (ex.: o motivo do contratempo). Só use quando o usuário pedir para avisar.',
    parameters: {
      type: 'object',
      properties: { os_id: { type: 'string' }, tipo: { type: 'string', enum: ['andamento', 'contratempo', 'pronto'] }, complemento: { type: 'string' } },
      required: ['os_id', 'tipo'],
    },
  },
  {
    type: 'function',
    name: 'cancelar_os',
    description: 'Cancela uma OS aberta. Só chame depois de o usuário confirmar claramente o cancelamento nesta conversa.',
    parameters: { type: 'object', properties: { os_id: { type: 'string' }, confirmado: { type: 'boolean' } }, required: ['os_id', 'confirmado'] },
  },
  {
    type: 'function',
    name: 'buscar_cliente',
    description: 'Procura clientes pelo nome (aceita erros de digitação) ou telefone. Use antes de criar uma OS.',
    parameters: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' } } },
  },
  {
    type: 'function',
    name: 'cadastrar_cliente',
    description: 'Cadastra um cliente novo. Antes, confirme com buscar_cliente que ele não existe.',
    parameters: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' } }, required: ['nome'] },
  },
  {
    type: 'function',
    name: 'criar_os',
    description:
      'Abre uma nova ordem de serviço para um cliente existente. Informe o que o usuário disse: instrumento, marca, modelo, problemas relatados, serviços a executar, valor combinado e previsão de entrega. ' +
      'Faltando o cliente, o equipamento ou o problema, pergunte antes de criar.',
    parameters: {
      type: 'object',
      properties: {
        cliente_id: { type: 'string' },
        instrumento: { type: 'string', description: 'Ex.: Violão, Guitarra, Baixo' },
        marca: { type: 'string' },
        modelo: { type: 'string' },
        problemas: { type: 'string', description: 'Problemas relatados pelo cliente' },
        servicos: { type: 'string', description: 'Serviços a executar' },
        valor: { type: 'number' },
        previsao: { type: 'string', description: 'YYYY-MM-DD' },
        acessorios: { type: 'string' },
        observacoes: { type: 'string' },
        forma_pagamento: { type: 'string', enum: ['pix', 'dinheiro', 'credito', 'debito', 'boleto'] },
      },
      required: ['cliente_id'],
    },
  },
  {
    type: 'function',
    name: 'listar_orcamentos',
    description: 'Lista orçamentos. filtro "abertos" (aguardando resposta do cliente, padrão) ou "todos". Opcionalmente filtre pelo nome do cliente.',
    parameters: { type: 'object', properties: { filtro: { type: 'string', enum: ['abertos', 'todos'] }, cliente: { type: 'string' } } },
  },
  {
    type: 'function',
    name: 'criar_orcamento',
    description:
      'Cria um ORÇAMENTO (não abre OS) para um cliente existente. Use quando o usuário pedir "orçamento", "orçar" ou "passar um valor". Mesmos campos de criar_os; validade_dias padrão 7. Não envia ao cliente.',
    parameters: {
      type: 'object',
      properties: {
        cliente_id: { type: 'string' },
        instrumento: { type: 'string' },
        marca: { type: 'string' },
        modelo: { type: 'string' },
        problemas: { type: 'string' },
        servicos: { type: 'string' },
        valor: { type: 'number' },
        previsao: { type: 'string', description: 'Prazo estimado de entrega YYYY-MM-DD' },
        validade_dias: { type: 'integer' },
        observacoes: { type: 'string' },
      },
      required: ['cliente_id', 'valor'],
    },
  },
  {
    type: 'function',
    name: 'aprovar_orcamento',
    description:
      'O cliente fechou o orçamento: abre a OS com a data de entrega combinada (obrigatória, YYYY-MM-DD). sinal_valor opcional (sinal já recebido). Sempre use listar_orcamentos antes para achar o id e, se houver mais de um, pergunte qual.',
    parameters: {
      type: 'object',
      properties: { orcamento_id: { type: 'string' }, data_entrega: { type: 'string' }, sinal_valor: { type: 'number' }, sinal_forma: { type: 'string', enum: ['pix', 'dinheiro', 'debito', 'credito'] } },
      required: ['orcamento_id', 'data_entrega'],
    },
  },
  {
    type: 'function',
    name: 'transformar_os_em_orcamento',
    description:
      'Transforma uma OS ABERTA que ainda não começou (status aguardando, sem pagamento e sem nota) em orçamento: cria o orçamento com os mesmos dados e cancela a OS. Use quando o usuário disser que aquela OS era na verdade um orçamento. Localize a OS com buscar_os antes.',
    parameters: { type: 'object', properties: { os_id: { type: 'string' } }, required: ['os_id'] },
  },
  {
    type: 'function',
    name: 'recusar_orcamento',
    description: 'Marca um orçamento como recusado pelo cliente, com o motivo se houver.',
    parameters: { type: 'object', properties: { orcamento_id: { type: 'string' }, motivo: { type: 'string' } }, required: ['orcamento_id'] },
  },
];

export const OS_WRITE_TOOLS = new Set(['mudar_status_os', 'avisar_cliente_os', 'cancelar_os', 'cadastrar_cliente', 'criar_os', 'criar_orcamento', 'aprovar_orcamento', 'recusar_orcamento', 'transformar_os_em_orcamento']);
export const OS_TOOL_NAMES = new Set(OS_TOOLS.map((tool) => tool.name));

/* ------------------------------------------------------------------ implementação */

export function createOsTools({ pool, uuid, now, todayDate, money, syncReceivable, sendCustomerMessage, afterOrderCreated, validatePhone, createQuote, approveQuote, convertOrderToQuote }) {
  const day = (value) => String(value || '').slice(0, 10);

  const ORDER_SELECT = `
    SELECT o.id, o.numero, o.status, o.status_financeiro, o.modelo, o.valor_total, o.valor_pago,
           LEFT(o.data_entrada,10) AS entrada, LEFT(o.data_previsao,10) AS previsao, LEFT(o.data_entrega,10) AS entrega,
           c.nome AS cliente_nome, c.telefone AS cliente_telefone,
           i.nome AS instrumento, m.nome AS marca
      FROM ordens_servico o
      JOIN clientes c ON c.id = o.cliente_id AND c.user_id = o.user_id
      LEFT JOIN instrumentos i ON i.id = o.instrumento_id
      LEFT JOIN marcas m ON m.id = o.marca_id`;

  const brief = (row) => ({
    os_id: row.id,
    numero: row.numero,
    cliente: row.cliente_nome,
    equipamento: [row.instrumento, row.marca, row.modelo].filter(Boolean).join(' ') || 'não informado',
    situacao: STATUS_LABEL[row.status] || row.status,
    status: row.status,
    previsao: row.previsao || null,
    entrega: row.entrega || null,
    valor_total: Number(row.valor_total || 0),
    saldo: Number((Number(row.valor_total || 0) - Number(row.valor_pago || 0)).toFixed(2)),
  });

  async function loadOrder(userId, osId) {
    const [rows] = await pool.query(`${ORDER_SELECT} WHERE o.user_id = ? AND o.id = ? LIMIT 1`, [userId, osId]);
    return rows[0] || null;
  }

  async function listOrders(userId, filter) {
    const today = todayDate();
    const nextWeek = new Date(`${today}T12:00:00Z`);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const week = nextWeek.toISOString().slice(0, 10);
    const [rows] = await pool.query(`${ORDER_SELECT} WHERE o.user_id = ? AND o.status IN ('pendente','em_andamento','atraso') ORDER BY o.data_previsao ASC, o.numero ASC LIMIT 200`, [userId]);
    const pick = {
      hoje: (r) => r.previsao === today,
      atrasadas: (r) => r.previsao && r.previsao < today,
      bancada: (r) => r.status === 'em_andamento',
      aguardando: (r) => r.status === 'pendente',
      contratempo: (r) => r.status === 'atraso',
      semana: (r) => r.previsao >= today && r.previsao <= week,
      abertas: () => true,
    }[filter] || (() => true);
    const selected = rows.filter(pick);
    return {
      filtro: filter,
      quantidade: selected.length,
      resumo_abertas: {
        total: rows.length,
        aguardando: rows.filter((r) => r.status === 'pendente').length,
        na_bancada: rows.filter((r) => r.status === 'em_andamento').length,
        contratempo: rows.filter((r) => r.status === 'atraso').length,
        atrasadas_no_prazo: rows.filter((r) => r.previsao && r.previsao < today).length,
        previstas_hoje: rows.filter((r) => r.previsao === today).length,
      },
      ordens: selected.slice(0, 25).map(brief),
    };
  }

  async function findOrders(userId, args) {
    const scope = args.escopo || 'abertas';
    const where = ['o.user_id = ?'];
    const params = [userId];
    if (scope === 'abertas') where.push("o.status IN ('pendente','em_andamento','atraso')");
    else if (scope === 'fechadas') where.push("o.status IN ('concluido','cancelado')");
    if (args.numero) { where.push('o.numero = ?'); params.push(Number(args.numero)); }
    const [rows] = await pool.query(`${ORDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.numero DESC LIMIT 2000`, params);
    const ranked = args.numero ? rows.map((row) => ({ row, score: 1 })) : rankOrders(rows, { cliente: args.cliente, equipamento: args.equipamento });
    const top = ranked.slice(0, 8);
    return {
      escopo: scope,
      encontradas: top.length,
      // várias com pontuação parecida = ambíguo: o agente deve perguntar
      ambiguo: top.length > 1 && top[0].score - top[1].score < 0.15,
      ordens: top.map(({ row, score }) => ({ ...brief(row), confianca: Number(score.toFixed(2)) })),
    };
  }

  async function orderDetails(userId, osId) {
    const [rows] = await pool.query(
      `SELECT o.*, LEFT(o.data_entrada,10) AS entrada, LEFT(o.data_previsao,10) AS previsao, LEFT(o.data_entrega,10) AS entrega,
              c.nome AS cliente_nome, c.telefone AS cliente_telefone, i.nome AS instrumento, m.nome AS marca
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id AND c.user_id = o.user_id
         LEFT JOIN instrumentos i ON i.id = o.instrumento_id
         LEFT JOIN marcas m ON m.id = o.marca_id
        WHERE o.user_id = ? AND o.id = ? LIMIT 1`,
      [userId, osId],
    );
    const order = rows[0];
    if (!order) throw new Error('OS não encontrada');
    const [payments] = await pool.query(
      `SELECT valor, forma_pagamento, LEFT(data_pagamento,10) AS data, status FROM os_pagamentos WHERE user_id = ? AND ordem_servico_id = ? ORDER BY data_pagamento`,
      [userId, osId],
    );
    const [notes] = await pool.query(
      `SELECT numero_nfse, status, LEFT(data_emissao,10) AS emissao FROM notas_fiscais WHERE user_id = ? AND ordem_servico_id = ? AND status <> 'cancelado' ORDER BY data_emissao DESC LIMIT 3`,
      [userId, osId],
    );
    const list = (json, fallback) => {
      let parsed = json;
      if (typeof json === 'string') { try { parsed = JSON.parse(json); } catch { parsed = null; } }
      const items = Array.isArray(parsed) ? parsed.map((item) => (typeof item === 'string' ? item : item?.nome || item?.descricao)).filter(Boolean) : [];
      return items.length ? items : (fallback ? [fallback] : []);
    };
    const total = Number(order.valor_total || 0);
    const paid = Number(order.valor_pago || 0);
    return {
      os_id: order.id,
      numero: order.numero,
      situacao: STATUS_LABEL[order.status] || order.status,
      status: order.status,
      cliente: { nome: order.cliente_nome, telefone: order.cliente_telefone },
      equipamento: { instrumento: order.instrumento, marca: order.marca, modelo: order.modelo, acessorios: order.acessorios || null },
      problemas_relatados: String(order.problema_descricao || '').trim() || list(order.problemas_descricoes).join(', ') || 'não informado',
      servicos: String(order.servico_descricao || '').trim() || list(order.servicos_descricoes).join(', ') || 'não informado',
      observacoes: order.observacoes || null,
      datas: { entrada: order.entrada || null, previsao: order.previsao || null, entrega_registrada: order.entrega || null },
      financeiro: {
        valor_total: total,
        valor_pago: paid,
        saldo_a_receber: Number((total - paid).toFixed(2)),
        situacao: order.status_financeiro,
        forma_prevista: order.forma_pagamento,
        pagamentos: payments.map((p) => ({ valor: Number(p.valor), forma: p.forma_pagamento, data: p.data, status: p.status })),
      },
      notas_fiscais: notes,
    };
  }

  async function changeStatus(userId, osId, status) {
    const order = await loadOrder(userId, osId);
    if (!order) throw new Error('OS não encontrada');
    if (!OPEN_STATUSES.includes(order.status)) throw new Error(`A OS #${order.numero} está ${STATUS_LABEL[order.status]} e não pode ser alterada por aqui.`);
    if (order.status === status) return { ok: true, sem_mudanca: true, numero: order.numero, situacao: STATUS_LABEL[status] };
    const sets = ['status = ?', 'updated_at = ?'];
    const params = [status, now()];
    if (status === 'concluido') { sets.push('data_entrega = COALESCE(NULLIF(data_entrega, \'\'), ?)'); params.push(todayDate()); }
    await pool.query(`UPDATE ordens_servico SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`, [...params, userId, osId]);
    await syncReceivable(pool, userId, osId);
    const updated = await loadOrder(userId, osId);
    const result = { ok: true, numero: order.numero, cliente: order.cliente_nome, de: STATUS_LABEL[order.status], para: STATUS_LABEL[status] };
    if (status === 'concluido') {
      const saldo = Number((Number(updated.valor_total || 0) - Number(updated.valor_pago || 0)).toFixed(2));
      Object.assign(result, { saldo_a_receber: saldo, entrega_registrada: day(updated.entrega) });
    }
    return result;
  }

  async function companyConfig(userId) {
    const [[row]] = await pool.query('SELECT * FROM configuracoes_empresa WHERE user_id = ? LIMIT 1', [userId]);
    return row || {};
  }

  async function notifyCustomer(userId, osId, kind, complement) {
    const order = await orderDetails(userId, osId);
    if (!OPEN_STATUSES.includes(order.status) && !(kind === 'pronto' && order.status === 'concluido')) {
      throw new Error(`A OS #${order.numero} está ${order.situacao}; só envio avisos de OS abertas (ou aviso de "pronto" de uma OS recém-concluída).`);
    }
    const phone = order.cliente.telefone;
    if (!phone || !validatePhone(phone)) throw new Error(`O cliente ${order.cliente.nome} está sem telefone válido cadastrado.`);
    const type = NOTICE_TEMPLATE[kind];
    const [[raw]] = await pool.query('SELECT * FROM ordens_servico WHERE user_id = ? AND id = ?', [userId, osId]);
    const data = {
      ...raw,
      cliente: { nome: order.cliente.nome },
      instrumento: { nome: order.equipamento.instrumento },
      marca: { nome: order.equipamento.marca },
      valor_pendente: order.financeiro.saldo_a_receber,
    };
    let message = await renderForOrder(pool, userId, type, data, await companyConfig(userId));
    if (String(complement || '').trim()) message = `${message}\n\n${String(complement).trim()}`;
    await sendCustomerMessage(userId, phone, message, { templateType: type, orderId: osId });
    return { ok: true, enviado_para: order.cliente.nome, telefone: phone, aviso: kind, mensagem_enviada: message };
  }

  async function findClients(userId, { nome, telefone }) {
    const [rows] = await pool.query('SELECT id, nome, telefone FROM clientes WHERE user_id = ? ORDER BY nome LIMIT 3000', [userId]);
    const digits = String(telefone || '').replace(/\D/g, '');
    const matches = rows
      .map((row) => {
        const byPhone = digits.length >= 8 && String(row.telefone || '').replace(/\D/g, '').endsWith(digits.slice(-9)) ? 1 : 0;
        const byName = nome ? similarity(nome, row.nome) : 0;
        return { row, score: Math.max(byPhone, byName) };
      })
      .filter((item) => item.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { encontrados: matches.length, ambiguo: matches.length > 1 && matches[0].score - matches[1].score < 0.15, clientes: matches.map(({ row, score }) => ({ cliente_id: row.id, nome: row.nome, telefone: row.telefone, confianca: Number(score.toFixed(2)) })) };
  }

  async function resolveCatalog(conn, table, userId, name) {
    const wanted = String(name || '').trim();
    if (!wanted) return null;
    const [rows] = await conn.query(`SELECT id, nome FROM ${table} WHERE user_id = ?`, [userId]);
    const best = rows.map((row) => ({ row, score: similarity(wanted, row.nome) })).sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 0.85) return best.row.id;
    const id = uuid();
    const title = wanted.replace(/(^|\s)(\p{L})/gu, (_m, space, letter) => `${space}${letter.toUpperCase()}`);
    await conn.query(`INSERT INTO ${table} (id, user_id, nome, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [id, userId, title, now(), now()]);
    return id;
  }

  async function createOrder(userId, args) {
    const [[client]] = await pool.query('SELECT id, nome FROM clientes WHERE user_id = ? AND id = ? LIMIT 1', [userId, args.cliente_id]);
    if (!client) throw new Error('Cliente não encontrado. Use buscar_cliente primeiro.');
    if (!String(args.problemas || '').trim() && !String(args.servicos || '').trim()) throw new Error('Informe o problema relatado ou o serviço a executar.');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const instrumentoId = await resolveCatalog(conn, 'instrumentos', userId, args.instrumento);
      const marcaId = await resolveCatalog(conn, 'marcas', userId, args.marca);
      const [last] = await conn.query('SELECT numero FROM ordens_servico WHERE user_id = ? ORDER BY numero DESC LIMIT 1 FOR UPDATE', [userId]);
      const numero = Number(last[0]?.numero || 0) + 1;
      const id = uuid();
      const total = money(args.valor || 0);
      const problemas = String(args.problemas || '').trim();
      const servicos = String(args.servicos || '').trim();
      await conn.query(
        `INSERT INTO ordens_servico
         (id,user_id,numero,cliente_id,instrumento_id,marca_id,modelo,acessorios,problema_descricao,servico_descricao,
          valor_servicos,desconto,valor_total,valor_pago,status_financeiro,forma_pagamento,parcelas,observacoes,data_entrada,data_previsao,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,0,'pendente',?,1,?,?,?,'pendente',?,?)`,
        [id, userId, numero, client.id, instrumentoId, marcaId, String(args.modelo || '').trim() || null, String(args.acessorios || '').trim() || null,
          problemas || null, servicos || null, total, total, args.forma_pagamento || 'pix',
          String(args.observacoes || '').trim() || 'OS aberta pelo agente via WhatsApp', todayDate(), String(args.previsao || '').slice(0, 10) || null, now(), now()],
      );
      await syncReceivable(conn, userId, id);
      if (afterOrderCreated) await afterOrderCreated(conn, userId, { id, cliente_id: client.id, modelo: args.modelo });
      await conn.commit();
      return { ok: true, os_id: id, numero, cliente: client.nome, valor: total, previsao: String(args.previsao || '').slice(0, 10) || null };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async function listQuotes(userId, { filtro, cliente }) {
    const [rows] = await pool.query(
      `SELECT q.id, q.numero, q.status, q.valor_total, q.validade, q.equipamento, c.nome AS cliente_nome
         FROM orcamentos q JOIN clientes c ON c.id = q.cliente_id AND c.user_id = q.user_id
        WHERE q.user_id = ? ${filtro === 'todos' ? '' : "AND q.status IN ('rascunho','enviado')"} ORDER BY q.numero DESC LIMIT 300`,
      [userId],
    );
    const today = todayDate();
    const filtered = cliente ? rows.filter((row) => similarity(cliente, row.cliente_nome) >= 0.6) : rows;
    return {
      quantidade: filtered.length,
      orcamentos: filtered.slice(0, 15).map((row) => ({
        orcamento_id: row.id, numero: row.numero, cliente: row.cliente_nome, equipamento: row.equipamento, valor: Number(row.valor_total),
        validade: String(row.validade || '').slice(0, 10) || null, situacao: row.status === 'convertido' ? 'virou OS' : row.status === 'recusado' ? 'recusado'
          : String(row.validade || '').slice(0, 10) && String(row.validade).slice(0, 10) < today && ['rascunho', 'enviado'].includes(row.status) ? 'vencido' : row.status === 'enviado' ? 'enviado ao cliente' : 'rascunho',
      })),
    };
  }

  async function createQuoteFromArgs(userId, args) {
    const [[client]] = await pool.query('SELECT id, nome FROM clientes WHERE user_id = ? AND id = ? LIMIT 1', [userId, args.cliente_id]);
    if (!client) throw new Error('Cliente não encontrado. Use buscar_cliente primeiro.');
    if (!(Number(args.valor) > 0)) throw new Error('Informe o valor do orçamento.');
    const conn = await pool.getConnection();
    let instrumentoId = null;
    let marcaId = null;
    try {
      instrumentoId = await resolveCatalog(conn, 'instrumentos', userId, args.instrumento);
      marcaId = await resolveCatalog(conn, 'marcas', userId, args.marca);
    } finally {
      conn.release();
    }
    const total = money(args.valor);
    const created = await createQuote(userId, {
      validade_dias: args.validade_dias || 7,
      ordem: {
        cliente_id: client.id, instrumento_id: instrumentoId, marca_id: marcaId, modelo: String(args.modelo || '').trim() || null,
        problema_descricao: String(args.problemas || '').trim() || null, servico_descricao: String(args.servicos || '').trim() || null,
        valor_servicos: total, desconto: 0, valor_total: total, forma_pagamento: 'a_definir',
        observacoes: String(args.observacoes || '').trim() || null, data_previsao: String(args.previsao || '').slice(0, 10) || null,
      },
    });
    return { ok: true, orcamento_id: created.id, numero: created.numero, cliente: client.nome, valor: total };
  }

  async function run(name, args, ctx) {
    switch (name) {
      case 'listar_orcamentos': return listQuotes(ctx.userId, args);
      case 'transformar_os_em_orcamento': return { ok: true, ...(await convertOrderToQuote(ctx.userId, args.os_id)) };
      case 'criar_orcamento': return createQuoteFromArgs(ctx.userId, args);
      case 'aprovar_orcamento': {
        const result = await approveQuote(ctx.userId, { quoteId: args.orcamento_id, dataPrevisao: args.data_entrega, sinalValor: args.sinal_valor, sinalForma: args.sinal_forma });
        ctx.actions?.push({ type: 'orcamento_aprovado', id: args.orcamento_id });
        return { ok: true, ...result, data_entrega: String(args.data_entrega).slice(0, 10) };
      }
      case 'recusar_orcamento': {
        const [result] = await pool.query(
          "UPDATE orcamentos SET status='recusado', recusado_em=?, motivo_recusa=?, updated_at=? WHERE id=? AND user_id=? AND status IN ('rascunho','enviado')",
          [now(), String(args.motivo || '').slice(0, 500) || null, now(), args.orcamento_id, ctx.userId],
        );
        if (!result.affectedRows) throw new Error('Só dá para recusar orçamentos em aberto.');
        return { ok: true };
      }
      case 'listar_os': return listOrders(ctx.userId, args.filtro);
      case 'buscar_os': return findOrders(ctx.userId, args);
      case 'detalhes_os': return orderDetails(ctx.userId, args.os_id);
      case 'mudar_status_os': {
        const result = await changeStatus(ctx.userId, args.os_id, args.status);
        ctx.actions?.push({ type: 'os_status', id: args.os_id, status: args.status });
        return result;
      }
      case 'avisar_cliente_os': return notifyCustomer(ctx.userId, args.os_id, args.tipo, args.complemento);
      case 'cancelar_os': {
        if (!args.confirmado) return { ok: false, erro: 'Cancelamento não confirmado pelo usuário.' };
        const order = await loadOrder(ctx.userId, args.os_id);
        if (!order) throw new Error('OS não encontrada');
        if (!OPEN_STATUSES.includes(order.status)) throw new Error(`A OS #${order.numero} já está ${STATUS_LABEL[order.status]}.`);
        await pool.query("UPDATE ordens_servico SET status='cancelado', updated_at=? WHERE user_id=? AND id=?", [now(), ctx.userId, args.os_id]);
        await syncReceivable(pool, ctx.userId, args.os_id);
        return { ok: true, numero: order.numero, cliente: order.cliente_nome, situacao: 'cancelada' };
      }
      case 'buscar_cliente': return findClients(ctx.userId, args);
      case 'cadastrar_cliente': {
        const phone = String(args.telefone || '').trim();
        if (phone && !validatePhone(phone)) throw new Error('Telefone inválido (use DDD + número).');
        const existing = phone ? await findClients(ctx.userId, { telefone: phone }) : { encontrados: 0 };
        if (existing.encontrados) return { ok: false, erro: 'Já existe cliente com esse telefone', clientes: existing.clientes };
        const id = uuid();
        const nome = String(args.nome).trim().replace(/(^|\s)(\p{L})/gu, (_m, space, letter) => `${space}${letter.toUpperCase()}`);
        await pool.query('INSERT INTO clientes (id,user_id,nome,telefone,created_at,updated_at) VALUES (?,?,?,?,?,?)', [id, ctx.userId, nome, phone || null, now(), now()]);
        return { ok: true, cliente_id: id, nome };
      }
      case 'criar_os': return createOrder(ctx.userId, args);
      default: throw new Error(`Ferramenta de OS desconhecida: ${name}`);
    }
  }

  return { run };
}
