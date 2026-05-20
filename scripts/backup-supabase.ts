/**
 * Script de Backup do Supabase
 * Exporta estrutura e dados para migração para MySQL
 * 
 * Uso: npx ts-node scripts/backup-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuração - Substitua com suas credenciais
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'SUA_URL_AQUI';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'SUA_SERVICE_KEY_AQUI'; // Use a service_role key para backup completo

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Lista de tabelas para backup
const TABLES = [
  'clientes',
  'marcas',
  'instrumentos',
  'servicos',
  'problemas',
  'ordens_servico',
  'categorias_financeiras',
  'contas_pagar',
  'transacoes_financeiras',
  'configuracoes_empresa',
  'configuracoes_whatsapp',
  'templates_mensagem',
  'empresa_fiscal',
  'notas_fiscais',
  'nfse_logs',
  'avaliacoes_lembretes'
];

interface BackupResult {
  table: string;
  count: number;
  data: any[];
}

async function backupTable(tableName: string): Promise<BackupResult> {
  console.log(`📦 Exportando tabela: ${tableName}...`);
  
  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' });

    if (error) {
      console.error(`❌ Erro ao exportar ${tableName}:`, error.message);
      return { table: tableName, count: 0, data: [] };
    }

    console.log(`✅ ${tableName}: ${data?.length || 0} registros`);
    return { table: tableName, count: data?.length || 0, data: data || [] };
  } catch (err: any) {
    console.error(`❌ Erro ao exportar ${tableName}:`, err.message);
    return { table: tableName, count: 0, data: [] };
  }
}

async function exportToJSON() {
  console.log('🚀 Iniciando backup do Supabase...\n');
  
  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results: BackupResult[] = [];

  for (const table of TABLES) {
    const result = await backupTable(table);
    results.push(result);
    
    // Salvar cada tabela em arquivo separado
    const filePath = path.join(backupDir, `${table}_${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2));
  }

  // Salvar resumo
  const summary = {
    timestamp: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    tables: results.map(r => ({ table: r.table, count: r.count })),
    totalRecords: results.reduce((sum, r) => sum + r.count, 0)
  };

  fs.writeFileSync(
    path.join(backupDir, `backup_summary_${timestamp}.json`),
    JSON.stringify(summary, null, 2)
  );

  // Salvar backup completo em um único arquivo
  const fullBackup = Object.fromEntries(results.map(r => [r.table, r.data]));
  fs.writeFileSync(
    path.join(backupDir, `full_backup_${timestamp}.json`),
    JSON.stringify(fullBackup, null, 2)
  );

  console.log('\n📊 Resumo do Backup:');
  console.log('─'.repeat(40));
  results.forEach(r => {
    console.log(`  ${r.table}: ${r.count} registros`);
  });
  console.log('─'.repeat(40));
  console.log(`  Total: ${summary.totalRecords} registros`);
  console.log(`\n✅ Backup salvo em: ${backupDir}`);
}

// Executar
exportToJSON().catch(console.error);
