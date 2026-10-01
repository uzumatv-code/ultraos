/**
 * Agente financeiro do UltraOS (WhatsApp).
 *
 * Responsabilidades que ficam aqui, fora do `index.mjs`:
 *  - lançamento rápido de despesas ("comprei um café 10,00") com desfazer;
 *  - consultas financeiras em linguagem natural (hoje, mês, atrasadas, semana);
 *  - baixa de contas a pagar pelo WhatsApp ("paguei a luz");
 *  - avisos proativos (resumo da manhã e lembrete da tarde);
 *  - conversa livre com contexto financeiro quando nada acima se aplica.
 *
 * Funções puras (`inferExpenseCategory`, `parseQuickExpense`, `formatBRL`...)
 * são exportadas à parte para serem testadas sem banco.
 */

const CATEGORY_RULES = [
  { nome: 'Alimentação', cor: '#F59E0B', re: /caf[eé]|almo[cç]|jant|lanch|padaria|pizza|restaurante|ifood|marmita|comida|refei[cç][aã]o|sorvete|hamb[uú]rguer|pastel|salgado|bar\b|cerveja|a[cç]a[ií]/ },
  { nome: 'Mercado', cor: '#10B981', re: /mercado|supermercado|atacad[aã]o|feira|hortifruti|a[cç]ougue/ },
  { nome: 'Transporte', cor: '#3B82F6', re: /uber|99\b|taxi|t[aá]xi|[oô]nibus|metr[oô]|passagem|estacionamento|ped[aá]gio|combust[ií]vel|gasolina|etanol|diesel|posto/ },
  { nome: 'Moradia', cor: '#8B5CF6', re: /aluguel|condom[ií]nio|luz|energia|[aá]gua|internet|g[aá]s|iptu/ },
  { nome: 'Saúde', cor: '#EF4444', re: /farm[aá]cia|rem[eé]dio|m[eé]dico|consulta|exame|dentista|plano de sa[uú]de/ },
  { nome: 'Material e peças', cor: '#06B6D4', re: /pe[cç]a|corda|cola|verniz|lixa|ferramenta|parafuso|madeira|tinta|insumo|material|solda|fio\b|cabo\b/ },
  { nome: 'Marketing', cor: '#EC4899', re: /an[uú]ncio|tr[aá]fego|instagram|google ads|panfleto|impuls/ },
  { nome: 'Impostos e taxas', cor: '#64748B', re: /imposto|das\b|mei\b|taxa|tarifa|contador|contabilidade|multa/ },
];

export const DEFAULT_EXPENSE_CATEGORY = { nome: 'Operacional', cor: '#EF4444' };

export function inferExpenseCategory(description) {
  const text = String(description || '').toLowerCase();
  const rule = CATEGORY_RULES.find((item) => item.re.test(text));
  return rule ? { nome: rule.nome, cor: rule.cor } : DEFAULT_EXPENSE_CATEGORY;
}

export function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(iso) {
  const value = String(iso || '').slice(0, 10);
  return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : '-';
}

function parseAmount(text) {
  const match = String(text || '').match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|real|conto|pila|contos))?/i);
  if (!match) return null;
  let raw = match[1];
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

const EXPENSE_VERB = /\b(comprei|gastei|paguei|pago|compra|gasto|despesa|almocei|jantei|abasteci|tomei|lanchei)\b/i;
const NOT_EXPENSE = /\b(os|ordem|cliente|conta a pagar|vencimento|vence|boleto|fatura|cadastr|abr[ae]|cancel|confirmar|quanto|quais|qual|parcel|vezes|recorrent|todo m[eê]s|mensal|\d+\s*x\b)/i;

/**
 * Reconhece lançamentos curtos: "comprei um café 10,00", "gastei 50 no mercado",
 * "uber 23,90", "almoço 35 pix". Devolve null quando a frase parece outra coisa.
 */
