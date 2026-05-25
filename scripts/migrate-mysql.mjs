import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (!DATABASE_URL) {
  throw new Error('Configure DATABASE_URL ou MYSQL_URL antes de executar a migracao.');
}

const ddl = [
  `CREATE TABLE IF NOT EXISTS categorias_financeiras (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    tipo varchar(20) NOT NULL,
    cor varchar(20) DEFAULT '#3B82F6',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_categorias_user (user_id),
    INDEX idx_categorias_tipo (tipo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS instrumentos (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_instrumentos_user (user_id),
    INDEX idx_instrumentos_nome (nome)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS contas_pagar (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    descricao varchar(255) NOT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    data_vencimento varchar(50) NOT NULL,
    data_pagamento varchar(50) DEFAULT NULL,
    status varchar(50) DEFAULT 'pendente',
    categoria_id varchar(36) DEFAULT NULL,
    recorrente tinyint(1) DEFAULT 0,
    periodicidade varchar(50) DEFAULT 'unica',
    observacoes text,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_contas_user (user_id),
    INDEX idx_contas_status (status),
    INDEX idx_contas_vencimento (data_vencimento),
    INDEX idx_contas_categoria (categoria_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS transacoes_financeiras (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    descricao varchar(255) NOT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    tipo varchar(20) NOT NULL,
    data varchar(50) NOT NULL,
    categoria_id varchar(36) DEFAULT NULL,
    conta_pagar_id varchar(36) DEFAULT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_transacoes_user (user_id),
    INDEX idx_transacoes_tipo (tipo),
    INDEX idx_transacoes_data (data),
    INDEX idx_transacoes_categoria (categoria_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS configuracoes_whatsapp (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    method varchar(30) DEFAULT 'direct',
    webhook_url varchar(500) DEFAULT NULL,
    api_key varchar(255) DEFAULT NULL,
    instance_name varchar(100) DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_config_whatsapp_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS system_settings (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    logo_url varchar(500) DEFAULT NULL,
    site_title varchar(255) DEFAULT 'Sistema OS',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_system_settings_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS agenda_logs (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    data_anterior varchar(50) NOT NULL,
    data_nova varchar(50) NOT NULL,
    profissional_anterior varchar(100) DEFAULT NULL,
    profissional_novo varchar(100) DEFAULT NULL,
    acao varchar(50) DEFAULT 'reagendamento',
    created_at varchar(50) DEFAULT NULL,
    INDEX idx_agenda_logs_user (user_id),
    INDEX idx_agenda_logs_ordem (ordem_servico_id),
    INDEX idx_agenda_logs_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS avaliacoes_lembretes (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    cliente_id varchar(36) NOT NULL,
    telefone varchar(30) DEFAULT NULL,
    mensagem text DEFAULT NULL,
    data_envio varchar(50) DEFAULT NULL,
    status varchar(50) DEFAULT 'pendente',
    avaliacao int DEFAULT NULL,
    comentario text DEFAULT NULL,
    mensagem_erro text DEFAULT NULL,
    tentativas int DEFAULT 0,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_avaliacao_ordem_user (user_id, ordem_servico_id),
    INDEX idx_avaliacoes_user (user_id),
    INDEX idx_avaliacoes_ordem (ordem_servico_id),
    INDEX idx_avaliacoes_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS contas_receber (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    cliente_id varchar(36) DEFAULT NULL,
    descricao varchar(255) NOT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    valor_recebido decimal(10,2) DEFAULT 0.00,
    data_vencimento varchar(50) DEFAULT NULL,
    data_recebimento varchar(50) DEFAULT NULL,
    status varchar(50) DEFAULT 'pendente',
    categoria_id varchar(36) DEFAULT NULL,
    forma_pagamento varchar(50) DEFAULT NULL,
    parcelas int DEFAULT 1,
    parcela_atual int DEFAULT 1,
    observacoes text DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_conta_receber_ordem_user (user_id, ordem_servico_id),
    INDEX idx_contas_receber_user (user_id),
    INDEX idx_contas_receber_status (status),
    INDEX idx_contas_receber_vencimento (data_vencimento),
    INDEX idx_contas_receber_cliente (cliente_id),
    INDEX idx_contas_receber_ordem (ordem_servico_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS os_pagamentos (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    ordem_servico_id varchar(36) NOT NULL,
    cliente_id varchar(36) DEFAULT NULL,
    transacao_financeira_id varchar(36) DEFAULT NULL,
    valor decimal(10,2) NOT NULL DEFAULT 0.00,
    forma_pagamento varchar(50) DEFAULT NULL,
    data_pagamento varchar(50) NOT NULL,
    observacoes text DEFAULT NULL,
    origem varchar(50) DEFAULT 'manual',
    status varchar(50) DEFAULT 'confirmado',
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_os_pagamentos_user (user_id),
    INDEX idx_os_pagamentos_ordem (ordem_servico_id),
    INDEX idx_os_pagamentos_cliente (cliente_id),
    INDEX idx_os_pagamentos_data (data_pagamento)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS anexos_financeiros (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    transacao_financeira_id varchar(36) DEFAULT NULL,
    conta_pagar_id varchar(36) DEFAULT NULL,
    conta_receber_id varchar(36) DEFAULT NULL,
    ordem_servico_id varchar(36) DEFAULT NULL,
    nome_arquivo varchar(255) NOT NULL,
    caminho varchar(500) NOT NULL,
    tipo_mime varchar(100) DEFAULT NULL,
    tamanho_bytes int DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    INDEX idx_anexos_financeiros_user (user_id),
    INDEX idx_anexos_financeiros_transacao (transacao_financeira_id),
    INDEX idx_anexos_financeiros_conta_pagar (conta_pagar_id),
    INDEX idx_anexos_financeiros_conta_receber (conta_receber_id),
    INDEX idx_anexos_financeiros_ordem (ordem_servico_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS financeiro_ia_autorizados (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    nome varchar(255) NOT NULL,
    telefone varchar(30) NOT NULL,
    permissao varchar(50) DEFAULT 'consulta',
    nivel_acesso varchar(50) DEFAULT 'operador',
    ativo tinyint(1) DEFAULT 1,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    UNIQUE KEY unique_financeiro_ia_phone_user (user_id, telefone),
    INDEX idx_financeiro_ia_aut_user (user_id),
    INDEX idx_financeiro_ia_aut_telefone (telefone),
    INDEX idx_financeiro_ia_aut_ativo (ativo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS financeiro_ia_logs (
    id varchar(36) NOT NULL PRIMARY KEY,
    user_id varchar(36) NOT NULL,
    autorizado_id varchar(36) DEFAULT NULL,
    telefone varchar(30) NOT NULL,
    mensagem text DEFAULT NULL,
    tipo_mensagem varchar(50) DEFAULT 'texto',
    intencao varchar(100) DEFAULT NULL,
    entidades json DEFAULT NULL,
    status varchar(50) DEFAULT 'recebido',
    resposta text DEFAULT NULL,
    confirmacao_token varchar(100) DEFAULT NULL,
    confirmado_em varchar(50) DEFAULT NULL,
    erro text DEFAULT NULL,
    created_at varchar(50) DEFAULT NULL,
    updated_at varchar(50) DEFAULT NULL,
    INDEX idx_financeiro_ia_logs_user (user_id),
    INDEX idx_financeiro_ia_logs_telefone (telefone),
    INDEX idx_financeiro_ia_logs_status (status),
    INDEX idx_financeiro_ia_logs_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const alters = [
  ['ordens_servico', 'instrumento_id', "ALTER TABLE ordens_servico ADD COLUMN instrumento_id varchar(36) DEFAULT NULL AFTER cliente_id"],
  ['ordens_servico', 'problema_descricao', "ALTER TABLE ordens_servico ADD COLUMN problema_descricao text AFTER problemas_descricoes"],
  ['ordens_servico', 'servico_descricao', "ALTER TABLE ordens_servico ADD COLUMN servico_descricao text AFTER servicos_descricoes"],
  ['ordens_servico', 'status_financeiro', "ALTER TABLE ordens_servico ADD COLUMN status_financeiro varchar(50) DEFAULT 'pendente' AFTER valor_pago"],
  ['ordens_servico', 'data_ultimo_pagamento', "ALTER TABLE ordens_servico ADD COLUMN data_ultimo_pagamento varchar(50) DEFAULT NULL AFTER status_financeiro"],
  ['ordens_servico', 'observacoes_financeiras', "ALTER TABLE ordens_servico ADD COLUMN observacoes_financeiras text DEFAULT NULL AFTER data_ultimo_pagamento"],
  ['ordens_servico', 'parcelas', "ALTER TABLE ordens_servico ADD COLUMN parcelas int DEFAULT 1 AFTER forma_pagamento"],
  ['clientes', 'avaliou', "ALTER TABLE clientes ADD COLUMN avaliou tinyint(1) DEFAULT 0"],
  ['contas_pagar', 'forma_pagamento', "ALTER TABLE contas_pagar ADD COLUMN forma_pagamento varchar(50) DEFAULT NULL AFTER data_pagamento"],
  ['contas_pagar', 'parcelas', "ALTER TABLE contas_pagar ADD COLUMN parcelas int DEFAULT 1 AFTER forma_pagamento"],
  ['contas_pagar', 'comprovante_url', "ALTER TABLE contas_pagar ADD COLUMN comprovante_url varchar(500) DEFAULT NULL AFTER observacoes"],
  ['transacoes_financeiras', 'forma_pagamento', "ALTER TABLE transacoes_financeiras ADD COLUMN forma_pagamento varchar(50) DEFAULT NULL AFTER ordem_servico_id"],
  ['transacoes_financeiras', 'comprovante_url', "ALTER TABLE transacoes_financeiras ADD COLUMN comprovante_url varchar(500) DEFAULT NULL AFTER forma_pagamento"],
  ['transacoes_financeiras', 'origem', "ALTER TABLE transacoes_financeiras ADD COLUMN origem varchar(50) DEFAULT 'manual' AFTER comprovante_url"],
  ['configuracoes_empresa', 'avaliacoes_enabled', "ALTER TABLE configuracoes_empresa ADD COLUMN avaliacoes_enabled tinyint(1) DEFAULT 1 AFTER instagram_handle"],
  ['configuracoes_empresa', 'avaliacoes_days_after_completion', "ALTER TABLE configuracoes_empresa ADD COLUMN avaliacoes_days_after_completion int DEFAULT 7 AFTER avaliacoes_enabled"],
  ['configuracoes_empresa', 'avaliacoes_trigger_hour', "ALTER TABLE configuracoes_empresa ADD COLUMN avaliacoes_trigger_hour int DEFAULT 11 AFTER avaliacoes_days_after_completion"],
  ['configuracoes_empresa', 'avaliacoes_daily_limit', "ALTER TABLE configuracoes_empresa ADD COLUMN avaliacoes_daily_limit int DEFAULT 20 AFTER avaliacoes_trigger_hour"],
  ['configuracoes_empresa', 'avaliacoes_min_interval_seconds', "ALTER TABLE configuracoes_empresa ADD COLUMN avaliacoes_min_interval_seconds int DEFAULT 20 AFTER avaliacoes_daily_limit"],
  ['configuracoes_empresa', 'avaliacoes_last_processed_date', "ALTER TABLE configuracoes_empresa ADD COLUMN avaliacoes_last_processed_date varchar(10) DEFAULT NULL AFTER avaliacoes_min_interval_seconds"],
  ['avaliacoes_lembretes', 'telefone', "ALTER TABLE avaliacoes_lembretes ADD COLUMN telefone varchar(30) DEFAULT NULL AFTER cliente_id"],
  ['avaliacoes_lembretes', 'mensagem', "ALTER TABLE avaliacoes_lembretes ADD COLUMN mensagem text DEFAULT NULL AFTER telefone"],
  ['avaliacoes_lembretes', 'mensagem_erro', "ALTER TABLE avaliacoes_lembretes ADD COLUMN mensagem_erro text DEFAULT NULL AFTER comentario"],
  ['avaliacoes_lembretes', 'tentativas', "ALTER TABLE avaliacoes_lembretes ADD COLUMN tentativas int DEFAULT 0 AFTER mensagem_erro"],
  ['templates_mensagem', 'template_type', "ALTER TABLE templates_mensagem ADD COLUMN template_type varchar(50) GENERATED ALWAYS AS (tipo) VIRTUAL"],
  ['templates_mensagem', 'is_active', "ALTER TABLE templates_mensagem ADD COLUMN is_active tinyint(1) GENERATED ALWAYS AS (ativo) VIRTUAL"],
];

const modifications = [
  "ALTER TABLE ordens_servico MODIFY COLUMN data_entrada varchar(50) DEFAULT NULL",
  "ALTER TABLE ordens_servico MODIFY COLUMN data_previsao varchar(50) DEFAULT NULL",
  "ALTER TABLE ordens_servico MODIFY COLUMN data_entrega varchar(50) DEFAULT NULL",
  "ALTER TABLE avaliacoes_lembretes MODIFY COLUMN status varchar(50) DEFAULT 'pendente'",
  "ALTER TABLE avaliacoes_lembretes MODIFY COLUMN data_envio varchar(50) DEFAULT NULL",
];

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0].total) > 0;
}

async function hasIndex(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0].total) > 0;
}

const conn = await mysql.createConnection(DATABASE_URL);

try {
  for (const sql of ddl) {
    await conn.query(sql);
  }

  for (const [table, column, sql] of alters) {
    if (!(await hasColumn(conn, table, column))) {
      try {
        await conn.query(sql);
      } catch (error) {
        console.warn(`Aviso: nao foi possivel aplicar alter ${table}.${column}: ${error.message}`);
      }
    }
  }

  for (const sql of modifications) {
    try {
      await conn.query(sql);
    } catch (error) {
      console.warn(`Aviso: nao foi possivel aplicar modificacao: ${error.message}`);
    }
  }

  if (!(await hasIndex(conn, 'avaliacoes_lembretes', 'unique_avaliacao_ordem_user'))) {
    try {
      await conn.query('ALTER TABLE avaliacoes_lembretes ADD UNIQUE KEY unique_avaliacao_ordem_user (user_id, ordem_servico_id)');
    } catch (error) {
      console.warn(`Aviso: nao foi possivel criar indice unico de avaliacoes: ${error.message}`);
    }
  }

  try {
    const [result] = await conn.query(`
      INSERT INTO avaliacoes_lembretes
        (id, user_id, ordem_servico_id, cliente_id, telefone, data_envio, status, comentario, tentativas, created_at, updated_at)
      SELECT
        UUID(),
        o.user_id,
        o.id,
        o.cliente_id,
        c.telefone,
        COALESCE(NULLIF(o.data_entrega, ''), NULLIF(o.data_previsao, ''), o.updated_at, o.created_at),
        'enviado',
        'Historico migrado de solicita_avaliacao/clientes.avaliou',
        1,
        COALESCE(o.updated_at, o.created_at),
        NOW()
      FROM ordens_servico o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN avaliacoes_lembretes al
        ON al.user_id = o.user_id
       AND al.ordem_servico_id = o.id
      WHERE al.id IS NULL
        AND o.status = 'concluido'
        AND (COALESCE(o.solicita_avaliacao, 0) = 1 OR COALESCE(c.avaliou, 0) = 1)
        AND COALESCE(NULLIF(c.telefone, ''), '') <> ''
    `);
    if (Number(result.affectedRows || 0) > 0) {
      console.log(`Backfill de avaliacoes_lembretes: ${result.affectedRows} registro(s) criado(s).`);
    }
  } catch (error) {
    console.warn(`Aviso: nao foi possivel executar backfill de avaliacoes: ${error.message}`);
  }

  try {
    const [result] = await conn.query(`
      INSERT INTO contas_receber
        (id, user_id, ordem_servico_id, cliente_id, descricao, valor, valor_recebido, data_vencimento,
         data_recebimento, status, forma_pagamento, parcelas, observacoes, created_at, updated_at)
      SELECT
        UUID(),
        o.user_id,
        o.id,
        o.cliente_id,
        CONCAT('OS #', o.numero, ' - ', COALESCE(c.nome, 'Cliente')),
        COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0),
        COALESCE(o.valor_pago, 0),
        COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, ''), o.created_at),
        CASE WHEN COALESCE(o.valor_pago, 0) >= COALESCE(o.valor_total, 0) AND COALESCE(o.valor_total, 0) > 0 THEN COALESCE(o.data_ultimo_pagamento, o.updated_at, o.data_entrega) ELSE NULL END,
        CASE
          WHEN o.status = 'cancelado' THEN 'cancelado'
          WHEN COALESCE(o.valor_pago, 0) >= COALESCE(o.valor_total, 0) AND COALESCE(o.valor_total, 0) > 0 THEN 'recebido'
          WHEN COALESCE(o.valor_pago, 0) > 0 THEN 'parcial'
          WHEN COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, '')) < DATE_FORMAT(CURDATE(), '%Y-%m-%d') THEN 'atrasado'
          ELSE 'pendente'
        END,
        o.forma_pagamento,
        COALESCE(o.parcelas, 1),
        'Recebivel migrado automaticamente a partir da ordem de servico',
        COALESCE(o.created_at, NOW()),
        NOW()
      FROM ordens_servico o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN contas_receber cr
        ON cr.user_id = o.user_id
       AND cr.ordem_servico_id = o.id
      WHERE cr.id IS NULL
        AND o.status <> 'cancelado'
        AND COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) > 0
    `);
    if (Number(result.affectedRows || 0) > 0) {
      console.log(`Backfill de contas_receber: ${result.affectedRows} registro(s) criado(s).`);
    }
  } catch (error) {
    console.warn(`Aviso: nao foi possivel executar backfill de contas a receber: ${error.message}`);
  }

  try {
    const [result] = await conn.query(`
      INSERT INTO os_pagamentos
        (id, user_id, ordem_servico_id, cliente_id, transacao_financeira_id, valor, forma_pagamento, data_pagamento,
         observacoes, origem, status, created_at, updated_at)
      SELECT
        UUID(),
        t.user_id,
        t.ordem_servico_id,
        o.cliente_id,
        t.id,
        t.valor,
        COALESCE(t.forma_pagamento, o.forma_pagamento),
        t.data,
        'Pagamento migrado de transacoes_financeiras',
        COALESCE(t.origem, 'migracao'),
        'confirmado',
        COALESCE(t.created_at, NOW()),
        NOW()
      FROM transacoes_financeiras t
      JOIN ordens_servico o ON o.id = t.ordem_servico_id
      LEFT JOIN os_pagamentos p ON p.transacao_financeira_id = t.id
      WHERE p.id IS NULL
        AND t.tipo = 'receita'
        AND t.ordem_servico_id IS NOT NULL
    `);
    if (Number(result.affectedRows || 0) > 0) {
      console.log(`Backfill de os_pagamentos: ${result.affectedRows} registro(s) criado(s).`);
    }
  } catch (error) {
    console.warn(`Aviso: nao foi possivel executar backfill de pagamentos de OS: ${error.message}`);
  }

  try {
    await conn.query(`
      UPDATE ordens_servico o
      LEFT JOIN (
        SELECT user_id, ordem_servico_id, COALESCE(SUM(valor), 0) AS total_pago, MAX(data_pagamento) AS ultima_data
        FROM os_pagamentos
        WHERE status = 'confirmado'
        GROUP BY user_id, ordem_servico_id
      ) p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
      SET
        o.valor_pago = COALESCE(p.total_pago, o.valor_pago, 0),
        o.data_ultimo_pagamento = COALESCE(p.ultima_data, o.data_ultimo_pagamento),
        o.status_financeiro = CASE
          WHEN o.status = 'cancelado' THEN 'cancelado'
          WHEN COALESCE(p.total_pago, o.valor_pago, 0) >= COALESCE(o.valor_total, 0) AND COALESCE(o.valor_total, 0) > 0 THEN 'pago'
          WHEN COALESCE(p.total_pago, o.valor_pago, 0) > 0 THEN 'parcial'
          ELSE 'pendente'
        END
    `);
  } catch (error) {
    console.warn(`Aviso: nao foi possivel sincronizar status financeiro das OS: ${error.message}`);
  }

  try {
    await conn.query(`
      UPDATE contas_receber cr
      JOIN ordens_servico o ON o.user_id = cr.user_id AND o.id = cr.ordem_servico_id
      SET
        cr.valor_recebido = COALESCE(o.valor_pago, 0),
        cr.data_recebimento = CASE WHEN COALESCE(o.status_financeiro, 'pendente') = 'pago' THEN COALESCE(o.data_ultimo_pagamento, o.updated_at, cr.data_recebimento) ELSE cr.data_recebimento END,
        cr.status = CASE
          WHEN o.status = 'cancelado' THEN 'cancelado'
          WHEN COALESCE(o.status_financeiro, 'pendente') = 'pago' THEN 'recebido'
          WHEN COALESCE(o.status_financeiro, 'pendente') = 'parcial' THEN 'parcial'
          WHEN COALESCE(cr.data_vencimento, '') < DATE_FORMAT(CURDATE(), '%Y-%m-%d') THEN 'atrasado'
          ELSE 'pendente'
        END,
        cr.updated_at = NOW()
    `);
  } catch (error) {
    console.warn(`Aviso: nao foi possivel sincronizar contas a receber: ${error.message}`);
  }

  console.log('Migracao MySQL concluida.');
} finally {
  await conn.end();
}
