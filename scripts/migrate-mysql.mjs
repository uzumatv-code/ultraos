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
];

const alters = [
  ['ordens_servico', 'instrumento_id', "ALTER TABLE ordens_servico ADD COLUMN instrumento_id varchar(36) DEFAULT NULL AFTER cliente_id"],
  ['ordens_servico', 'problema_descricao', "ALTER TABLE ordens_servico ADD COLUMN problema_descricao text AFTER problemas_descricoes"],
  ['ordens_servico', 'servico_descricao', "ALTER TABLE ordens_servico ADD COLUMN servico_descricao text AFTER servicos_descricoes"],
  ['clientes', 'avaliou', "ALTER TABLE clientes ADD COLUMN avaliou tinyint(1) DEFAULT 0"],
  ['templates_mensagem', 'template_type', "ALTER TABLE templates_mensagem ADD COLUMN template_type varchar(50) GENERATED ALWAYS AS (tipo) VIRTUAL"],
  ['templates_mensagem', 'is_active', "ALTER TABLE templates_mensagem ADD COLUMN is_active tinyint(1) GENERATED ALWAYS AS (ativo) VIRTUAL"],
];

const modifications = [
  "ALTER TABLE ordens_servico MODIFY COLUMN data_entrada varchar(50) DEFAULT NULL",
  "ALTER TABLE ordens_servico MODIFY COLUMN data_previsao varchar(50) DEFAULT NULL",
  "ALTER TABLE ordens_servico MODIFY COLUMN data_entrega varchar(50) DEFAULT NULL",
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

  console.log('Migracao MySQL concluida.');
} finally {
  await conn.end();
}