export function parseQuickExpense(message) {
  const raw = String(message || '').trim();
  if (!raw || raw.length > 160) return null;
  if (NOT_EXPENSE.test(raw)) return null;
  const value = parseAmount(raw);
  if (!value || value > 99999.99 || /\d{7,}/.test(raw.replace(/[.,\s]/g, ''))) return null;

  const hasVerb = EXPENSE_VERB.test(raw);
  const shortNote = raw.split(/\s+/).length <= 5;
  if (!hasVerb && !shortNote) return null;
  if (!hasVerb && !/[a-zà-ú]{3,}/i.test(raw.replace(/\d|r\$|reais|real|pix|dinheiro|cr[eé]dito|d[eé]bito/gi, ''))) return null;

  let formaPagamento = null;
  if (/\bpix\b/i.test(raw)) formaPagamento = 'pix';
  else if (/dinheiro|esp[eé]cie/i.test(raw)) formaPagamento = 'dinheiro';
  else if (/cr[eé]dito|cart[aã]o/i.test(raw)) formaPagamento = 'credito';
  else if (/d[eé]bito/i.test(raw)) formaPagamento = 'debito';

  let description = raw
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/\b(reais|real|conto|contos|pila|pix|dinheiro|cr[eé]dito|d[eé]bito|cart[aã]o|no|na|em|de|do|da|por|um|uma|uns|umas|o|a|com|via|hoje|agora)\b/gi, ' ')
    .replace(new RegExp(EXPENSE_VERB.source, 'gi'), ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!description) description = 'Despesa via WhatsApp';
  description = description.charAt(0).toUpperCase() + description.slice(1);

  return { value, description, formaPagamento, category: inferExpenseCategory(raw) };
}

function normalizeText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

export function detectAgentCommand(message) {
  const text = normalizeText(message);
  if (!text) return null;
  if (/^(desfaz|desfazer|desfaca|cancela|cancelar|apaga|apagar|errei|foi errado)( o)?( ultimo| ultima| lancamento| gasto| despesa)?$/.test(text)) return 'desfazer';
  if (/^(menu|ajuda|help|comandos|o que voce faz|como funciona)\b/.test(text) && text.split(' ').length <= 5) return 'ajuda';
  if (/(resumo|panorama|situacao).*(financ|hoje|dia|geral)|^resumo$|como estamos|como estao as contas/.test(text)) return 'resumo';
  if (/(contas?|boletos?|pagamentos?).*(atrasad|vencid|em atraso)|o que (esta|ta) atrasado|atrasadas?$/.test(text)) return 'atrasadas';
  if (/(contas?|boletos?|vencimentos?).*(semana|proximos? dias|proximas|a vencer|vao vencer)|proximas contas|o que vence/.test(text)) return 'proximas';
  if (/(quanto|total).*(gastei|gasto|gastos|despesas?).*(hoje|dia)|gastos? de hoje|gastei hoje/.test(text)) return 'gastos_hoje';
  if (/(quanto|total).*(gastei|gasto|gastos|despesas?).*(mes)|gastos? do mes|despesas? do mes|gastei no mes/.test(text)) return 'gastos_mes';
  if (/(saldo|caixa|sobrou|lucro).*(mes|hoje)?|quanto (entrou|recebi)/.test(text)) return 'saldo_mes';
  return null;
}

const AJUDA = [
  '👋 Sou o *agente financeiro* da sua oficina. Posso:',
  '',
  '💸 *Lançar gastos* — _comprei um café 10,00_ · _gastei 50 no mercado_ · _uber 23,90_ (texto ou áudio)',
  '↩️ *Desfazer* — responda _desfazer_ logo após um lançamento',
  '📅 *Contas a pagar* — _contas atrasadas_ · _o que vence essa semana_ · _contas de hoje_',
  '✅ *Dar baixa* — _paguei a conta de luz_',
  '📊 *Resumos* — _resumo_ · _quanto gastei hoje_ · _gastos do mês_ · _saldo do mês_',
  '🧾 *Ordens de serviço* — _quais OS tenho hoje?_ · _OS 125 foi paga em pix_',
  '',
  'Também aviso você todo dia sobre contas vencendo e atrasadas.',
].join('\n');

