/**
 * Atualização em tempo real (Server-Sent Events).
 *
 * Cada tela aberta mantém uma conexão em /api/eventos. Sempre que uma escrita relevante chega
 * ao banco — por qualquer caminho: telas, WhatsApp, agente de IA, jobs — o servidor avisa só
 * "o assunto X mudou" (sem dados), e a tela busca de novo o que precisa já com as suas permissões.
 *
 * A detecção fica na camada do banco (pool.query/commit), então novas rotas e ferramentas passam
 * a notificar automaticamente, sem precisar lembrar de chamar nada.
 */

/** tabela → assuntos que ela afeta */
export const TABLE_TOPICS = {
  transacoes_financeiras: ['financeiro'],
  contas_pagar: ['financeiro'],
  contas_pagar_recorrencias: ['financeiro'],
  contas_receber: ['financeiro'],
  os_pagamentos: ['financeiro', 'ordens'],
  os_condicoes_pagamento: ['financeiro', 'ordens'],
  categorias_financeiras: ['financeiro'],
  comprovantes_financeiros: ['financeiro'],
  anexos_financeiros: ['financeiro'],
  ordens_servico: ['ordens', 'financeiro'],
  os_ocorrencias: ['ordens'],
  os_aditivos: ['ordens'],
  orcamentos: ['ordens'],
  notas_fiscais: ['ordens', 'fiscal'],
  whatsapp_conversas: ['conversas'],
  whatsapp_mensagens: ['conversas'],
  whatsapp_anexos: ['conversas'],
};

const WRITE = /^\s*(?:INSERT(?:\s+IGNORE)?\s+INTO|UPDATE(?:\s+IGNORE)?|DELETE\s+FROM|REPLACE\s+INTO)\s+`?([a-zA-Z0-9_]+)`?/i;

export function tableOfWrite(sql) {
  return WRITE.exec(String(sql || ''))?.[1]?.toLowerCase() ?? null;
}

export function createRealtimeHub({ debounceMs = 250 } = {}) {
  const clients = new Map(); // accountId -> Set<res>
  const pending = new Map(); // accountId -> { topics:Set, timer }

  function flush(accountId) {
    const entry = pending.get(accountId);
    pending.delete(accountId);
    if (!entry) return;
    const payload = `event: change\ndata: ${JSON.stringify({ topics: [...entry.topics], at: Date.now() })}\n\n`;
    for (const res of clients.get(accountId) || []) {
      try { res.write(payload); } catch { /* conexão caiu: o 'close' faz a limpeza */ }
    }
  }

  function publish(accountId, topics) {
    if (!clients.get(accountId)?.size) return;
    let entry = pending.get(accountId);
    if (!entry) {
      entry = { topics: new Set(), timer: setTimeout(() => flush(accountId), debounceMs) };
      entry.timer.unref?.();
      pending.set(accountId, entry);
    }
    topics.forEach((topic) => entry.topics.add(topic));
  }

  return {
    connectedAccounts: () => new Set([...clients.entries()].filter(([, set]) => set.size).map(([id]) => id)),
    count: () => [...clients.values()].reduce((sum, set) => sum + set.size, 0),
    publish,
    subscribe(accountId, res) {
      if (!clients.has(accountId)) clients.set(accountId, new Set());
      clients.get(accountId).add(res);
      return () => {
        clients.get(accountId)?.delete(res);
        if (!clients.get(accountId)?.size) clients.delete(accountId);
      };
    },
  };
}

/**
 * Observa as escritas do pool e do que sair de getConnection(). Dentro de transação o aviso só
 * sai no commit (antes disso a tela ainda não enxergaria a mudança).
 */
export function instrumentDatabase(pool, hub) {
  function notify(sql, params) {
    const table = tableOfWrite(sql);
    const topics = table ? TABLE_TOPICS[table] : null;
    if (!topics) return;
    const connected = hub.connectedAccounts();
    if (!connected.size) return;
    const values = (Array.isArray(params) ? params.flat() : []).filter((value) => typeof value === 'string');
    const owners = values.filter((value) => connected.has(value));
    // Sem o dono nos parâmetros avisa quem estiver conectado: o aviso não carrega dados.
    for (const accountId of owners.length ? new Set(owners) : connected) hub.publish(accountId, topics);
  }

  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql, params) => {
    const result = await originalQuery(sql, params);
    if (typeof sql === 'string') notify(sql, params);
    return result;
  };

  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async () => {
    const connection = await originalGetConnection();
    if (!connection.__realtime) {
      connection.__realtime = true;
      const query = connection.query.bind(connection);
      const begin = connection.beginTransaction.bind(connection);
      const commit = connection.commit.bind(connection);
      const rollback = connection.rollback.bind(connection);
      connection.query = async (sql, params) => {
        const result = await query(sql, params);
        if (typeof sql === 'string') {
          if (connection.__transaction) connection.__writes.push([sql, params]);
          else notify(sql, params);
        }
        return result;
      };
      connection.beginTransaction = async () => { await begin(); connection.__transaction = true; connection.__writes = []; };
      connection.commit = async () => {
        await commit();
        const writes = connection.__writes || [];
        connection.__transaction = false;
        connection.__writes = [];
        writes.forEach(([sql, params]) => notify(sql, params));
      };
      connection.rollback = async () => { await rollback(); connection.__transaction = false; connection.__writes = []; };
      connection.__writes = [];
    }
    return connection;
  };
  return pool;
}
