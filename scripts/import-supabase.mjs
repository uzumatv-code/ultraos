import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de importar.');
}

if (!DATABASE_URL) {
  throw new Error('Configure DATABASE_URL ou MYSQL_URL antes de importar.');
}

const tableMap = {
  clientes: 'clientes',
  marcas: 'marcas',
  instrumentos: 'instrumentos',
  servicos: 'servicos',
  problemas: 'problemas',
  ordens_servico: 'ordens_servico',
  categorias_financeiras: 'categorias_financeiras',
  contas_pagar: 'contas_pagar',
  transacoes_financeiras: 'transacoes_financeiras',
  configuracoes_empresa: 'configuracoes_empresa',
  configuracoes_whatsapp: 'configuracoes_whatsapp',
  system_settings: 'system_settings',
  message_templates: 'templates_mensagem',
  empresa_fiscal: 'empresa_fiscal',
  notas_fiscais: 'notas_fiscais',
  nfse_logs: 'nfse_logs',
  avaliacoes_lembretes: 'avaliacoes_lembretes',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const conn = await mysql.createConnection(DATABASE_URL);

async function getColumns(table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map((row) => row.Field));
}

function normalizeRow(sourceTable, row, columns) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    let target = key;
    let normalized = value;

    if (sourceTable === 'message_templates') {
      if (key === 'template_type') target = 'tipo';
      if (key === 'content') target = 'conteudo';
      if (key === 'template_content') target = 'conteudo';
      if (key === 'is_active') target = 'ativo';
    }

    if (!columns.has(target)) continue;
    if (Array.isArray(normalized) || (normalized && typeof normalized === 'object')) {
      normalized = JSON.stringify(normalized);
    }
    out[target] = normalized;
  }
  return out;
}

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn(`${table}: ${error.message}`);
      return rows;
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

const backup = {};
const summary = [];

try {
  for (const [source, target] of Object.entries(tableMap)) {
    const data = await fetchAll(source);
    backup[source] = data;
    summary.push({ table: source, rows: data.length });

    if (!data.length) {
      console.log(`${source}: 0 registros`);
      continue;
    }

    const columns = await getColumns(target);
    for (const row of data) {
      const normalized = normalizeRow(source, row, columns);
      const keys = Object.keys(normalized);
      if (!keys.length) continue;

      await conn.query(
        `INSERT INTO \`${target}\` (${keys.map((key) => `\`${key}\``).join(',')})
         VALUES (${keys.map(() => '?').join(',')})
         ON DUPLICATE KEY UPDATE ${keys.map((key) => `\`${key}\` = VALUES(\`${key}\`)`).join(',')}`,
        Object.values(normalized),
      );
    }

    console.log(`${source}: ${data.length} registros importados para ${target}`);
  }

  const backupDir = path.resolve('backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(backupDir, `supabase-export-${timestamp}.json`), JSON.stringify(backup, null, 2));
  fs.writeFileSync(path.join(backupDir, `supabase-export-summary-${timestamp}.json`), JSON.stringify(summary, null, 2));
  console.log('Importacao concluida.');
} finally {
  await conn.end();
}