export function createFinanceAgent({ pool, uuid, now, todayDate, money, timezone, sendText, ensureCategory, openAiChat, materializeRecurrences, log = console }) {
  const ymNow = () => todayDate().slice(0, 7);
  const monthBounds = () => {
    const [y, m] = ymNow().split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { start: `${ymNow()}-01`, end: next };
  };
  const addDays = (iso, days) => {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  async function ensureSchema() {
    const columns = [
      ['proprietario', 'tinyint(1) DEFAULT 0'],
      ['receber_avisos', 'tinyint(1) DEFAULT 1'],
      ['hora_resumo', "varchar(5) DEFAULT '08:00'"],
      ['hora_lembrete', "varchar(5) DEFAULT '16:00'"],
    ];
    for (const [column, definition] of columns) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financeiro_ia_autorizados' AND COLUMN_NAME = ?`,
        [column],
      );
      if (Number(rows[0]?.total || 0) === 0) {
        await pool.query(`ALTER TABLE financeiro_ia_autorizados ADD COLUMN \`${column}\` ${definition}`);
      }
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS financeiro_ia_avisos (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      telefone varchar(30) NOT NULL,
      chave varchar(80) NOT NULL,
      enviado_em varchar(50) DEFAULT NULL,
      UNIQUE KEY unique_financeiro_ia_aviso (user_id, telefone, chave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  /* ----------------------------------------------------------- consultas */

  async function payablesBuckets(userId) {
    const today = todayDate();
    const [rows] = await pool.query(
      `SELECT id, descricao, valor, LEFT(data_vencimento,10) AS venc, status
         FROM contas_pagar
        WHERE user_id = ? AND status IN ('pendente','atrasado')
        ORDER BY data_vencimento ASC`,
      [userId],
    );
    const overdue = rows.filter((row) => row.venc < today);
    const dueToday = rows.filter((row) => row.venc === today);
    const soon = rows.filter((row) => row.venc > today && row.venc <= addDays(today, 7));
    const sum = (list) => list.reduce((acc, row) => acc + Number(row.valor || 0), 0);
    return { today, overdue, dueToday, soon, sum };
  }

  const listLines = (list, limit = 8) => {
    const lines = list.slice(0, limit).map((row) => `• ${row.descricao} — *${formatBRL(row.valor)}* (${brDate(row.venc)})`);
    if (list.length > limit) lines.push(`… e mais ${list.length - limit}`);
    return lines.join('\n');
  };

  async function spentBetween(userId, start, end) {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(valor),0) AS total, COUNT(*) AS qtd FROM transacoes_financeiras
        WHERE user_id = ? AND tipo = 'despesa' AND LEFT(data,10) >= ? AND LEFT(data,10) < ?`,
      [userId, start, end],
    );
    return { total: Number(row.total || 0), qtd: Number(row.qtd || 0) };
  }

  async function incomeBetween(userId, start, end) {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(valor),0) AS total FROM transacoes_financeiras
        WHERE user_id = ? AND tipo = 'receita' AND LEFT(data,10) >= ? AND LEFT(data,10) < ?`,
      [userId, start, end],
    );
    return Number(row.total || 0);
  }

  async function buildDigest(userId, { reminder = false } = {}) {
    const b = await payablesBuckets(userId);
    const parts = [];
    if (b.overdue.length) parts.push(`🔴 *Atrasadas (${b.overdue.length}) — ${formatBRL(b.sum(b.overdue))}*\n${listLines(b.overdue)}`);
    if (b.dueToday.length) parts.push(`🟠 *Vencem hoje (${b.dueToday.length}) — ${formatBRL(b.sum(b.dueToday))}*\n${listLines(b.dueToday)}`);
    if (!reminder && b.soon.length) parts.push(`🟡 *Próximos 7 dias (${b.soon.length}) — ${formatBRL(b.sum(b.soon))}*\n${listLines(b.soon, 6)}`);
    if (!parts.length) return null;
    const head = reminder ? '⏰ *Lembrete de contas*' : `☀️ *Bom dia! Resumo financeiro de ${brDate(b.today)}*`;
    return `${head}\n\n${parts.join('\n\n')}\n\n_Para dar baixa, responda: "paguei a conta de luz"._`;
  }

  async function summary(userId) {
    const b = await payablesBuckets(userId);
    const today = b.today;
    const { start, end } = monthBounds();
    const [spentToday, spentMonth, income] = await Promise.all([
      spentBetween(userId, today, addDays(today, 1)),
      spentBetween(userId, start, end),
      incomeBetween(userId, start, end),
    ]);
    return [
      `📊 *Resumo de ${brDate(today)}*`,
      '',
      `💸 Gastos hoje: *${formatBRL(spentToday.total)}* (${spentToday.qtd} lançamento${spentToday.qtd === 1 ? '' : 's'})`,
      `🗓️ Gastos no mês: *${formatBRL(spentMonth.total)}*`,
      `💰 Entradas no mês: *${formatBRL(income)}*`,
      `⚖️ Saldo do mês: *${formatBRL(income - spentMonth.total)}*`,
      '',
      `🔴 Atrasadas: *${b.overdue.length}* (${formatBRL(b.sum(b.overdue))})`,
      `🟠 Vencem hoje: *${b.dueToday.length}* (${formatBRL(b.sum(b.dueToday))})`,
      `🟡 Próximos 7 dias: *${b.soon.length}* (${formatBRL(b.sum(b.soon))})`,
    ].join('\n');
  }

  /* ------------------------------------------------------- lançamentos */

  async function registerExpense(userId, { description, value, formaPagamento, category }) {
    const cat = category || inferExpenseCategory(description);
    const categoriaId = await ensureCategory(userId, 'despesa', cat.nome, cat.cor);
    const id = uuid();
    await pool.query(
      `INSERT INTO transacoes_financeiras
       (id, user_id, descricao, valor, tipo, data, categoria_id, forma_pagamento, origem, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'despesa', ?, ?, ?, 'whatsapp_ia', ?, ?)`,
      [id, userId, description, money(value), now(), categoriaId, formaPagamento || null, now(), now()],
    );
    return { id, category: cat };
  }

  async function registerIncome(userId, { description, value, formaPagamento }) {
    const categoriaId = await ensureCategory(userId, 'receita', 'Outras receitas', '#10B981');
    const id = uuid();
    await pool.query(
      `INSERT INTO transacoes_financeiras
       (id, user_id, descricao, valor, tipo, data, categoria_id, forma_pagamento, origem, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'receita', ?, ?, ?, 'whatsapp_ia', ?, ?)`,
      [id, userId, description, money(value), now(), categoriaId, formaPagamento || null, now(), now()],
    );
    return { id, description, value: money(value) };
  }

  async function undoLast(userId, phone) {
    const [rows] = await pool.query(
      `SELECT id, entidades FROM financeiro_ia_logs
        WHERE user_id = ? AND telefone = ? AND status = 'lancamento_rapido'
        ORDER BY created_at DESC LIMIT 1`,
      [userId, phone],
    );
    const last = rows[0];
    if (!last) return 'Não encontrei nenhum lançamento recente para desfazer.';
    const entities = typeof last.entidades === 'string' ? JSON.parse(last.entidades || '{}') : last.entidades || {};
    if (!entities.transacao_id) return 'Esse lançamento não pode ser desfeito automaticamente.';
    const [result] = await pool.query('DELETE FROM transacoes_financeiras WHERE user_id = ? AND id = ?', [userId, entities.transacao_id]);
    await pool.query("UPDATE financeiro_ia_logs SET status = 'desfeito', updated_at = ? WHERE id = ?", [now(), last.id]);
    if (!result.affectedRows) return 'Esse lançamento já havia sido removido.';
    return `↩️ Desfeito: *${entities.description}* (${formatBRL(entities.value)}) foi removido.`;
  }

  async function payByDescription(userId, message) {
    const text = normalizeText(message);
    if (!/\b(paguei|pago|quitei|quitado|dar baixa|baixa)\b/.test(text) || !/\b(conta|boleto|fatura|parcela|mensalidade|aluguel|luz|energia|agua|internet|telefone|gas|iptu|condominio)\b/.test(text)) return null;
    const stop = new Set(['paguei', 'pago', 'quitei', 'quitado', 'dar', 'baixa', 'a', 'o', 'de', 'da', 'do', 'conta', 'boleto', 'fatura', 'parcela', 'mensalidade', 'hoje', 'ja', 'na', 'no', 'pix', 'dinheiro', 'em']);
    const words = text.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stop.has(word) && !/^\d+$/.test(word));
    const [rows] = await pool.query(
      `SELECT id, descricao, valor, LEFT(data_vencimento,10) AS venc FROM contas_pagar
        WHERE user_id = ? AND status IN ('pendente','atrasado') ORDER BY data_vencimento ASC`,
      [userId],
    );
    const scored = rows
      .map((row) => {
        const hay = normalizeText(row.descricao);
        const score = words.filter((word) => hay.includes(word)).length;
        return { row, score };
      })
      .filter((item) => item.score > 0 || !words.length)
      .sort((a, b) => b.score - a.score || a.row.venc.localeCompare(b.row.venc));
    if (!scored.length) return { reply: 'Não achei uma conta pendente com esse nome. Responda _contas atrasadas_ ou _o que vence_ para ver a lista.' };
    const top = scored[0].score;
    const tied = scored.filter((item) => item.score === top);
    if (tied.length > 1 && top === 0) return { reply: 'Qual conta você pagou? Me diga o nome:\n' + listLines(tied.map((i) => i.row), 6) };
    return { account: tied[0].row, ambiguous: tied.length > 1 ? tied.slice(0, 4).map((i) => i.row) : null };
  }

  /* -------------------------------------------------- mensagem recebida */

  /**
   * Tenta resolver a mensagem sem passar pelo fluxo de intenções.
   * Retorna { reply, status, extra } ou null para seguir o fluxo normal.
   */
  async function handleMessage({ authorized, phone, message, payAccountPayable, canWrite }) {
    const userId = authorized.user_id;
    const command = detectAgentCommand(message);

    if (command === 'ajuda') return { reply: AJUDA, status: 'respondido', intent: 'ajuda' };
    if (command === 'desfazer') {
      if (!canWrite) return { reply: 'Seu número só tem permissão de consulta.', status: 'negado', intent: 'desfazer' };
      return { reply: await undoLast(userId, phone), status: 'respondido', intent: 'desfazer' };
    }
    if (command === 'resumo') return { reply: await summary(userId), status: 'respondido', intent: 'resumo' };
    if (command === 'atrasadas') {
      const b = await payablesBuckets(userId);
      return {
        reply: b.overdue.length
          ? `🔴 *${b.overdue.length} conta${b.overdue.length === 1 ? '' : 's'} em atraso — ${formatBRL(b.sum(b.overdue))}*\n${listLines(b.overdue, 12)}`
          : '✅ Nenhuma conta em atraso. Tudo em dia!',
        status: 'respondido', intent: 'contas_atrasadas',
      };
    }
    if (command === 'proximas') {
      const b = await payablesBuckets(userId);
      const list = [...b.dueToday, ...b.soon];
      return {
        reply: list.length
          ? `🗓️ *Próximos 7 dias — ${formatBRL(b.sum(list))}*\n${listLines(list, 12)}`
          : '✅ Nada vence nos próximos 7 dias.',
        status: 'respondido', intent: 'proximas_contas',
      };
    }
    if (command === 'gastos_hoje') {
      const today = todayDate();
      const spent = await spentBetween(userId, today, addDays(today, 1));
      return { reply: `💸 Hoje você gastou *${formatBRL(spent.total)}* em ${spent.qtd} lançamento${spent.qtd === 1 ? '' : 's'}.`, status: 'respondido', intent: 'gastos_hoje' };
    }
    if (command === 'gastos_mes') {
      const { start, end } = monthBounds();
      const spent = await spentBetween(userId, start, end);
      return { reply: `🗓️ No mês você gastou *${formatBRL(spent.total)}* em ${spent.qtd} lançamento${spent.qtd === 1 ? '' : 's'}.`, status: 'respondido', intent: 'gastos_mes' };
    }
    if (command === 'saldo_mes') {
      const { start, end } = monthBounds();
      const [spent, income] = await Promise.all([spentBetween(userId, start, end), incomeBetween(userId, start, end)]);
      return { reply: `⚖️ Saldo do mês (caixa): *${formatBRL(income - spent.total)}*\nEntradas ${formatBRL(income)} · Saídas ${formatBRL(spent.total)}`, status: 'respondido', intent: 'saldo_mes' };
    }

    const payment = await payByDescription(userId, message);
    if (payment) {
      if (payment.reply) return { reply: payment.reply, status: 'respondido', intent: 'pagar_conta' };
      if (!canWrite) return { reply: 'Seu número só tem permissão de consulta.', status: 'negado', intent: 'pagar_conta' };
      const { account } = payment;
      await payAccountPayable({ userId, contaId: account.id, origem: 'whatsapp_ia' });
      return {
        reply: `✅ Baixa feita: *${account.descricao}* — ${formatBRL(account.valor)} (venc. ${brDate(account.venc)}). A despesa já entrou no caixa.`,
        status: 'executado', intent: 'pagar_conta', entities: { conta_id: account.id },
      };
    }

    const expense = parseQuickExpense(message);
    if (expense) {
      if (!canWrite) return { reply: 'Seu número só tem permissão de consulta, então não posso lançar gastos.', status: 'negado', intent: 'registrar_despesa' };
      return quickExpenseResult(userId, expense);
    }
    return null;
  }

  async function quickExpenseResult(userId, expense) {
    const saved = await registerExpense(userId, { description: expense.description, value: expense.value, formaPagamento: expense.formaPagamento, category: expense.category });
    const today = todayDate();
    const spent = await spentBetween(userId, today, addDays(today, 1));
    return {
      reply: [
        `✅ *${expense.description}* — ${formatBRL(expense.value)} lançado`,
        `🏷️ ${saved.category.nome}${expense.formaPagamento ? ` · ${expense.formaPagamento}` : ''}`,
        `💸 Hoje: ${formatBRL(spent.total)}`,
        '_Errou? Responda *desfazer*._',
      ].join('\n'),
      status: 'lancamento_rapido',
      intent: 'registrar_despesa',
      entities: { transacao_id: saved.id, description: expense.description, value: expense.value },
    };
  }

  async function chatFallback(userId, message) {
    if (!openAiChat) return null;
    const [text] = await Promise.all([summary(userId).catch(() => '')]);
    const system =
      'Você é o agente financeiro de uma oficina/luthieria no WhatsApp. Responda em português do Brasil, curto (máx. 6 linhas), ' +
      'cordial e direto, com no máximo 2 emojis. Nunca afirme que lançou, pagou ou alterou algo: você só conversa e explica. ' +
      'Se a pessoa quiser lançar um gasto, ensine o formato "comprei um café 10,00". ' +
      `Situação atual do caixa (pode citar se for útil):\n${text}`;
    try {
      return await openAiChat(system, message);
    } catch (error) {
      log.warn?.('[agente-financeiro] conversa livre indisponível:', error.message);
      return null;
    }
  }

  /* ------------------------------------------------------ avisos proativos */

  function localClock() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return `${get('hour')}:${get('minute')}`;
  }

  async function claim(userId, phone, key) {
    const [result] = await pool.query(
      'INSERT IGNORE INTO financeiro_ia_avisos (id, user_id, telefone, chave, enviado_em) VALUES (?, ?, ?, ?, ?)',
      [uuid(), userId, phone, key, now()],
    );
    return result.affectedRows > 0;
  }

  async function release(userId, phone, key) {
    await pool.query('DELETE FROM financeiro_ia_avisos WHERE user_id = ? AND telefone = ? AND chave = ?', [userId, phone, key]);
  }

  async function runProactive() {
    const clock = localClock();
    const today = todayDate();
    const [people] = await pool.query(
      `SELECT * FROM financeiro_ia_autorizados WHERE ativo = 1 AND COALESCE(receber_avisos, 1) = 1`,
    );
    for (const person of people) {
      const slots = [
        { key: `resumo:${today}`, at: person.hora_resumo || '08:00', reminder: false },
        { key: `lembrete:${today}`, at: person.hora_lembrete || '16:00', reminder: true },
      ];
      for (const slot of slots) {
        if (clock < slot.at) continue;
        // Evita enviar o aviso da manhã à noite caso o servidor tenha ficado fora do ar.
        if (clock > addMinutes(slot.at, 180)) continue;
        if (!(await claim(person.user_id, person.telefone, slot.key))) continue;
        try {
          if (materializeRecurrences) await materializeRecurrences(person.user_id, today, addDays(today, 40)).catch(() => {});
          const text = await buildDigest(person.user_id, { reminder: slot.reminder });
          if (!text) continue;
          await sendText(person.user_id, person.telefone, text);
        } catch (error) {
          await release(person.user_id, person.telefone, slot.key).catch(() => {});
          log.error?.('[agente-financeiro] falha no aviso proativo:', error.message);
        }
      }
    }
  }

  function addMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  let timer = null;
  function startProactiveJob() {
    if (timer || process.env.FINANCE_AGENT_JOB === 'false') return;
    const tick = () => runProactive().catch((error) => log.error?.('[agente-financeiro] job:', error.message));
    setTimeout(tick, 20_000);
    timer = setInterval(tick, 5 * 60 * 1000);
    log.log?.('[agente-financeiro] avisos proativos ativos (a cada 5 min).');
  }

  return { ensureSchema, handleMessage, quickExpenseResult, chatFallback, buildDigest, summary, startProactiveJob, runProactive, registerExpense, registerIncome, undoLast, AJUDA };
}
