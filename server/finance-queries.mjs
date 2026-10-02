/**
 * Consultas financeiras completas para o agente de IA.
 *
 * Uma única ferramenta (`consultar_financeiro`) cobre entradas, gastos, contas a
 * pagar (abertas/atrasadas/quitadas), quem deve (a receber), OS abertas e pagas no
 * período e balanço. Os períodos são resolvidos aqui, no servidor, para o modelo
 * não errar datas; todo cálculo vem do banco, o modelo só redige a resposta.
 */

export const FINANCE_PERIODS = ['hoje', 'ontem', 'semana', 'mes', 'mes_passado', 'ano', 'tudo', 'personalizado'];

export const FINANCE_QUERIES = [
  'entradas',
  'gastos',
  'contas_pagar',
  'a_receber',
  'os_abertas_pagas',
  'balanco',
];

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (value, days) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};
const round2 = (value) => Number(Number(value || 0).toFixed(2));

/** Devolve { de, ate (inclusive), rotulo } para um período nomeado. */
export function resolvePeriod(periodo, today, de, ate) {
  const [y, m] = today.split('-').map(Number);
  const monthStart = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = (year, month) => iso(new Date(Date.UTC(year, month, 0, 12)));
  switch (periodo) {
    case 'ontem': { const d = addDays(today, -1); return { de: d, ate: d, rotulo: 'ontem' }; }
    case 'semana': return { de: addDays(today, -6), ate: today, rotulo: 'últimos 7 dias' };
    case 'mes': return { de: monthStart(y, m), ate: today, rotulo: 'este mês' };
    case 'mes_passado': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { de: monthStart(py, pm), ate: lastDay(py, pm), rotulo: 'mês passado' };
    }
    case 'ano': return { de: `${y}-01-01`, ate: today, rotulo: 'este ano' };
    case 'tudo': return { de: '0000-01-01', ate: '9999-12-31', rotulo: 'todo o período' };
    case 'personalizado': {
      const from = String(de || '').slice(0, 10);
      const to = String(ate || de || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) return { de: from, ate: to, rotulo: `${from} a ${to}` };
      return { de: today, ate: today, rotulo: 'hoje' };
    }
    default: return { de: today, ate: today, rotulo: 'hoje' };
  }
}

export const FINANCE_QUERY_TOOL = {
  type: 'function',
  name: 'consultar_financeiro',
  description:
    'Consulta números do caixa. SEMPRE use esta ferramenta (nunca estime) para perguntas de dinheiro. ' +
    'consulta: ' +
    '"entradas" = quanto ENTROU (dinheiro recebido: pagamentos de OS + entradas lançadas à mão/por voz), com lista, total por origem e por forma; também traz as OS ABERTAS no período e já pagas. Serve para "quanto entrou hoje/no mês", "quanto faturei", "quanto recebi". ' +
    '"gastos" = tudo que SAIU (despesas pagas), com lista completa e total por categoria; "quanto gastei", "liste meus gastos". ' +
    '"contas_pagar" = contas a pagar; status abertas (a pagar), atrasadas, pagas (quitadas) ou todas; filtra pelo período do VENCIMENTO (use periodo "tudo" para ver todas em aberto). ' +
    '"a_receber" = quem está devendo / quanto falta receber, agrupado por cliente e OS (não depende de período). ' +
    '"os_abertas_pagas" = OS criadas no período e o quanto já foi pago de cada (status financeiro pago/parcial/pendente). ' +
    '"balanco" = entradas, saídas, saldo do período + quanto há a receber e a pagar em aberto (lucro, "quanto sobrou", "como estou no mês").',
  parameters: {
    type: 'object',
    properties: {
      consulta: { type: 'string', enum: FINANCE_QUERIES },
      periodo: { type: 'string', enum: FINANCE_PERIODS, description: 'Padrão: hoje (mes para balanco). Use personalizado com de/ate para datas específicas.' },
      de: { type: 'string', description: 'YYYY-MM-DD (periodo personalizado)' },
      ate: { type: 'string', description: 'YYYY-MM-DD inclusive (periodo personalizado)' },
      status: { type: 'string', enum: ['abertas', 'atrasadas', 'pagas', 'todas'], description: 'Só para contas_pagar; padrão abertas' },
      cliente: { type: 'string', description: 'Filtra a_receber/os_abertas_pagas por parte do nome do cliente' },
      categoria: { type: 'string', description: 'Filtra gastos por categoria (parcial)' },
      limite: { type: 'integer', description: 'Máximo de itens nas listas (padrão 40, máx. 100)' },
    },
    required: ['consulta'],
  },
};

export function createFinanceQueries({ pool, todayDate }) {
  const clampLimit = (value) => Math.max(1, Math.min(100, Number(value) || 40));

  async function entradas(userId, period, args) {
    const [rows] = await pool.query(
      `SELECT t.id, t.descricao, t.valor, LEFT(t.data,10) AS dia, t.forma_pagamento, t.origem, t.ordem_servico_id,
              o.numero AS os_numero, cf.nome AS categoria
         FROM transacoes_financeiras t
         LEFT JOIN ordens_servico o ON o.id = t.ordem_servico_id
         LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        WHERE t.user_id = ? AND t.tipo = 'receita' AND LEFT(t.data,10) >= ? AND LEFT(t.data,10) <= ?
        ORDER BY t.data DESC`,
      [userId, period.de, period.ate],
    );
    const sum = (list) => round2(list.reduce((acc, row) => acc + Number(row.valor || 0), 0));
    const deOs = rows.filter((row) => row.ordem_servico_id);
    const avulsas = rows.filter((row) => !row.ordem_servico_id);
    const porForma = {};
    for (const row of rows) {
      const key = row.forma_pagamento || 'não informada';
      porForma[key] = round2((porForma[key] || 0) + Number(row.valor || 0));
    }
    const limit = clampLimit(args.limite);
    const mapRow = (row) => ({ descricao: row.descricao, valor: Number(row.valor), dia: row.dia, forma: row.forma_pagamento || null, os: row.os_numero || null });
    const result = {
      periodo: period,
      total_entrou_reais: sum(rows),
      lancamentos: rows.length,
      de_pagamentos_de_os: { total_reais: sum(deOs), quantidade: deOs.length },
      entradas_avulsas: { total_reais: sum(avulsas), quantidade: avulsas.length },
      por_forma_pagamento: porForma,
      lista: rows.slice(0, limit).map(mapRow),
    };
    if (rows.length > limit) result.lista_cortada = rows.length - limit;
    result.os_abertas_no_periodo = (await osAbertasPagas(userId, period, args)).os;
    return result;
  }

  async function osAbertasPagas(userId, period, args) {
    const params = [userId, period.de, period.ate];
    let filter = '';
    if (args.cliente) { filter = ' AND LOWER(c.nome) LIKE ?'; params.push(`%${String(args.cliente).toLowerCase()}%`); }
    const [rows] = await pool.query(
      `SELECT o.numero, c.nome AS cliente, o.valor_total, o.valor_pago, o.status, o.status_financeiro,
              LEFT(COALESCE(o.data_entrada, o.created_at),10) AS aberta_em
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
        WHERE o.user_id = ? AND o.status <> 'cancelado'
          AND LEFT(COALESCE(o.data_entrada, o.created_at),10) >= ? AND LEFT(COALESCE(o.data_entrada, o.created_at),10) <= ?${filter}
        ORDER BY o.numero DESC LIMIT ?`,
      [...params, clampLimit(args.limite)],
    );
    const os = rows.map((row) => ({
      os: row.numero,
      cliente: row.cliente,
      valor_total: Number(row.valor_total || 0),
      valor_pago: Number(row.valor_pago || 0),
      falta_receber: round2(Number(row.valor_total || 0) - Number(row.valor_pago || 0)),
      situacao_os: row.status,
      pagamento: row.status_financeiro || 'pendente',
      aberta_em: row.aberta_em,
    }));
    const pagas = os.filter((item) => item.pagamento === 'pago');
    return {
      periodo: period,
      os,
      resumo: {
        abertas_no_periodo: os.length,
        totalmente_pagas: pagas.length,
        valor_recebido_dessas_os_reais: round2(os.reduce((acc, item) => acc + item.valor_pago, 0)),
        ainda_falta_receber_reais: round2(os.reduce((acc, item) => acc + item.falta_receber, 0)),
      },
    };
  }

  async function gastos(userId, period, args) {
    const params = [userId, period.de, period.ate];
    let filter = '';
    if (args.categoria) { filter = ' AND LOWER(cf.nome) LIKE ?'; params.push(`%${String(args.categoria).toLowerCase()}%`); }
    const [rows] = await pool.query(
      `SELECT t.descricao, t.valor, LEFT(t.data,10) AS dia, t.forma_pagamento, COALESCE(cf.nome,'Sem categoria') AS categoria
         FROM transacoes_financeiras t
         LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
        WHERE t.user_id = ? AND t.tipo = 'despesa' AND LEFT(t.data,10) >= ? AND LEFT(t.data,10) <= ?${filter}
        ORDER BY t.data DESC`,
      params,
    );
    const porCategoria = {};
    for (const row of rows) porCategoria[row.categoria] = round2((porCategoria[row.categoria] || 0) + Number(row.valor || 0));
    const limit = clampLimit(args.limite);
    return {
      periodo: period,
      total_gasto_reais: round2(rows.reduce((acc, row) => acc + Number(row.valor || 0), 0)),
      lancamentos: rows.length,
      por_categoria: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([categoria, total]) => ({ categoria, total_reais: total })),
      lista: rows.slice(0, limit).map((row) => ({ descricao: row.descricao, valor: Number(row.valor), dia: row.dia, categoria: row.categoria, forma: row.forma_pagamento || null })),
      ...(rows.length > limit ? { lista_cortada: rows.length - limit } : {}),
    };
  }

  async function contasPagar(userId, period, args) {
    const today = todayDate();
    const status = args.status || 'abertas';
    const where = ['cp.user_id = ?'];
    const params = [userId];
    if (status === 'abertas') where.push("cp.status IN ('pendente','atrasado')");
    else if (status === 'atrasadas') { where.push("cp.status IN ('pendente','atrasado')", 'LEFT(cp.data_vencimento,10) < ?'); params.push(today); }
    else if (status === 'pagas') where.push("cp.status = 'pago'");
    else where.push("cp.status <> 'cancelado'");
    // Quitadas são filtradas pela data em que foram pagas; as demais pelo vencimento.
    const dateColumn = status === 'pagas' ? 'COALESCE(cp.data_pagamento, cp.data_vencimento)' : 'cp.data_vencimento';
    where.push(`LEFT(${dateColumn},10) >= ?`, `LEFT(${dateColumn},10) <= ?`);
    params.push(period.de, period.ate);
    const [rows] = await pool.query(
      `SELECT cp.descricao, cp.valor, cp.status, LEFT(cp.data_vencimento,10) AS vencimento, LEFT(cp.data_pagamento,10) AS pago_em,
              CASE WHEN cp.parcela_total IS NULL THEN NULL ELSE CONCAT(cp.parcela_numero,'/',cp.parcela_total) END AS parcela
         FROM contas_pagar cp WHERE ${where.join(' AND ')}
        ORDER BY cp.data_vencimento ASC`,
      params,
    );
    const limit = clampLimit(args.limite);
    const total = round2(rows.reduce((acc, row) => acc + Number(row.valor || 0), 0));
    const atrasadas = rows.filter((row) => row.status !== 'pago' && row.vencimento < today);
    return {
      periodo: period,
      status,
      quantidade: rows.length,
      total_reais: total,
      ...(status === 'abertas' || status === 'todas'
        ? { atrasadas: { quantidade: atrasadas.length, total_reais: round2(atrasadas.reduce((acc, row) => acc + Number(row.valor || 0), 0)) } }
        : {}),
      contas: rows.slice(0, limit).map((row) => ({
        descricao: row.descricao,
        valor: Number(row.valor),
        vencimento: row.vencimento,
        situacao: row.status === 'pago' ? 'paga' : row.vencimento < today ? 'atrasada' : 'em dia',
        ...(row.pago_em ? { pago_em: row.pago_em } : {}),
        ...(row.parcela ? { parcela: row.parcela } : {}),
      })),
      ...(rows.length > limit ? { lista_cortada: rows.length - limit } : {}),
    };
  }

  async function aReceber(userId, args) {
    const params = [userId];
    let filter = '';
    if (args.cliente) { filter = ' AND LOWER(c.nome) LIKE ?'; params.push(`%${String(args.cliente).toLowerCase()}%`); }
    const [rows] = await pool.query(
      `SELECT c.nome AS cliente, o.numero, o.valor_total, o.valor_pago, o.status, o.status_financeiro, LEFT(o.data_previsao,10) AS previsao
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
        WHERE o.user_id = ? AND o.status <> 'cancelado'
          AND COALESCE(o.status_financeiro,'pendente') IN ('pendente','parcial')
          AND COALESCE(o.valor_total,0) - COALESCE(o.valor_pago,0) > 0${filter}
        ORDER BY c.nome ASC, o.numero DESC`,
      params,
    );
    const porCliente = new Map();
    for (const row of rows) {
      const falta = round2(Number(row.valor_total || 0) - Number(row.valor_pago || 0));
      const entry = porCliente.get(row.cliente) || { cliente: row.cliente, deve_reais: 0, os: [] };
      entry.deve_reais = round2(entry.deve_reais + falta);
      entry.os.push({ os: row.numero, falta_reais: falta, situacao_os: row.status, previsao: row.previsao || null });
      porCliente.set(row.cliente, entry);
    }
    const clientes = [...porCliente.values()].sort((a, b) => b.deve_reais - a.deve_reais);
    return {
      total_a_receber_reais: round2(clientes.reduce((acc, item) => acc + item.deve_reais, 0)),
      clientes_devendo: clientes.length,
      clientes: clientes.slice(0, clampLimit(args.limite)),
    };
  }

  async function balanco(userId, period, args) {
    const [[entrou]] = await pool.query(
      `SELECT COALESCE(SUM(valor),0) AS total, COUNT(*) AS qtd FROM transacoes_financeiras
        WHERE user_id = ? AND tipo = 'receita' AND LEFT(data,10) >= ? AND LEFT(data,10) <= ?`,
      [userId, period.de, period.ate],
    );
    const [[saiu]] = await pool.query(
      `SELECT COALESCE(SUM(valor),0) AS total, COUNT(*) AS qtd FROM transacoes_financeiras
        WHERE user_id = ? AND tipo = 'despesa' AND LEFT(data,10) >= ? AND LEFT(data,10) <= ?`,
      [userId, period.de, period.ate],
    );
    const [[aPagar]] = await pool.query(
      `SELECT COALESCE(SUM(valor),0) AS total, COUNT(*) AS qtd,
              COALESCE(SUM(CASE WHEN LEFT(data_vencimento,10) < ? THEN valor ELSE 0 END),0) AS atrasado
         FROM contas_pagar WHERE user_id = ? AND status IN ('pendente','atrasado')`,
      [todayDate(), userId],
    );
    const receber = await aReceber(userId, { ...args, limite: 5 });
    return {
      periodo: period,
      entrou_reais: round2(entrou.total),
      saiu_reais: round2(saiu.total),
      saldo_do_periodo_reais: round2(Number(entrou.total) - Number(saiu.total)),
      lancamentos: { entradas: Number(entrou.qtd), saidas: Number(saiu.qtd) },
      em_aberto: {
        a_pagar_reais: round2(aPagar.total),
        contas_a_pagar: Number(aPagar.qtd),
        a_pagar_atrasado_reais: round2(aPagar.atrasado),
        a_receber_reais: receber.total_a_receber_reais,
        clientes_devendo: receber.clientes_devendo,
      },
    };
  }

  async function run(userId, args = {}) {
    const consulta = args.consulta;
    const defaultPeriod = consulta === 'balanco' ? 'mes' : consulta === 'contas_pagar' ? 'tudo' : 'hoje';
    const period = resolvePeriod(args.periodo || (args.de ? 'personalizado' : defaultPeriod), todayDate(), args.de, args.ate);
    switch (consulta) {
      case 'entradas': return entradas(userId, period, args);
      case 'gastos': return gastos(userId, period, args);
      case 'contas_pagar': return contasPagar(userId, period, args);
      case 'a_receber': return aReceber(userId, args);
      case 'os_abertas_pagas': return osAbertasPagas(userId, period, args);
      case 'balanco': return balanco(userId, period, args);
      default: return { erro: `Consulta desconhecida: ${consulta}` };
    }
  }

  return { run };
}
