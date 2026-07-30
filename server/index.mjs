import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import { detectImageMime, normalizeDocumentConfig } from './document-customization.mjs';
import { occurrencesInRange, parseDateOnly, validatePayableInput } from './payable-recurrence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.JWT_TTL || '12h';
const APP_URL = String(process.env.APP_URL || '').replace(/\/$/, '');
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const MAIL_FROM = process.env.MAIL_FROM || GMAIL_USER;
const EVOLUTION_API_URL = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || '';
const WHATSAPP_RECONCILE_ENABLED = process.env.WHATSAPP_RECONCILE_ENABLED !== 'false';
const WHATSAPP_RECONCILE_INTERVAL_MS = Math.max(30_000, Number(process.env.WHATSAPP_RECONCILE_INTERVAL_MS || 60_000));
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const uploadsDir = path.join(rootDir, 'uploads');
const EVALUATION_JOB_ENABLED = process.env.EVALUATION_JOB_ENABLED !== 'false';
const EVALUATION_JOB_INTERVAL_MS = Number(process.env.EVALUATION_JOB_INTERVAL_MS || 60_000);
const EVALUATION_TIMEZONE = process.env.EVALUATION_TIMEZONE || 'America/Sao_Paulo';
const DB_CONNECT_TIMEOUT_MS = Math.max(5_000, Number(process.env.DB_CONNECT_TIMEOUT_MS || 20_000));
const EVALUATION_DEFAULTS = {
  enabled: true,
  daysAfterCompletion: 7,
  triggerHour: 11,
  dailyLimit: 20,
  minIntervalSeconds: 20,
  googleReviewLink: 'https://g.page/r/Cd8CHsL7KDxCEBM/review',
  instagramHandle: '@luthieriabrasilia',
};
const REMARKETING_DEFAULT_MESSAGE = `Olá, {{nome}}! Já faz cerca de {{meses}} meses desde a última manutenção do seu {{instrumento}}.

Uma revisão preventiva pode ajudar a conservar a regulagem, as cordas e a escala. Se quiser, podemos verificar o instrumento e orientar se há necessidade de troca de cordas, higienização ou hidratação.

Deseja consultar os horários disponíveis? Para não receber lembretes de manutenção, responda SAIR.`;
const REMARKETING_FINAL_STATUSES = new Set(['processando', 'enviado', 'respondido', 'convertido', 'descadastrado', 'cancelado']);
const REMARKETING_OPT_OUT_WORDS = new Set(['sair', 'parar', 'cancelar', 'descadastrar', 'nao quero', 'não quero']);
const SYSTEM_AI_MODEL = process.env.OPENAI_INTENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';
const SYSTEM_AI_WRITE_INTENTS = new Set([
  'registrar_despesa',
  'registrar_pagamento_os',
  'registrar_conta_pagar',
  'cadastrar_cliente',
  'editar_cliente',
  'excluir_cliente',
  'cadastrar_os',
  'editar_os',
  'cancelar_os',
]);
const SYSTEM_AI_ADMIN_INTENTS = new Set(['excluir_cliente']);
const SYSTEM_AI_QUERY_INTENTS = new Set([
  'contas_vencem_hoje',
  'a_receber_mes',
  'faturamento_mes',
  'os_pendentes_pagamento',
  'divida_cliente',
  'os_do_dia',
  'buscar_cliente',
  'buscar_os',
  'listar_clientes_recentes',
]);
const SERVICE_ORDER_STATUSES = new Set(['pendente', 'em_andamento', 'concluido', 'cancelado', 'atraso']);
const MESSAGE_TEMPLATE_TYPES = new Set([
  'nova_ordem',
  'servico_finalizado',
  'servico_andamento',
  'servico_atraso',
  'lembrete_retirada',
  'cobranca_pagamento',
  'lembrete_manutencao',
  'orcamento_aprovado',
  'diagnostico_concluido',
  'avaliacao_google_instagram',
]);

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL ou MYSQL_URL precisa estar configurado no backend');
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET precisa estar configurado no backend');
}

const pool = mysql.createPool({
  uri: DATABASE_URL,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  connectTimeout: DB_CONNECT_TIMEOUT_MS,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true,
  timezone: 'Z',
});

const allowedTables = new Set([
  'clientes',
  'marcas',
  'instrumentos',
  'equipamentos',
  'servicos',
  'problemas',
  'ordens_servico',
  'categorias_financeiras',
  'contas_pagar',
  'contas_receber',
  'os_pagamentos',
  'os_condicoes_pagamento',
  'anexos_financeiros',
  'transacoes_financeiras',
  'financeiro_ia_autorizados',
  'financeiro_ia_logs',
  'configuracoes_empresa',
  'configuracoes_whatsapp',
  'system_settings',
  'message_templates',
  'templates_mensagem',
  'empresa_fiscal',
  'notas_fiscais',
  'nfse_logs',
  'agenda_logs',
  'avaliacoes_lembretes',
  'auditoria',
]);

const OPERATOR_READ_TABLES = new Set([
  'clientes', 'marcas', 'instrumentos', 'equipamentos', 'servicos', 'problemas',
  'ordens_servico', 'configuracoes_empresa',
  'os_condicoes_pagamento',
  'system_settings', 'message_templates', 'templates_mensagem', 'agenda_logs',
  'avaliacoes_lembretes',
]);
const OPERATOR_INSERT_TABLES = new Set([
  'clientes', 'marcas', 'instrumentos', 'equipamentos', 'servicos', 'problemas',
  'ordens_servico', 'agenda_logs', 'avaliacoes_lembretes',
]);
const OPERATOR_UPDATE_TABLES = new Set([
  'clientes', 'marcas', 'instrumentos', 'equipamentos', 'servicos', 'problemas',
  'ordens_servico', 'avaliacoes_lembretes',
]);
const OPERATOR_UPSERT_TABLES = new Set(['avaliacoes_lembretes']);
const OPERATOR_ORDER_BLOCKED_COLUMNS = new Set([
  'valor_pago', 'status_financeiro', 'data_ultimo_pagamento', 'observacoes_financeiras',
]);
const OPERATOR_ORDER_UPDATE_BLOCKED_COLUMNS = new Set([
  ...OPERATOR_ORDER_BLOCKED_COLUMNS,
]);
const OPERATOR_STATUS_TRANSITIONS = {
  pendente: new Set(['pendente', 'em_andamento', 'concluido']),
  em_andamento: new Set(['em_andamento', 'concluido']),
  atraso: new Set(['atraso', 'em_andamento', 'concluido']),
  concluido: new Set(['concluido']),
  cancelado: new Set(['cancelado']),
};

const relationMap = {
  ordens_servico: {
    cliente: ['clientes', 'cliente_id'],
    instrumento: ['instrumentos', 'instrumento_id'],
    marca: ['marcas', 'marca_id'],
    equipamento: ['equipamentos', 'equipamento_id'],
  },
  contas_pagar: {
    categoria: ['categorias_financeiras', 'categoria_id'],
  },
  transacoes_financeiras: {
    categoria: ['categorias_financeiras', 'categoria_id'],
    conta_pagar: ['contas_pagar', 'conta_pagar_id'],
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
  },
  contas_receber: {
    categoria: ['categorias_financeiras', 'categoria_id'],
    cliente: ['clientes', 'cliente_id'],
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
  },
  os_pagamentos: {
    cliente: ['clientes', 'cliente_id'],
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
    transacao_financeira: ['transacoes_financeiras', 'transacao_financeira_id'],
  },
  os_condicoes_pagamento: {
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
    pagamento: ['os_pagamentos', 'pagamento_id'],
  },
  financeiro_ia_logs: {
    autorizado: ['financeiro_ia_autorizados', 'autorizado_id'],
  },
  notas_fiscais: {
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
  },
  avaliacoes_lembretes: {
    cliente: ['clientes', 'cliente_id'],
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
  },
};

const columnCache = new Map();

app.disable('x-powered-by');
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads/certificados', (_req, res) => res.status(404).end());
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'sistema-os',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, database: 'unavailable', error: error.message });
  }
});

function now() {
  return new Date().toISOString();
}

function passwordResetTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function passwordResetEmail({ name, resetUrl }) {
  const displayName = name || 'usuário';
  return {
    subject: 'Redefinição de senha — Sistema OS',
    text: `Olá, ${displayName}.\n\nRecebemos uma solicitação para redefinir sua senha. Acesse o link abaixo em até 1 hora:\n${resetUrl}\n\nSe não foi você, ignore este e-mail.`,
    html: `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><h2>Redefinição de senha</h2><p>Olá, ${escapeHtml(displayName)}.</p><p>Recebemos uma solicitação para redefinir sua senha. Este link expira em <strong>1 hora</strong>.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Redefinir senha</a></p><p>Se não foi você, ignore este e-mail. Sua senha não será alterada.</p></div>`,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function passwordResetMailer() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !APP_URL) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
}

function todayDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVALUATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function uuid() {
  return crypto.randomUUID();
}

function encryptionKey() {
  return crypto.createHash('sha256').update(JWT_SECRET).digest();
}

function encryptSecret(value) {
  const text = String(value || '');
  if (!text || text.startsWith('enc:v1:')) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptSecret(value) {
  const text = String(value || '');
  if (!text.startsWith('enc:v1:')) return text;

  const payload = Buffer.from(text.slice(7), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function resolveUploadPath(bucket, filePath) {
  const safeBucket = String(bucket || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanPath = String(filePath || '').replace(/^[/\\]+/, '');
  if (!safeBucket || !cleanPath || cleanPath.includes('\0')) return null;

  const bucketDir = path.resolve(uploadsDir, safeBucket);
  const target = path.resolve(bucketDir, cleanPath);
  if (target !== bucketDir && target.startsWith(`${bucketDir}${path.sep}`)) {
    return { target, path: cleanPath.split(path.sep).join('/') };
  }
  return null;
}

async function getNextOrderNumber(userId) {
  const [[row]] = await pool.query(
    'SELECT COALESCE(MAX(numero), 0) + 1 AS next_number FROM `ordens_servico` WHERE user_id = ?',
    [userId],
  );
  return Number(row?.next_number || 1);
}

function signUser(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    plano_atual: user.plano_atual || 'trial',
    status_assinatura: user.status_assinatura || 'ativo',
    nivel: normalizedRole(user),
    conta_id: user.conta_id || user.id,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    aud: 'authenticated',
    user_metadata: {
      nome: user.nome || '',
      avatar_url: user.avatar_url || '',
    },
    app_metadata: {
      plano_atual: user.plano_atual || 'trial',
      status_assinatura: user.status_assinatura || 'ativo',
      nivel: normalizedRole(user),
      conta_id: user.conta_id || user.id,
    },
  };
}

function normalizedRole(user) {
  if (!user) return 'operador';
  if (!user.conta_id || user.conta_id === user.id) return 'admin';
  return user.nivel === 'admin' ? 'admin' : 'operador';
}

function canQuery(role, table, action) {
  if (table === 'auditoria') return role === 'admin' && action === 'select';
  if (role === 'admin') return true;
  if (action === 'select') return OPERATOR_READ_TABLES.has(table);
  if (action === 'insert') return OPERATOR_INSERT_TABLES.has(table);
  if (action === 'update') return OPERATOR_UPDATE_TABLES.has(table);
  if (action === 'upsert') return OPERATOR_UPSERT_TABLES.has(table);
  return false;
}

function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Esta ação exige acesso de administrador' } });
  }
  next();
}

async function writeAudit(req, { action, resource, resourceId = null, details = null }) {
  try {
    await pool.query(
      `INSERT INTO auditoria
       (id, user_id, actor_user_id, actor_email, actor_role, acao, recurso, recurso_id, detalhes, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), req.auth.accountId, req.auth.userId, req.auth.email, req.auth.role, action, resource,
        resourceId, details ? JSON.stringify(details) : null, req.ip || null, now()],
    );
  } catch (error) {
    console.error('Falha ao registrar auditoria:', error.message);
  }
}

async function getColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
  const cols = new Set(rows.map((row) => row.Field));
  columnCache.set(table, cols);
  return cols;
}

async function filterDataToColumns(table, data) {
  const cols = await getColumns(table);
  const normalized = {};

  for (const [key, value] of Object.entries(data || {})) {
    let mappedKey = key;
    let mappedValue = value;

    if (table === 'message_templates') {
      if (key === 'template_type') mappedKey = 'tipo';
      if (key === 'content') mappedKey = 'conteudo';
      if (key === 'template_content') mappedKey = 'conteudo';
      if (key === 'is_active') mappedKey = 'ativo';
    }

    if (table === 'templates_mensagem') {
      if (key === 'template_type') mappedKey = 'tipo';
      if (key === 'content') mappedKey = 'conteudo';
      if (key === 'template_content') mappedKey = 'conteudo';
      if (key === 'is_active') mappedKey = 'ativo';
    }

    if (table === 'empresa_fiscal' && mappedKey === 'certificado_senha_encrypted') {
      mappedValue = encryptSecret(mappedValue);
    }

    if (table === 'configuracoes_whatsapp' && ['api_key', 'webhook_url', 'instance_name'].includes(mappedKey)) {
      continue;
    }

    if (!cols.has(mappedKey)) continue;
    if (Array.isArray(mappedValue) || (mappedValue && typeof mappedValue === 'object' && !(mappedValue instanceof Date))) {
      mappedValue = JSON.stringify(mappedValue);
    }
    normalized[mappedKey] = mappedValue;
  }

  if (cols.has('updated_at') && !('updated_at' in normalized)) normalized.updated_at = now();
  return normalized;
}

async function normalizeRows(table, rows, select, accountId) {
  const out = rows.map((row) => normalizeRow(table, row));
  await attachRelations(table, out, select || '', accountId);
  return out;
}

async function removeOrphanedReceivables(conn, userId) {
  const [result] = await conn.query(
    `DELETE cr
       FROM contas_receber cr
       LEFT JOIN ordens_servico o
         ON o.id = cr.ordem_servico_id AND o.user_id = cr.user_id
      WHERE cr.user_id = ?
        AND cr.ordem_servico_id IS NOT NULL
        AND o.id IS NULL`,
    [userId],
  );
  return Number(result.affectedRows || 0);
}

async function createMissingReceivables(conn, userId) {
  const [result] = await conn.query(
    `INSERT IGNORE INTO contas_receber
      (id, user_id, ordem_servico_id, cliente_id, descricao, valor, valor_recebido, data_vencimento,
       data_recebimento, status, forma_pagamento, parcelas, parcela_atual, observacoes, created_at, updated_at)
     SELECT
       UUID(),
       o.user_id,
       o.id,
       o.cliente_id,
       CONCAT('OS #', o.numero, ' - ', COALESCE(c.nome, 'Cliente')),
       COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0),
       COALESCE(p.total_pago, 0),
       COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, ''), NULLIF(o.data_entrada, ''), LEFT(o.created_at, 10), DATE_FORMAT(CURDATE(), '%Y-%m-%d')),
       CASE
         WHEN COALESCE(p.total_pago, 0) >= COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0)
          AND COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) > 0
         THEN p.ultima_data
         ELSE NULL
       END,
       CASE
         WHEN COALESCE(p.total_pago, 0) >= COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0)
          AND COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) > 0
         THEN 'recebido'
         WHEN COALESCE(p.total_pago, 0) > 0 THEN 'parcial'
         WHEN COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, ''), NULLIF(o.data_entrada, ''), LEFT(o.created_at, 10), DATE_FORMAT(CURDATE(), '%Y-%m-%d')) < DATE_FORMAT(CURDATE(), '%Y-%m-%d')
         THEN 'atrasado'
         ELSE 'pendente'
       END,
       o.forma_pagamento,
       COALESCE(o.parcelas, 1),
       1,
       'Recebivel recuperado automaticamente a partir da OS',
       COALESCE(o.created_at, ?),
       ?
     FROM ordens_servico o
     LEFT JOIN clientes c
       ON c.user_id = o.user_id AND c.id = o.cliente_id
     LEFT JOIN (
       SELECT user_id, ordem_servico_id, SUM(valor) AS total_pago, MAX(data_pagamento) AS ultima_data
         FROM os_pagamentos
        WHERE status = 'confirmado'
        GROUP BY user_id, ordem_servico_id
     ) p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
     LEFT JOIN contas_receber cr
       ON cr.user_id = o.user_id AND cr.ordem_servico_id = o.id
     WHERE o.user_id = ?
       AND o.status <> 'cancelado'
       AND cr.id IS NULL
       AND COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) > 0`,
    [now(), now(), userId],
  );
  return Number(result.affectedRows || 0);
}

async function reconcileReceivables(conn, userId) {
  const removed = await removeOrphanedReceivables(conn, userId);
  const created = await createMissingReceivables(conn, userId);

  await conn.query(
    `UPDATE ordens_servico o
     LEFT JOIN (
       SELECT user_id, ordem_servico_id, COALESCE(SUM(valor), 0) AS total_pago,
              MAX(data_pagamento) AS ultima_data
         FROM os_pagamentos
        WHERE status = 'confirmado'
        GROUP BY user_id, ordem_servico_id
     ) p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
        SET o.valor_pago = COALESCE(p.total_pago, 0),
            o.data_ultimo_pagamento = p.ultima_data,
            o.status_financeiro = CASE
              WHEN o.status = 'cancelado' THEN 'cancelado'
              WHEN COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) <= 0 THEN 'pago'
              WHEN COALESCE(p.total_pago, 0) >= COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) THEN 'pago'
              WHEN COALESCE(p.total_pago, 0) > 0 THEN 'parcial'
              ELSE 'pendente'
            END
      WHERE o.user_id = ?`,
    [userId],
  );

  const [updatedResult] = await conn.query(
    `UPDATE contas_receber cr
     JOIN ordens_servico o ON o.user_id = cr.user_id AND o.id = cr.ordem_servico_id
     LEFT JOIN clientes c ON c.user_id = o.user_id AND c.id = o.cliente_id
     LEFT JOIN (
       SELECT user_id, ordem_servico_id, COALESCE(SUM(valor), 0) AS total_pago,
              MAX(data_pagamento) AS ultima_data
         FROM os_pagamentos
        WHERE status = 'confirmado'
        GROUP BY user_id, ordem_servico_id
     ) p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
        SET cr.cliente_id = o.cliente_id,
            cr.descricao = CONCAT('OS #', o.numero, ' - ', COALESCE(c.nome, 'Cliente')),
            cr.valor = COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0),
            cr.valor_recebido = COALESCE(p.total_pago, 0),
            cr.data_vencimento = COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, ''), NULLIF(o.data_entrada, ''), LEFT(o.created_at, 10), DATE_FORMAT(CURDATE(), '%Y-%m-%d')),
            cr.data_recebimento = CASE
              WHEN COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) > 0
               AND COALESCE(p.total_pago, 0) >= COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0)
              THEN p.ultima_data
              ELSE NULL
            END,
            cr.status = CASE
              WHEN o.status = 'cancelado' THEN 'cancelado'
              WHEN COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) <= 0 THEN 'recebido'
              WHEN COALESCE(p.total_pago, 0) >= COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) THEN 'recebido'
              WHEN COALESCE(p.total_pago, 0) > 0 THEN 'parcial'
              WHEN COALESCE(NULLIF(o.data_previsao, ''), NULLIF(o.data_entrega, ''), NULLIF(o.data_entrada, ''), LEFT(o.created_at, 10), DATE_FORMAT(CURDATE(), '%Y-%m-%d')) < DATE_FORMAT(CURDATE(), '%Y-%m-%d') THEN 'atrasado'
              ELSE 'pendente'
            END,
            cr.forma_pagamento = o.forma_pagamento,
            cr.parcelas = COALESCE(o.parcelas, 1)
      WHERE cr.user_id = ?`,
    [userId],
  );

  return { removed, created, updated: Number(updatedResult.affectedRows || 0) };
}

function normalizeRow(table, row) {
  const copy = { ...row };

  for (const key of ['problemas_ids', 'problemas_descricoes', 'servicos_ids', 'servicos_descricoes']) {
    if (typeof copy[key] === 'string') {
      try { copy[key] = JSON.parse(copy[key]); } catch {}
    }
  }

  if (table === 'templates_mensagem' || table === 'message_templates') {
    copy.template_type = copy.tipo;
    copy.content = copy.conteudo;
    copy.template_content = copy.conteudo;
    copy.template_name = copy.template_name || copy.nome || copy.tipo;
    copy.variables = copy.variables || [];
    copy.is_active = Boolean(copy.ativo);
  }


  if (table === 'configuracoes_whatsapp') {
    delete copy.api_key;
    delete copy.webhook_url;
    delete copy.instance_name;
  }

  return copy;
}

async function attachRelations(table, rows, select, accountId) {
  const relations = relationMap[table];
  if (!relations || !rows.length) return;

  for (const [alias, [targetTable, fk]] of Object.entries(relations)) {
    if (!select.includes(`${alias}:`) && !select.includes(targetTable)) continue;
    const ids = [...new Set(rows.map((row) => row[fk]).filter(Boolean))];
    if (!ids.length) continue;

    const placeholders = ids.map(() => '?').join(',');
    const targetCols = await getColumns(targetTable);
    const tenantClause = accountId && targetCols.has('user_id') ? ' AND `user_id` = ?' : '';
    const [relatedRows] = await pool.query(
      `SELECT * FROM \`${targetTable}\` WHERE id IN (${placeholders})${tenantClause}`,
      tenantClause ? [...ids, accountId] : ids,
    );
    const relatedById = new Map(relatedRows.map((row) => [row.id, normalizeRow(targetTable, row)]));
    for (const row of rows) row[alias] = relatedById.get(row[fk]) || null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: { message: 'Sessao invalida' } });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.sub);
    if (!user || user.ativo === 0 || user.status_assinatura === 'bloqueado') {
      return res.status(401).json({ error: { message: 'Usuário inativo ou sessão inválida' } });
    }
    if (user.senha_alterada_em && Number(decoded.iat || 0) < Math.floor(new Date(user.senha_alterada_em).getTime() / 1000)) {
      return res.status(401).json({ error: { message: 'Sua senha foi alterada. Entre novamente.' } });
    }
    const role = normalizedRole(user);
    const accountId = user.conta_id || user.id;
    if (accountId !== user.id) {
      const accountOwner = await findUserById(accountId);
      if (!accountOwner || accountOwner.ativo === 0 || accountOwner.status_assinatura === 'bloqueado') {
        return res.status(401).json({ error: { message: 'A conta principal está inativa' } });
      }
    }
    req.auth = { userId: user.id, accountId, role, email: user.email };
    // Compatibilidade: o restante do backend usa req.user.id como escopo dos dados.
    req.user = { id: accountId, actorId: user.id, email: user.email, aud: 'authenticated', role };
    next();
  } catch (error) {
    console.error('Falha de autenticação:', error.message);
    res.status(401).json({ error: { message: 'Sessao expirada' } });
  }
}

async function findUserByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM `usuarios` WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await pool.query('SELECT * FROM `usuarios` WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await findUserByEmail(email);

    if (!user || !user.senha_hash) {
      return res.status(401).json({ error: { message: 'Invalid login credentials' } });
    }

    const ok = await bcrypt.compare(password, user.senha_hash);
    if (!ok || user.ativo === 0 || user.status_assinatura === 'bloqueado') {
      return res.status(401).json({ error: { message: 'Invalid login credentials' } });
    }

    await pool.query('UPDATE `usuarios` SET ultimo_login = ? WHERE id = ?', [new Date(), user.id]);
    const token = signUser(user);
    res.json({ session: { access_token: token, token_type: 'bearer', user: publicUser(user) }, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/auth/password-reset/request', async (req, res) => {
  const genericResponse = { message: 'Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.' };
  try {
    const mailer = passwordResetMailer();
    if (!mailer) {
      console.error('Recuperação de senha indisponível: configure APP_URL, GMAIL_USER e GMAIL_APP_PASSWORD.');
      return res.status(503).json({ error: { message: 'Recuperação de senha está temporariamente indisponível.' } });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.json(genericResponse);
    const user = await findUserByEmail(email);
    if (!user || user.ativo === 0) return res.json(genericResponse);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [[attempts]] = await pool.query(
      'SELECT COUNT(*) AS total FROM recuperacoes_senha WHERE user_id = ? AND created_at >= ?',
      [user.id, oneHourAgo],
    );
    if (Number(attempts.total) >= 3) return res.json(genericResponse);

    const token = crypto.randomBytes(32).toString('hex');
    const createdAt = now();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
    await pool.query('UPDATE recuperacoes_senha SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [createdAt, user.id]);
    await pool.query(
      `INSERT INTO recuperacoes_senha (id, user_id, token_hash, expires_at, used_at, requested_ip, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      [uuid(), user.id, passwordResetTokenHash(token), expiresAt, req.ip || null, createdAt],
    );

    const resetUrl = `${APP_URL}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const emailContent = passwordResetEmail({ name: user.nome, resetUrl });
    await mailer.sendMail({ from: MAIL_FROM, to: user.email, ...emailContent });
    await pool.query(
      `INSERT INTO auditoria (id, user_id, actor_user_id, actor_email, actor_role, acao, recurso, recurso_id, detalhes, ip_address, created_at)
       VALUES (?, ?, ?, ?, 'sistema', 'senha.recuperacao.solicitada', 'usuarios', ?, NULL, ?, ?)`,
      [uuid(), user.conta_id || user.id, user.id, user.email, user.id, req.ip || null, createdAt],
    ).catch((error) => console.error('Falha ao auditar recuperação de senha:', error.message));
    return res.json(genericResponse);
  } catch (error) {
    console.error('Falha ao solicitar recuperação de senha:', error.message);
    return res.status(502).json({ error: { message: 'Não foi possível enviar o e-mail de recuperação. Tente novamente.' } });
  }
});

app.post('/api/auth/password-reset/confirm', async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8) {
    return res.status(400).json({ error: { message: 'Link inválido ou senha com menos de 8 caracteres.' } });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[resetRequest]] = await conn.query(
      `SELECT id, user_id FROM recuperacoes_senha
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? LIMIT 1 FOR UPDATE`,
      [passwordResetTokenHash(token), now()],
    );
    if (!resetRequest) {
      await conn.rollback();
      return res.status(400).json({ error: { message: 'Este link é inválido, já foi utilizado ou expirou.' } });
    }

    const changedAt = now();
    const hash = await bcrypt.hash(password, 12);
    await conn.query('UPDATE usuarios SET senha_hash = ?, senha_alterada_em = ?, updated_at = ? WHERE id = ?', [hash, changedAt, changedAt, resetRequest.user_id]);
    await conn.query('UPDATE recuperacoes_senha SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [changedAt, resetRequest.user_id]);
    const [[user]] = await conn.query('SELECT email, conta_id FROM usuarios WHERE id = ? LIMIT 1', [resetRequest.user_id]);
    if (user) {
      await conn.query(
        `INSERT INTO auditoria (id, user_id, actor_user_id, actor_email, actor_role, acao, recurso, recurso_id, detalhes, ip_address, created_at)
         VALUES (?, ?, ?, ?, 'sistema', 'senha.recuperacao.concluida', 'usuarios', ?, NULL, ?, ?)`,
        [uuid(), user.conta_id || resetRequest.user_id, resetRequest.user_id, user.email, resetRequest.user_id, req.ip || null, changedAt],
      );
    }
    await conn.commit();
    return res.json({ message: 'Senha redefinida com sucesso. Entre com a nova senha.' });
  } catch (error) {
    await conn.rollback();
    console.error('Falha ao redefinir senha:', error.message);
    return res.status(500).json({ error: { message: 'Não foi possível redefinir a senha.' } });
  } finally {
    conn.release();
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || password.length < 6) {
      return res.status(400).json({ error: { message: 'Email e senha sao obrigatorios' } });
    }

    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: { message: 'Email ja cadastrado' } });
    }

    const id = uuid();
    const hash = await bcrypt.hash(password, 12);
    const createdAt = now();
    await pool.query(
      `INSERT INTO usuarios
       (id, email, senha_hash, conta_id, nivel, plano_atual, dias_restantes, status_assinatura, ativo, email_verificado, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 'trial', 14, 'ativo', 1, 1, ?, ?)`,
      [id, email, hash, id, createdAt, createdAt],
    );

    const user = await findUserById(id);
    const token = signUser(user);
    res.status(201).json({ session: { access_token: token, token_type: 'bearer', user: publicUser(user) }, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.get('/api/auth/session', requireAuth, async (req, res) => {
  const user = await findUserById(req.auth.userId);
  if (!user) return res.status(401).json({ error: { message: 'Sessao invalida' } });
  res.json({ session: { access_token: req.headers.authorization.slice(7), token_type: 'bearer', user: publicUser(user) }, user: publicUser(user) });
});

app.patch('/api/auth/user', requireAuth, async (req, res) => {
  try {
    if (req.body.password && String(req.body.password).length < 8) {
      return res.status(400).json({ error: { message: 'A senha precisa ter pelo menos 8 caracteres' } });
    }
    const updates = {};
    if (req.body.password) {
      updates.senha_hash = await bcrypt.hash(String(req.body.password), 12);
      updates.senha_alterada_em = now();
    }
    if (req.body.data?.nome) updates.nome = req.body.data.nome;
    if (req.body.data?.avatar_url) updates.avatar_url = req.body.data.avatar_url;
    if (!Object.keys(updates).length) return res.json({ user: publicUser(await findUserById(req.auth.userId)) });

    updates.updated_at = now();
    const sets = Object.keys(updates).map((key) => `\`${key}\` = ?`).join(', ');
    await pool.query(`UPDATE usuarios SET ${sets} WHERE id = ?`, [...Object.values(updates), req.auth.userId]);
    res.json({ user: publicUser(await findUserById(req.auth.userId)) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.get('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, email, nome, nivel, ativo, ultimo_login, created_at
       FROM usuarios WHERE conta_id = ? ORDER BY nome, email`,
    [req.auth.accountId],
  );
  res.json({ data: rows.map((row) => ({ ...row, nivel: normalizedRole({ ...row, conta_id: req.auth.accountId }) })) });
});

app.post('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const nome = String(req.body.nome || '').trim();
    const nivel = req.body.nivel === 'admin' ? 'admin' : 'operador';
    if (!email || password.length < 8) {
      return res.status(400).json({ error: { message: 'Informe um e-mail e uma senha com pelo menos 8 caracteres' } });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: { message: 'E-mail já cadastrado' } });
    }
    const id = uuid();
    const createdAt = now();
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO usuarios
       (id, email, senha_hash, nome, conta_id, nivel, plano_atual, dias_restantes, status_assinatura, ativo, email_verificado, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'equipe', 0, 'ativo', 1, 1, ?, ?)`,
      [id, email, hash, nome || null, req.auth.accountId, nivel, createdAt, createdAt],
    );
    await writeAudit(req, { action: 'usuario.criar', resource: 'usuarios', resourceId: id, details: { email, nivel } });
    res.status(201).json({ data: { id, email, nome, nivel, ativo: 1, created_at: createdAt } });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.patch('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id || '');
    if (req.body.password && String(req.body.password).length < 8) {
      return res.status(400).json({ error: { message: 'A senha precisa ter pelo menos 8 caracteres' } });
    }
    const deactivating = req.body.ativo === false || req.body.ativo === 0;
    const demoting = req.body.nivel !== undefined && req.body.nivel !== 'admin';
    if (targetId === req.auth.userId && (deactivating || demoting)) {
      return res.status(400).json({ error: { message: 'Você não pode remover o próprio acesso administrativo' } });
    }
    const [targets] = await pool.query('SELECT id, nivel, ativo FROM usuarios WHERE id = ? AND conta_id = ? LIMIT 1', [targetId, req.auth.accountId]);
    if (!targets.length) return res.status(404).json({ error: { message: 'Usuário não encontrado' } });
    if (targets[0].nivel === 'admin' && targets[0].ativo && (deactivating || demoting)) {
      const [[adminCount]] = await pool.query(
        "SELECT COUNT(*) AS total FROM usuarios WHERE conta_id = ? AND nivel = 'admin' AND ativo = 1",
        [req.auth.accountId],
      );
      if (Number(adminCount.total) <= 1) {
        return res.status(400).json({ error: { message: 'A conta precisa manter pelo menos um administrador ativo' } });
      }
    }
    const updates = {};
    if (req.body.nome !== undefined) updates.nome = String(req.body.nome || '').trim() || null;
    if (req.body.nivel !== undefined) updates.nivel = req.body.nivel === 'admin' ? 'admin' : 'operador';
    if (req.body.ativo !== undefined) updates.ativo = req.body.ativo ? 1 : 0;
    if (req.body.password) {
      updates.senha_hash = await bcrypt.hash(String(req.body.password), 12);
      updates.senha_alterada_em = now();
    }
    updates.updated_at = now();
    const keys = Object.keys(updates);
    await pool.query(`UPDATE usuarios SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ? AND conta_id = ?`, [...keys.map((key) => updates[key]), targetId, req.auth.accountId]);
    await writeAudit(req, { action: 'usuario.atualizar', resource: 'usuarios', resourceId: targetId, details: { ...req.body, password: req.body.password ? '[alterada]' : undefined } });
    res.json({ data: { id: targetId, updated: true } });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

function requireEvolutionConfig() {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_WEBHOOK_SECRET || !APP_URL) {
    throw new Error('Integração WhatsApp gerenciada ainda não foi configurada no servidor');
  }
}

function managedInstanceName(accountId) {
  return `ultraos_${String(accountId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`;
}

async function evolutionRequest(pathname, { method = 'GET', body } = {}) {
  requireEvolutionConfig();
  const response = await fetch(`${EVOLUTION_API_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseText = await response.text();
  let data = null;
  try { data = responseText ? JSON.parse(responseText) : null; } catch { data = responseText; }
  if (!response.ok) {
    const error = new Error(`Evolution API HTTP ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function connectionStateFromPayload(payload) {
  return payload?.instance?.state || payload?.instance?.status || payload?.state || payload?.status || 'desconectado';
}

function publicConnectionStatus(state) {
  const normalized = String(state || '').trim().toLowerCase().replace(/[.\s-]+/g, '_');
  if (normalized === 'open' || normalized === 'connected') return 'conectado';
  if (normalized === 'connecting') return 'conectando';
  if (normalized === 'created' || normalized === 'qr' || normalized === 'qrcode') return 'aguardando_qr';
  if (['close', 'closed', 'disconnected', 'logged_out', 'loggedout', 'logout', 'device_removed', 'unauthorized', 'removed'].includes(normalized)) {
    return 'desconectado';
  }
  return normalized ? 'erro' : 'nao_configurado';
}

function disconnectDetailsFromPayload(payload, fallbackReason = null) {
  const statusCode = Number(
    payload?.data?.statusCode
      || payload?.data?.lastDisconnect?.error?.output?.statusCode
      || payload?.data?.lastDisconnect?.error?.statusCode
      || payload?.lastDisconnect?.error?.output?.statusCode
      || payload?.lastDisconnect?.error?.statusCode
      || payload?.statusCode
      || 0,
  ) || null;
  const reason = String(
    payload?.data?.lastDisconnect?.error?.data
      || payload?.data?.lastDisconnect?.error?.output?.payload?.message
      || payload?.data?.reason
      || payload?.lastDisconnect?.error?.data
      || payload?.reason
      || fallbackReason
      || '',
  ).trim().toLowerCase().replace(/[.\s-]+/g, '_') || null;
  return { reason, statusCode };
}

function disconnectDetailsFromError(error) {
  const serialized = JSON.stringify(error?.details || '').toLowerCase();
  const statusCode = Number(error?.status || 0) || null;
  const permanentReason = ['device_removed', 'logged_out', 'loggedout', 'unauthorized', 'instance_not_found']
    .find((reason) => serialized.includes(reason));
  if (permanentReason || statusCode === 401 || statusCode === 404) {
    return {
      disconnected: true,
      reason: permanentReason || (statusCode === 401 ? 'unauthorized' : 'instance_not_found'),
      statusCode,
    };
  }
  return { disconnected: false, reason: null, statusCode };
}

function connectionStatusFromPayload(payload) {
  const status = publicConnectionStatus(connectionStateFromPayload(payload));
  if (status !== 'desconectado') return status;
  const { statusCode } = disconnectDetailsFromPayload(payload);
  // Códigos de perda temporária/reinício usados pelo Baileys. A instância pode
  // se recuperar sozinha, então não exigimos novo QR nesses casos.
  if ([408, 428, 515].includes(statusCode)) return 'conectando';
  return status;
}

function qrFromPayload(payload) {
  const qr = payload?.qrcode || payload?.qr || payload || {};
  let base64 = qr.base64 || payload?.base64 || null;
  if (base64 && !String(base64).startsWith('data:')) base64 = `data:image/png;base64,${base64}`;
  return {
    base64,
    code: qr.code || payload?.code || null,
    pairingCode: qr.pairingCode || payload?.pairingCode || null,
  };
}

async function managedWhatsAppRow(userId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, instance_name, status, phone_number, profile_name, profile_picture_url,
            connected_at, disconnected_at, last_event_at, last_checked_at, disconnect_reason,
            connection_status_code, last_error, created_at, updated_at
       FROM configuracoes_whatsapp WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function saveManagedWhatsApp(userId, values = {}) {
  const current = await managedWhatsAppRow(userId);
  const data = {
    id: current?.id || uuid(),
    user_id: userId,
    method: 'webhook',
    provider: 'evolution',
    instance_name: current?.instance_name || managedInstanceName(userId),
    created_at: current?.created_at || now(),
    updated_at: now(),
    ...values,
  };
  const keys = Object.keys(data);
  const updates = keys
    .filter((key) => !['id', 'user_id', 'created_at'].includes(key))
    .map((key) => `\`${key}\` = VALUES(\`${key}\`)`)
    .join(', ');
  await pool.query(
    `INSERT INTO configuracoes_whatsapp (${keys.map((key) => `\`${key}\``).join(', ')})
     VALUES (${keys.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updates}`,
    Object.values(data),
  );
  return managedWhatsAppRow(userId);
}

function evolutionWebhookUrl() {
  return `${APP_URL}/api/webhooks/evolution/${encodeURIComponent(EVOLUTION_WEBHOOK_SECRET)}`;
}

const configuredEvolutionWebhooks = new Set();

async function configureEvolutionWebhook(instanceName) {
  const webhook = {
    enabled: true,
    url: evolutionWebhookUrl(),
    webhookByEvents: false,
    webhookBase64: true,
    events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE'],
  };
  try {
    const result = await evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, { method: 'POST', body: webhook });
    configuredEvolutionWebhooks.add(instanceName);
    return result;
  } catch (error) {
    if (error.status !== 400 && error.status !== 422) throw error;
    const result = await evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, { method: 'POST', body: { webhook } });
    configuredEvolutionWebhooks.add(instanceName);
    return result;
  }
}

async function liveEvolutionState(instanceName) {
  try {
    const payload = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    const state = connectionStatusFromPayload(payload);
    const details = disconnectDetailsFromPayload(payload, state === 'desconectado' ? 'connection_closed' : null);
    return { exists: true, state, payload, ...details };
  } catch (error) {
    if (error.status === 404) {
      return { exists: false, state: 'desconectado', payload: null, reason: 'instance_not_found', statusCode: 404 };
    }
    throw error;
  }
}

async function synchronizeWhatsAppConnection(row) {
  const live = await liveEvolutionState(row.instance_name);
  const status = live.state;
  const profile = status === 'conectado' && !row.phone_number ? await evolutionInstanceProfile(row.instance_name) : {};
  const disconnected = status === 'desconectado';
  return saveManagedWhatsApp(row.user_id, {
    status,
    ...profile,
    connected_at: status === 'conectado' ? row.connected_at || now() : row.connected_at,
    disconnected_at: disconnected
      ? (row.status === 'desconectado' ? row.disconnected_at || now() : now())
      : (status === 'erro' ? row.disconnected_at : null),
    last_checked_at: now(),
    disconnect_reason: disconnected ? live.reason || 'connection_closed' : (status === 'erro' ? row.disconnect_reason : null),
    connection_status_code: disconnected ? live.statusCode : (status === 'erro' ? row.connection_status_code : null),
    last_error: status === 'erro' ? `Estado de conexão não reconhecido: ${connectionStateFromPayload(live.payload)}` : null,
  });
}

async function ensureWhatsAppConnected(userId) {
  const row = await managedWhatsAppRow(userId);
  if (!row?.instance_name) {
    const error = new Error('WhatsApp não configurado. Conecte o número antes de enviar.');
    error.status = 409;
    throw error;
  }
  const synchronized = await synchronizeWhatsAppConnection(row);
  if (synchronized.status !== 'conectado') {
    const error = new Error('WhatsApp desconectado. Reconecte o número pelo QR Code antes de enviar.');
    error.status = 409;
    error.details = {
      reason: synchronized.disconnect_reason,
      statusCode: synchronized.connection_status_code,
    };
    throw error;
  }
  return synchronized;
}

async function evolutionInstanceProfile(instanceName) {
  try {
    const payload = await evolutionRequest(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
    const item = Array.isArray(payload) ? payload[0] : payload;
    const instance = item?.instance || item || {};
    return {
      phone_number: String(instance.ownerJid || item?.ownerJid || '').split('@')[0] || null,
      profile_name: instance.profileName || item?.profileName || null,
      profile_picture_url: instance.profilePicUrl || item?.profilePicUrl || null,
    };
  } catch {
    return { phone_number: null, profile_name: null, profile_picture_url: null };
  }
}

app.get('/api/whatsapp/connection', requireAuth, requireAdmin, async (req, res) => {
  try {
    requireEvolutionConfig();
    let row = await managedWhatsAppRow(req.auth.accountId);
    if (!row?.instance_name) return res.json({ data: { status: 'nao_configurado' } });

    row = await synchronizeWhatsAppConnection(row);
    return res.json({ data: { ...row, instance_name: undefined } });
  } catch (error) {
    return res.status(502).json({ error: { message: error.message } });
  }
});

app.post('/api/whatsapp/connection', requireAuth, requireAdmin, async (req, res) => {
  try {
    requireEvolutionConfig();
    let row = await saveManagedWhatsApp(req.auth.accountId, {
      status: 'criando',
      last_error: null,
      disconnect_reason: null,
      connection_status_code: null,
      last_checked_at: now(),
    });
    const instanceName = row.instance_name;
    let live = await liveEvolutionState(instanceName);
    let payload = null;

    if (!live.exists) {
      payload = await evolutionRequest('/instance/create', {
        method: 'POST',
        body: {
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          rejectCall: true,
          msgCall: 'Chamadas não são atendidas por este número. Envie uma mensagem.',
          groupsIgnore: true,
          alwaysOnline: false,
          readMessages: false,
          readStatus: false,
          syncFullHistory: false,
        },
      });
      live = { exists: true, state: 'aguardando_qr' };
    }

    await configureEvolutionWebhook(instanceName);
    let qr = qrFromPayload(payload);
    if (live.state !== 'conectado' && !qr.base64) {
      payload = await evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`);
      qr = qrFromPayload(payload);
    }

    const status = live.state === 'conectado' ? 'conectado' : 'aguardando_qr';
    const profile = status === 'conectado' ? await evolutionInstanceProfile(instanceName) : {};
    row = await saveManagedWhatsApp(req.auth.accountId, {
      status,
      ...profile,
      connected_at: status === 'conectado' ? row.connected_at || now() : row.connected_at,
      disconnected_at: status === 'conectado' ? null : row.disconnected_at,
      last_event_at: now(),
      last_checked_at: now(),
      disconnect_reason: null,
      connection_status_code: null,
      last_error: null,
    });
    await writeAudit(req, { action: 'whatsapp.conectar', resource: 'configuracoes_whatsapp', resourceId: row.id, details: { status } });
    return res.json({ data: { ...row, instance_name: undefined, qr } });
  } catch (error) {
    await saveManagedWhatsApp(req.auth.accountId, { status: 'erro', last_error: error.message }).catch(() => {});
    return res.status(502).json({ error: { message: error.message, details: error.details } });
  }
});

app.delete('/api/whatsapp/connection', requireAuth, requireAdmin, async (req, res) => {
  try {
    const row = await managedWhatsAppRow(req.auth.accountId);
    if (!row?.instance_name) return res.json({ data: { status: 'nao_configurado' } });
    try {
      await evolutionRequest(`/instance/logout/${encodeURIComponent(row.instance_name)}`, { method: 'DELETE' });
    } catch (error) {
      if (error.status !== 400 && error.status !== 404) throw error;
    }
    const updated = await saveManagedWhatsApp(req.auth.accountId, {
      status: 'desconectado',
      disconnected_at: now(),
      last_event_at: now(),
      last_checked_at: now(),
      disconnect_reason: 'user_requested',
      connection_status_code: null,
      last_error: null,
    });
    await writeAudit(req, { action: 'whatsapp.desconectar', resource: 'configuracoes_whatsapp', resourceId: updated.id });
    return res.json({ data: { status: 'desconectado' } });
  } catch (error) {
    return res.status(502).json({ error: { message: error.message } });
  }
});

async function createWhatsAppMessageLog(req, { phone, message, templateType, orderId }) {
  let template = null;
  if (templateType) {
    const [templates] = await pool.query(
      `SELECT id, updated_at FROM templates_mensagem
        WHERE user_id = ? AND tipo = ? AND COALESCE(ativo, 1) = 1 LIMIT 1`,
      [req.auth.accountId, templateType],
    );
    template = templates[0] || null;
  }

  if (orderId) {
    const [orders] = await pool.query(
      'SELECT id FROM ordens_servico WHERE id = ? AND user_id = ? LIMIT 1',
      [orderId, req.auth.accountId],
    );
    if (!orders[0]) {
      const error = new Error('Ordem de serviço inválida para este envio');
      error.status = 400;
      throw error;
    }
  }

  const id = uuid();
  const timestamp = now();
  await pool.query(
    `INSERT INTO whatsapp_mensagens_log
      (id, user_id, actor_user_id, ordem_servico_id, template_id, template_type,
       template_updated_at, telefone, mensagem, status, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processando', 'evolution', ?, ?)`,
    [
      id,
      req.auth.accountId,
      req.auth.userId,
      orderId || null,
      template?.id || null,
      templateType || null,
      template?.updated_at || null,
      normalizePhone(phone),
      message,
      timestamp,
      timestamp,
    ],
  );
  return id;
}

async function updateWhatsAppMessageLog(id, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  await pool.query(
    `UPDATE whatsapp_mensagens_log
        SET ${entries.map(([key]) => `\`${key}\` = ?`).join(', ')}, updated_at = ?
      WHERE id = ?`,
    [...entries.map(([, value]) => value), now(), id],
  );
}

function normalizePdfAttachment(value) {
  if (!value) return null;
  const mimeType = String(value.mime_type || '').toLowerCase();
  const fileName = String(value.file_name || 'ordem-de-servico.pdf')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .slice(0, 120);
  const dataBase64 = String(value.data_base64 || '').replace(/^data:application\/pdf;base64,/i, '');
  if (mimeType !== 'application/pdf' || !fileName.toLowerCase().endsWith('.pdf')) {
    const error = new Error('O anexo da OS deve ser um arquivo PDF');
    error.status = 400;
    throw error;
  }
  if (!dataBase64 || dataBase64.length > 8 * 1024 * 1024 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(dataBase64)) {
    const error = new Error('PDF da OS inválido ou maior que o limite permitido');
    error.status = 413;
    throw error;
  }
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || bytes.length > 6 * 1024 * 1024) {
    const error = new Error('PDF da OS inválido ou maior que o limite permitido');
    error.status = 400;
    throw error;
  }
  return { dataBase64: bytes.toString('base64'), mimeType, fileName };
}

app.post('/api/whatsapp/send', requireAuth, async (req, res) => {
  let messageLogId = null;
  let textSent = false;
  try {
    const phone = String(req.body.phone || '');
    const message = String(req.body.message || '').trim();
    const templateType = String(req.body.template_type || '').trim() || null;
    const orderId = String(req.body.ordem_id || '').trim() || null;
    const attachment = normalizePdfAttachment(req.body.attachment);
    if (!validatePhone(phone) || !message || message.length > 5000) {
      return res.status(400).json({ error: { message: 'Telefone ou mensagem inválidos' } });
    }
    if (templateType && !MESSAGE_TEMPLATE_TYPES.has(templateType)) {
      return res.status(400).json({ error: { message: 'Tipo de template inválido' } });
    }

    messageLogId = await createWhatsAppMessageLog(req, { phone, message, templateType, orderId });
    const config = await loadWhatsAppConfig(req.auth.accountId);
    if (config?.method === 'webhook' && config.webhook_url) {
      await ensureWhatsAppConnected(req.auth.accountId);
      const providerResult = await sendEvaluationViaEvolution(phone, message, config);
      textSent = true;
      const attachmentResult = attachment
        ? await sendMediaViaEvolution(phone, attachment, config)
        : null;
      await updateWhatsAppMessageLog(messageLogId, {
        status: 'enviado',
        provider_message_id: providerResult.providerMessageId,
        erro: null,
      });
      await writeAudit(req, {
        action: 'whatsapp.enviar',
        resource: 'mensagem',
        resourceId: messageLogId,
        details: { phone: normalizePhone(phone), method: 'webhook', template_type: templateType, ordem_id: orderId, pdf: Boolean(attachment) },
      });
      return res.json({ data: { sent: true, method: 'webhook', log_id: messageLogId, attachment_message_id: attachmentResult?.providerMessageId || null } });
    }
    const directUrl = `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
    await updateWhatsAppMessageLog(messageLogId, { status: 'preparado', provider: 'direct', erro: null });
    await writeAudit(req, {
      action: 'whatsapp.preparar',
      resource: 'mensagem',
      resourceId: messageLogId,
      details: { phone: normalizePhone(phone), method: 'direct', template_type: templateType, ordem_id: orderId, pdf_download: Boolean(attachment) },
    });
    return res.json({ data: { sent: true, method: 'direct', direct_url: directUrl, log_id: messageLogId, attachment_download: Boolean(attachment) } });
  } catch (error) {
    if (messageLogId) {
      await updateWhatsAppMessageLog(messageLogId, { status: 'erro', erro: error.message }).catch(() => {});
    }
    const message = textSent
      ? 'A mensagem foi enviada, mas não foi possível anexar o PDF da OS. Tente enviar o PDF novamente.'
      : error.message || 'Falha ao enviar mensagem';
    res.status(error.status || 502).json({ error: { message, partial_success: textSent } });
  }
});

app.get('/api/whatsapp/conversations', requireAuth, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [req.auth.accountId];
    let searchSql = '';
    if (search) {
      searchSql = ' AND (c.nome LIKE ? OR wc.nome_contato LIKE ? OR wc.telefone LIKE ?)';
      params.push(...Array(3).fill(`%${search}%`));
    }
    const [rows] = await pool.query(
      `SELECT wc.*, c.nome AS cliente_nome, o.numero AS ordem_numero
         FROM whatsapp_conversas wc
         LEFT JOIN clientes c ON c.id=wc.cliente_id AND c.user_id=wc.user_id
         LEFT JOIN ordens_servico o ON o.id=wc.ordem_servico_id AND o.user_id=wc.user_id
        WHERE wc.user_id=?${searchSql}
        ORDER BY COALESCE(wc.ultima_mensagem_em,wc.updated_at) DESC LIMIT 200`, params,
    );
    return res.json({ data: rows });
  } catch (error) { return res.status(500).json({ error: { message: error.message } }); }
});

app.post('/api/whatsapp/conversations', requireAuth, async (req, res) => {
  try {
    const clientId = String(req.body.cliente_id || '').trim();
    if (!clientId) return res.status(400).json({ error: { message: 'Selecione um cliente' } });
    const [[client]] = await pool.query('SELECT id,nome,telefone FROM clientes WHERE id=? AND user_id=? LIMIT 1', [clientId, req.auth.accountId]);
    if (!client || !validatePhone(client.telefone)) return res.status(400).json({ error: { message: 'Cliente sem telefone válido' } });
    let orderId = String(req.body.ordem_servico_id || '').trim() || null;
    if (orderId) {
      const [[order]] = await pool.query('SELECT id FROM ordens_servico WHERE id=? AND cliente_id=? AND user_id=? LIMIT 1', [orderId, client.id, req.auth.accountId]);
      if (!order) orderId = null;
    }
    const conversation = await ensureWhatsAppConversation(req.auth.accountId, { phone: client.telefone, pushName: client.nome, clientId: client.id, orderId });
    return res.status(201).json({ data: conversation });
  } catch (error) { return res.status(500).json({ error: { message: error.message } }); }
});

app.get('/api/whatsapp/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const [[conversation]] = await pool.query('SELECT * FROM whatsapp_conversas WHERE id=? AND user_id=? LIMIT 1', [req.params.id, req.auth.accountId]);
    if (!conversation) return res.status(404).json({ error: { message: 'Conversa não encontrada' } });
    const before = String(req.query.before || '').trim();
    const params = [req.auth.accountId, conversation.id];
    let beforeSql = '';
    if (before) { beforeSql = ' AND enviada_em < ?'; params.push(before); }
    const [messages] = await pool.query(
      `SELECT wm.id,wm.conversa_id,wm.cliente_id,wm.ordem_servico_id,wm.provider_message_id,wm.direcao,wm.tipo,wm.conteudo,wm.status,
              wm.from_me,wm.enviada_pelo_sistema,wm.mensagem_referencia_id,wm.enviada_em,wm.entregue_em,wm.lida_em,wm.apagada_em,wm.created_at,
              (SELECT wa.id FROM whatsapp_anexos wa WHERE wa.mensagem_id=wm.id AND wa.user_id=wm.user_id LIMIT 1) AS anexo_id,
              (SELECT wa.nome_arquivo FROM whatsapp_anexos wa WHERE wa.mensagem_id=wm.id AND wa.user_id=wm.user_id LIMIT 1) AS anexo_nome
         FROM whatsapp_mensagens wm WHERE wm.user_id=? AND wm.conversa_id=?${beforeSql.replaceAll('enviada_em', 'wm.enviada_em')}
        ORDER BY wm.enviada_em DESC LIMIT 100`, params,
    );
    return res.json({ data: messages.reverse() });
  } catch (error) { return res.status(500).json({ error: { message: error.message } }); }
});

app.get('/api/whatsapp/attachments/:id', requireAuth, async (req, res) => {
  const [[attachment]] = await pool.query('SELECT tipo_mime,nome_arquivo,conteudo FROM whatsapp_anexos WHERE id=? AND user_id=? LIMIT 1', [req.params.id, req.auth.accountId]);
  if (!attachment?.conteudo) return res.status(404).json({ error: { message: 'Anexo não encontrado ou não arquivado' } });
  res.setHeader('Content-Type', attachment.tipo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${String(attachment.nome_arquivo || 'anexo').replace(/["\r\n]/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.send(attachment.conteudo);
});

app.post('/api/whatsapp/conversations/:id/messages', requireAuth, async (req, res) => {
  const content = String(req.body.conteudo || '').trim();
  if (!content || content.length > 5000) return res.status(400).json({ error: { message: 'Mensagem inválida' } });
  let localId = null;
  try {
    const [[conversation]] = await pool.query('SELECT * FROM whatsapp_conversas WHERE id=? AND user_id=? LIMIT 1', [req.params.id, req.auth.accountId]);
    if (!conversation) return res.status(404).json({ error: { message: 'Conversa não encontrada' } });
    await ensureWhatsAppConnected(req.auth.accountId);
    const config = await loadWhatsAppConfig(req.auth.accountId);
    localId = uuid();
    const timestamp = now();
    await pool.query(
      `INSERT INTO whatsapp_mensagens
       (id,user_id,conversa_id,cliente_id,ordem_servico_id,direcao,tipo,conteudo,status,from_me,enviada_pelo_sistema,enviada_em,created_at,updated_at)
       VALUES (?,?,?,?,?,'saida','texto',?,'processando',1,1,?,?,?)`,
      [localId, req.auth.accountId, conversation.id, conversation.cliente_id, conversation.ordem_servico_id, content, timestamp, timestamp, timestamp],
    );
    const provider = await sendEvaluationViaEvolution(conversation.telefone, content, config);
    try {
      await pool.query("UPDATE whatsapp_mensagens SET provider_message_id=?,status='enviada',updated_at=? WHERE id=?", [provider.providerMessageId || null, now(), localId]);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || !provider.providerMessageId) throw error;
      const [[archived]] = await pool.query('SELECT id FROM whatsapp_mensagens WHERE user_id=? AND provider_message_id=? LIMIT 1', [req.auth.accountId, provider.providerMessageId]);
      if (!archived) throw error;
      await pool.query('UPDATE whatsapp_mensagens SET actor_user_id=?,ordem_servico_id=?,enviada_pelo_sistema=1,status=\'enviada\',updated_at=? WHERE id=?', [req.auth.userId, conversation.ordem_servico_id, now(), archived.id]);
      await pool.query('DELETE FROM whatsapp_mensagens WHERE id=? AND user_id=?', [localId, req.auth.accountId]);
      localId = archived.id;
    }
    await pool.query('UPDATE whatsapp_conversas SET ultima_mensagem=?,ultima_mensagem_em=?,updated_at=? WHERE id=?', [content, timestamp, timestamp, conversation.id]);
    await writeAudit(req, { action: 'whatsapp.conversa_enviar', resource: 'whatsapp_conversas', resourceId: conversation.id, details: { mensagem_id: localId, ordem_id: conversation.ordem_servico_id } });
    return res.status(201).json({ data: { id: localId, conversa_id: conversation.id, conteudo: content, direcao: 'saida', tipo: 'texto', status: 'enviada', enviada_em: timestamp, enviada_pelo_sistema: 1 } });
  } catch (error) {
    if (localId) await pool.query("UPDATE whatsapp_mensagens SET status='erro',updated_at=? WHERE id=?", [now(), localId]).catch(() => {});
    return res.status(error.status || 502).json({ error: { message: error.message } });
  }
});

app.patch('/api/whatsapp/conversations/:id', requireAuth, async (req, res) => {
  try {
    const orderId = String(req.body.ordem_servico_id || '').trim() || null;
    if (orderId) {
      const [[order]] = await pool.query('SELECT id FROM ordens_servico WHERE id=? AND user_id=? LIMIT 1', [orderId, req.auth.accountId]);
      if (!order) return res.status(400).json({ error: { message: 'Ordem de serviço inválida' } });
    }
    await pool.query('UPDATE whatsapp_conversas SET ordem_servico_id=?,status=?,updated_at=? WHERE id=? AND user_id=?', [orderId, req.body.status === 'fechada' ? 'fechada' : 'aberta', now(), req.params.id, req.auth.accountId]);
    return res.json({ data: { updated: true } });
  } catch (error) { return res.status(500).json({ error: { message: error.message } }); }
});

app.post('/api/whatsapp/conversations/:id/read', requireAuth, async (req, res) => {
  await pool.query('UPDATE whatsapp_conversas SET nao_lidas=0,updated_at=? WHERE id=? AND user_id=?', [now(), req.params.id, req.auth.accountId]);
  return res.json({ data: { read: true } });
});

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function completedOrderDate(order) {
  return order.data_entrega || order.data_previsao;
}

async function markRemarketingConversion(connection, userId, order) {
  if (!order?.id || !order?.cliente_id) return;
  const params = [userId, order.cliente_id, order.id];
  let instrumentSql = '';
  if (order.instrumento_id) {
    instrumentSql = ' AND rl.instrumento_id=?';
    params.push(order.instrumento_id);
  } else if (order.equipamento_id) {
    instrumentSql = ' AND rl.equipamento_id=?';
    params.push(order.equipamento_id);
  } else if (String(order.modelo || '').trim()) {
    instrumentSql = ' AND LOWER(TRIM(o.modelo))=LOWER(TRIM(?))';
    params.push(String(order.modelo).trim());
  } else {
    return;
  }
  const [[reminder]] = await connection.query(
    `SELECT rl.id FROM remarketing_lembretes rl
       JOIN ordens_servico o ON o.id=rl.ordem_servico_id AND o.user_id=rl.user_id
      WHERE rl.user_id=? AND rl.cliente_id=? AND rl.ordem_servico_id<>?
        AND rl.status IN ('enviado','respondido')${instrumentSql}
      ORDER BY rl.data_envio DESC LIMIT 1`,
    params,
  );
  if (!reminder) return;
  const timestamp = now();
  await connection.query(
    `UPDATE remarketing_lembretes SET status='convertido',convertido_em=?,ordem_conversao_id=?,updated_at=? WHERE id=? AND user_id=?`,
    [timestamp, order.id, timestamp, reminder.id, userId],
  );
}

function renderRemarketingMessage(template, opportunity) {
  const months = Math.max(1, Math.floor(Number(opportunity.dias_sem_manutencao || 0) / 30));
  const instrument = [opportunity.instrumento_nome || opportunity.equipamento_nome, opportunity.marca_nome, opportunity.modelo]
    .filter(Boolean).join(' ') || 'instrumento';
  return String(template || REMARKETING_DEFAULT_MESSAGE)
    .replaceAll('{{nome}}', String(opportunity.cliente_nome || '').split(' ')[0] || 'cliente')
    .replaceAll('{{cliente}}', opportunity.cliente_nome || 'cliente')
    .replaceAll('{{instrumento}}', instrument)
    .replaceAll('{{meses}}', String(months))
    .replaceAll('{{dias}}', String(opportunity.dias_sem_manutencao || 0));
}

async function ensureRemarketingCampaign(userId) {
  const [[existing]] = await pool.query('SELECT * FROM remarketing_campanhas WHERE user_id=? LIMIT 1', [userId]);
  if (existing) return existing;
  const id = uuid();
  const timestamp = now();
  await pool.query(
    `INSERT INTO remarketing_campanhas
      (id,user_id,nome,ativo,automatico,dias_sem_manutencao,horario_envio,limite_diario,intervalo_minimo_segundos,intervalo_cliente_dias,max_tentativas,mensagem,created_at,updated_at)
     VALUES (?,?,'Manutenção preventiva',1,0,180,10,10,60,90,2,?,?,?)`,
    [id, userId, REMARKETING_DEFAULT_MESSAGE, timestamp, timestamp],
  );
  const [[campaign]] = await pool.query('SELECT * FROM remarketing_campanhas WHERE id=? LIMIT 1', [id]);
  return campaign;
}

async function getRemarketingOpportunities(userId, campaign) {
  const [orders] = await pool.query(
    `SELECT o.id AS ordem_servico_id,o.numero AS ordem_numero,o.cliente_id,o.instrumento_id,o.equipamento_id,o.marca_id,
            o.modelo,o.data_entrega,o.data_previsao,
            c.nome AS cliente_nome,c.telefone AS cliente_telefone,
            i.nome AS instrumento_nome,e.nome AS equipamento_nome,m.nome AS marca_nome,
            cp.lembretes_manutencao_autorizado,cp.origem_consentimento,cp.consentido_em,cp.descadastrado_em,
            rl.id AS lembrete_id,rl.status AS lembrete_status,rl.tentativas,rl.data_envio,rl.mensagem_erro
       FROM ordens_servico o
       JOIN clientes c ON c.id=o.cliente_id AND c.user_id=o.user_id
       LEFT JOIN instrumentos i ON i.id=o.instrumento_id AND i.user_id=o.user_id
       LEFT JOIN equipamentos e ON e.id=o.equipamento_id AND e.user_id=o.user_id
       LEFT JOIN marcas m ON m.id=o.marca_id AND m.user_id=o.user_id
       LEFT JOIN comunicacao_preferencias cp ON cp.user_id=o.user_id AND cp.cliente_id=o.cliente_id
       LEFT JOIN remarketing_lembretes rl ON rl.user_id=o.user_id AND rl.campanha_id=? AND rl.ordem_servico_id=o.id
      WHERE o.user_id=? AND o.status='concluido'
      ORDER BY DATE(COALESCE(NULLIF(o.data_entrega,''),NULLIF(o.data_previsao,''))) ASC
      LIMIT 5000`,
    [campaign.id, userId],
  );
  const excluded = [];
  const today = Date.now();
  const opportunities = [];
  const includedClients = new Set();
  for (const order of orders) {
    const maintenanceDate = completedOrderDate(order);
    const date = new Date(maintenanceDate);
    if (!maintenanceDate || Number.isNaN(date.valueOf())) {
      excluded.push({ ...order, data_ultima_manutencao: maintenanceDate || null, exclusion_code: 'data_invalida', exclusion_reason: 'A OS não possui uma data de manutenção válida.' });
      continue;
    }
    const days = Math.max(0, Math.floor((today - date.valueOf()) / 86_400_000));
    const base = { ...order, data_ultima_manutencao: maintenanceDate, dias_sem_manutencao: days };
    if (days < Number(campaign.dias_sem_manutencao)) {
      excluded.push({ ...base, exclusion_code: 'prazo_nao_atingido', exclusion_reason: `A manutenção mais recente ainda não atingiu ${campaign.dias_sem_manutencao} dias.` });
      continue;
    }
    if (!validatePhone(order.cliente_telefone)) {
      excluded.push({ ...base, exclusion_code: 'telefone_invalido', exclusion_reason: 'O cliente não possui um telefone válido para WhatsApp.' });
      continue;
    }
    if (order.lembrete_status && REMARKETING_FINAL_STATUSES.has(order.lembrete_status)) {
      excluded.push({ ...base, exclusion_code: 'ciclo_contatado', exclusion_reason: `Este ciclo já foi processado (${order.lembrete_status}).` });
      continue;
    }
    if (Number(order.tentativas || 0) >= Number(campaign.max_tentativas || 2)) {
      excluded.push({ ...base, exclusion_code: 'limite_tentativas', exclusion_reason: 'O limite de tentativas deste ciclo foi atingido.' });
      continue;
    }
    if (includedClients.has(order.cliente_id)) {
      excluded.push({ ...base, exclusion_code: 'cliente_ja_incluido', exclusion_reason: 'O cliente já possui outra OS nesta fila; apenas uma mensagem é preparada por cliente.' });
      continue;
    }
    const consentStatus = order.descadastrado_em
      ? 'descadastrado'
      : Number(order.lembretes_manutencao_autorizado) === 1 ? 'autorizado' : 'nao_autorizado';
    opportunities.push({ ...base, consentimento: consentStatus });
    includedClients.add(order.cliente_id);
  }
  return { opportunities, excluded };
}

async function remarketingProviderStatus(userId) {
  const config = await loadWhatsAppConfig(userId);
  const official = ['meta', 'meta_cloud', 'whatsapp_cloud'].includes(String(config?.provider || '').toLowerCase());
  return {
    provider: config?.provider || 'nao_configurado',
    connected: config?.status === 'conectado',
    official,
    // O conector oficial ainda precisa ser configurado antes de existir um worker
    // autorizado a iniciar conversas com templates aprovados.
    automaticAllowed: false,
    manualSingleAllowed: Boolean(String(config?.provider || '').toLowerCase() === 'evolution'
      && config?.method === 'webhook' && config?.webhook_url && config?.status === 'conectado'),
  };
}

app.get('/api/remarketing/overview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.auth.accountId;
    const campaign = await ensureRemarketingCampaign(userId);
    const [eligibility, providerStatus, [history], [[historyStats]]] = await Promise.all([
      getRemarketingOpportunities(userId, campaign),
      remarketingProviderStatus(userId),
      pool.query(
        `SELECT rl.*,c.nome AS cliente_nome,c.telefone AS cliente_telefone,o.numero AS ordem_numero,o.modelo,
                i.nome AS instrumento_nome,e.nome AS equipamento_nome,m.nome AS marca_nome
           FROM remarketing_lembretes rl
           JOIN clientes c ON c.id=rl.cliente_id AND c.user_id=rl.user_id
           JOIN ordens_servico o ON o.id=rl.ordem_servico_id AND o.user_id=rl.user_id
           LEFT JOIN instrumentos i ON i.id=o.instrumento_id AND i.user_id=o.user_id
           LEFT JOIN equipamentos e ON e.id=o.equipamento_id AND e.user_id=o.user_id
           LEFT JOIN marcas m ON m.id=o.marca_id AND m.user_id=o.user_id
          WHERE rl.user_id=? ORDER BY rl.created_at DESC LIMIT 200`,
        [userId],
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                SUM(status='enviado') AS enviados,SUM(status='respondido') AS respondidos,
                SUM(status='convertido') AS convertidos,SUM(status='erro') AS erros,
                SUM(status='descadastrado') AS descadastrados
           FROM remarketing_lembretes WHERE user_id=?`,
        [userId],
      ),
    ]);
    const { opportunities, excluded } = eligibility;
    const authorized = opportunities.filter((item) => item.consentimento === 'autorizado').length;
    return res.json({ data: {
      campaign,
      provider: providerStatus,
      opportunities,
      excluded,
      history,
      stats: {
        elegiveis: opportunities.length,
        autorizados: authorized,
        enviados: Number(historyStats.enviados || 0),
        respondidos: Number(historyStats.respondidos || 0),
        convertidos: Number(historyStats.convertidos || 0),
        erros: Number(historyStats.erros || 0),
        descadastrados: Number(historyStats.descadastrados || 0),
      },
    } });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.put('/api/remarketing/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.auth.accountId;
    const campaign = await ensureRemarketingCampaign(userId);
    const provider = await remarketingProviderStatus(userId);
    const automaticRequested = req.body.automatico === true || req.body.automatico === 1;
    if (automaticRequested && !provider.automaticAllowed) {
      return res.status(409).json({ error: { message: 'O envio automático exige uma conexão oficial da Plataforma WhatsApp Business.' } });
    }
    const message = String(req.body.mensagem || campaign.mensagem || '').trim();
    if (!message || message.length > 3000) return res.status(400).json({ error: { message: 'A mensagem deve ter entre 1 e 3000 caracteres.' } });
    const values = {
      nome: String(req.body.nome || campaign.nome).trim().slice(0, 255) || 'Manutenção preventiva',
      ativo: req.body.ativo === false || req.body.ativo === 0 ? 0 : 1,
      automatico: automaticRequested ? 1 : 0,
      dias: clampInteger(req.body.dias_sem_manutencao, 30, 1460, Number(campaign.dias_sem_manutencao)),
      hour: clampInteger(req.body.horario_envio, 0, 23, Number(campaign.horario_envio)),
      limit: clampInteger(req.body.limite_diario, 1, 100, Number(campaign.limite_diario)),
      interval: clampInteger(req.body.intervalo_minimo_segundos, 30, 3600, Number(campaign.intervalo_minimo_segundos)),
      cooldown: clampInteger(req.body.intervalo_cliente_dias, 30, 730, Number(campaign.intervalo_cliente_dias)),
      attempts: clampInteger(req.body.max_tentativas, 1, 5, Number(campaign.max_tentativas)),
    };
    await pool.query(
      `UPDATE remarketing_campanhas SET nome=?,ativo=?,automatico=?,dias_sem_manutencao=?,horario_envio=?,limite_diario=?,
              intervalo_minimo_segundos=?,intervalo_cliente_dias=?,max_tentativas=?,mensagem=?,updated_at=? WHERE id=? AND user_id=?`,
      [values.nome, values.ativo, values.automatico, values.dias, values.hour, values.limit, values.interval,
        values.cooldown, values.attempts, message, now(), campaign.id, userId],
    );
    await writeAudit(req, { action: 'remarketing.configurar', resource: 'remarketing_campanhas', resourceId: campaign.id, details: values });
    const [[updated]] = await pool.query('SELECT * FROM remarketing_campanhas WHERE id=? LIMIT 1', [campaign.id]);
    return res.json({ data: updated });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.put('/api/remarketing/clients/:clientId/consent', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.auth.accountId;
    const [[client]] = await pool.query('SELECT id FROM clientes WHERE id=? AND user_id=? LIMIT 1', [req.params.clientId, userId]);
    if (!client) return res.status(404).json({ error: { message: 'Cliente não encontrado.' } });
    const authorized = req.body.autorizado === true || req.body.autorizado === 1;
    const optedOut = req.body.descadastrado === true || String(req.body.origem || '') === 'whatsapp_optout';
    const timestamp = now();
    await pool.query(
      `INSERT INTO comunicacao_preferencias
        (id,user_id,cliente_id,lembretes_manutencao_autorizado,origem_consentimento,consentido_em,descadastrado_em,motivo_descadastro,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE lembretes_manutencao_autorizado=VALUES(lembretes_manutencao_autorizado),
         origem_consentimento=VALUES(origem_consentimento),consentido_em=VALUES(consentido_em),
         descadastrado_em=VALUES(descadastrado_em),motivo_descadastro=VALUES(motivo_descadastro),updated_at=VALUES(updated_at)`,
      [uuid(), userId, client.id, authorized && !optedOut ? 1 : 0, String(req.body.origem || 'registrado_no_sistema').slice(0, 100),
        authorized && !optedOut ? timestamp : null, optedOut ? timestamp : null, optedOut ? String(req.body.motivo || 'Solicitado pelo cliente').slice(0, 255) : null,
        timestamp, timestamp],
    );
    await writeAudit(req, { action: authorized && !optedOut ? 'remarketing.consentir' : 'remarketing.descadastrar', resource: 'clientes', resourceId: client.id, details: { origem: req.body.origem || 'registrado_no_sistema' } });
    return res.json({ data: { cliente_id: client.id, autorizado: authorized && !optedOut, descadastrado: optedOut } });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/remarketing/send/:orderId', requireAuth, requireAdmin, async (req, res) => {
  let reminderId = null;
  let localMessageId = null;
  let providerSent = false;
  try {
    const userId = req.auth.accountId;
    const campaign = await ensureRemarketingCampaign(userId);
    if (!Number(campaign.ativo)) return res.status(409).json({ error: { message: 'A campanha está pausada.' } });
    const providerStatus = await remarketingProviderStatus(userId);
    if (!providerStatus.manualSingleAllowed) return res.status(409).json({ error: { message: 'Conecte o WhatsApp antes de enviar.' } });
    const eligibility = await getRemarketingOpportunities(userId, campaign);
    const opportunity = eligibility.opportunities.find((item) => item.ordem_servico_id === req.params.orderId);
    if (!opportunity) return res.status(409).json({ error: { message: 'Esta manutenção não está mais elegível. Atualize a lista.' } });
    if (opportunity.consentimento !== 'autorizado') {
      return res.status(409).json({ error: { message: 'Registre a autorização do cliente antes do envio.' } });
    }
    if (!validatePhone(opportunity.cliente_telefone)) return res.status(400).json({ error: { message: 'O cliente não possui telefone válido.' } });
    const today = todayDate();
    const [[daily]] = await pool.query(
      `SELECT COUNT(*) AS total FROM remarketing_lembretes WHERE user_id=? AND LEFT(data_envio,10)=? AND status IN ('enviado','respondido','convertido')`,
      [userId, today],
    );
    if (Number(daily.total || 0) >= Number(campaign.limite_diario)) {
      return res.status(429).json({ error: { message: `Limite diário de ${campaign.limite_diario} envios atingido.` } });
    }
    const [[lastSent]] = await pool.query(
      `SELECT data_envio FROM remarketing_lembretes WHERE user_id=? AND data_envio IS NOT NULL ORDER BY data_envio DESC LIMIT 1`,
      [userId],
    );
    if (lastSent?.data_envio) {
      const elapsed = Date.now() - new Date(lastSent.data_envio).valueOf();
      const minimum = Number(campaign.intervalo_minimo_segundos) * 1000;
      if (elapsed < minimum) return res.status(429).json({ error: { message: `Aguarde ${Math.ceil((minimum - elapsed) / 1000)} segundos para o próximo envio.` } });
    }
    const [[recentClient]] = await pool.query(
      `SELECT data_envio FROM remarketing_lembretes WHERE user_id=? AND cliente_id=? AND data_envio IS NOT NULL
        AND status IN ('enviado','respondido','convertido') ORDER BY data_envio DESC LIMIT 1`,
      [userId, opportunity.cliente_id],
    );
    if (recentClient?.data_envio) {
      const cooldown = Number(campaign.intervalo_cliente_dias) * 86_400_000;
      if (Date.now() - new Date(recentClient.data_envio).valueOf() < cooldown) {
        return res.status(429).json({ error: { message: `Este cliente já foi contatado nos últimos ${campaign.intervalo_cliente_dias} dias.` } });
      }
    }
    const message = renderRemarketingMessage(campaign.mensagem, opportunity);
    const timestamp = now();
    reminderId = opportunity.lembrete_id || uuid();
    if (opportunity.lembrete_id) {
      const [update] = await pool.query(
        `UPDATE remarketing_lembretes SET status='processando',tentativas=tentativas+1,mensagem=?,mensagem_erro=NULL,updated_at=?
          WHERE id=? AND user_id=? AND status='erro' AND tentativas<?`,
        [message, timestamp, reminderId, userId, campaign.max_tentativas],
      );
      if (!update.affectedRows) return res.status(409).json({ error: { message: 'Este lembrete já está sendo processado ou foi enviado.' } });
    } else {
      await pool.query(
        `INSERT INTO remarketing_lembretes
          (id,user_id,campanha_id,cliente_id,ordem_servico_id,instrumento_id,equipamento_id,telefone,mensagem,status,tentativas,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'processando',1,?,?)`,
        [reminderId, userId, campaign.id, opportunity.cliente_id, opportunity.ordem_servico_id, opportunity.instrumento_id,
          opportunity.equipamento_id, opportunity.cliente_telefone, message, timestamp, timestamp],
      );
    }
    const config = await loadWhatsAppConfig(userId);
    await ensureWhatsAppConnected(userId);
    const conversation = await ensureWhatsAppConversation(userId, {
      phone: opportunity.cliente_telefone,
      pushName: opportunity.cliente_nome,
      clientId: opportunity.cliente_id,
      orderId: opportunity.ordem_servico_id,
    });
    localMessageId = uuid();
    await pool.query(
      `INSERT INTO whatsapp_mensagens
       (id,user_id,conversa_id,cliente_id,ordem_servico_id,actor_user_id,direcao,tipo,conteudo,status,from_me,enviada_pelo_sistema,enviada_em,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'saida','texto',?,'processando',1,1,?,?,?)`,
      [localMessageId, userId, conversation.id, opportunity.cliente_id, opportunity.ordem_servico_id, req.auth.userId, message, timestamp, timestamp, timestamp],
    );
    const sent = await sendEvaluationViaEvolution(opportunity.cliente_telefone, message, config);
    providerSent = true;
    try {
      await pool.query("UPDATE whatsapp_mensagens SET provider_message_id=?,status='enviada',updated_at=? WHERE id=?", [sent.providerMessageId || null, now(), localMessageId]);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || !sent.providerMessageId) throw error;
      const [[archived]] = await pool.query('SELECT id FROM whatsapp_mensagens WHERE user_id=? AND provider_message_id=? LIMIT 1', [userId, sent.providerMessageId]);
      if (!archived) throw error;
      await pool.query("UPDATE whatsapp_mensagens SET actor_user_id=?,ordem_servico_id=?,enviada_pelo_sistema=1,status='enviada',updated_at=? WHERE id=?", [req.auth.userId, opportunity.ordem_servico_id, now(), archived.id]);
      await pool.query('DELETE FROM whatsapp_mensagens WHERE id=? AND user_id=?', [localMessageId, userId]);
      localMessageId = archived.id;
    }
    await pool.query('UPDATE whatsapp_conversas SET ultima_mensagem=?,ultima_mensagem_em=?,updated_at=? WHERE id=?', [message, timestamp, timestamp, conversation.id]);
    await pool.query(
      `UPDATE remarketing_lembretes SET conversa_id=?,whatsapp_mensagem_id=?,status='enviado',data_envio=?,updated_at=? WHERE id=? AND user_id=?`,
      [conversation.id, localMessageId, timestamp, timestamp, reminderId, userId],
    );
    await writeAudit(req, { action: 'remarketing.enviar_manual', resource: 'remarketing_lembretes', resourceId: reminderId, details: { cliente_id: opportunity.cliente_id, ordem_id: opportunity.ordem_servico_id, provider: providerStatus.provider } });
    return res.status(201).json({ data: { id: reminderId, status: 'enviado', conversa_id: conversation.id, data_envio: timestamp } });
  } catch (error) {
    if (localMessageId) await pool.query('UPDATE whatsapp_mensagens SET status=?,updated_at=? WHERE id=?', [providerSent ? 'enviada' : 'erro', now(), localMessageId]).catch(() => {});
    if (reminderId) await pool.query(
      `UPDATE remarketing_lembretes SET status=?,data_envio=CASE WHEN ? THEN COALESCE(data_envio,?) ELSE data_envio END,
              mensagem_erro=?,updated_at=? WHERE id=?`,
      [providerSent ? 'enviado' : 'erro', providerSent ? 1 : 0, now(), providerSent ? `Mensagem enviada; falha ao concluir o arquivamento: ${error.message}` : error.message, now(), reminderId],
    ).catch(() => {});
    if (providerSent) {
      return res.status(502).json({ error: { message: 'A mensagem foi enviada, mas o histórico não foi concluído. Não tente novamente.', partial_success: true } });
    }
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : error.status || 500;
    return res.status(status).json({ error: { message: error.code === 'ER_DUP_ENTRY' ? 'Este lembrete já foi reservado por outro envio.' : error.message } });
  }
});

function monthRange(dateOnly) {
  const [year, month] = String(dateOnly).split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start, next };
}

app.get('/api/dashboard/resumo', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.accountId;
    const includeFinancial = req.auth.role === 'admin';
    const today = todayDate();
    const nextWeek = addDaysToIsoDate(today, 7);
    const month = monthRange(today);
    const activeStatuses = "'pendente','em_andamento','atraso'";
    const overdueCondition = `(o.status = 'atraso' OR (o.status IN ('pendente','em_andamento') AND LEFT(o.data_previsao,10) < ?))`;

    const orderSummaryPromise = pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) AS pendentes,
         SUM(CASE WHEN status='em_andamento' THEN 1 ELSE 0 END) AS em_andamento,
         SUM(CASE WHEN status='concluido' AND LEFT(COALESCE(data_entrega,updated_at),10)>=? AND LEFT(COALESCE(data_entrega,updated_at),10)<? THEN 1 ELSE 0 END) AS concluidas_mes,
         SUM(CASE WHEN status IN (${activeStatuses}) AND LEFT(data_previsao,10)=? THEN 1 ELSE 0 END) AS entregas_hoje,
         SUM(CASE WHEN status='atraso' OR (status IN ('pendente','em_andamento') AND LEFT(data_previsao,10)<?) THEN 1 ELSE 0 END) AS atrasadas
       FROM ordens_servico WHERE user_id=?`,
      [month.start, month.next, today, today, userId],
    );
    const agendaPromise = pool.query(
      `SELECT o.id,o.numero,o.status,o.data_previsao,o.modelo,c.nome AS cliente_nome,
              COALESCE(i.nome,'Equipamento') AS instrumento_nome,COALESCE(m.nome,'') AS marca_nome
         FROM ordens_servico o JOIN clientes c ON c.id=o.cliente_id
         LEFT JOIN instrumentos i ON i.id=o.instrumento_id LEFT JOIN marcas m ON m.id=o.marca_id
        WHERE o.user_id=? AND o.status IN (${activeStatuses}) AND LEFT(o.data_previsao,10) BETWEEN ? AND ?
        ORDER BY LEFT(o.data_previsao,10),o.numero LIMIT 12`,
      [userId, today, nextWeek],
    );
    const overdueOrdersPromise = pool.query(
      `SELECT o.id,o.numero,o.data_previsao,o.status,c.nome AS cliente_nome
         FROM ordens_servico o JOIN clientes c ON c.id=o.cliente_id
        WHERE o.user_id=? AND ${overdueCondition}
        ORDER BY LEFT(o.data_previsao,10),o.numero LIMIT 5`,
      [userId, today],
    );
    const attentionCountsPromise = pool.query(
      `SELECT
        (SELECT COUNT(*) FROM os_aditivos WHERE user_id=? AND status='enviado') AS aditivos_aguardando,
        (SELECT COALESCE(SUM(nao_lidas),0) FROM whatsapp_conversas WHERE user_id=? AND status='aberta') AS mensagens_nao_lidas,
        (SELECT COUNT(*) FROM avaliacoes_lembretes WHERE user_id=? AND status='erro') AS avaliacoes_com_erro`,
      [userId, userId, userId],
    );
    const orderHistoryPromise = pool.query(
      `SELECT h.id,h.evento AS tipo,h.descricao,h.created_at,o.numero AS ordem_numero
         FROM os_historico h LEFT JOIN ordens_servico o ON o.id=h.ordem_servico_id
        WHERE h.user_id=? ORDER BY h.created_at DESC LIMIT 8`, [userId],
    );
    const messageActivityPromise = pool.query(
      `SELECT wm.id,'mensagem_recebida' AS tipo,
              CONCAT('Mensagem de ',COALESCE(c.nome,wc.nome_contato,wc.telefone)) AS descricao,
              wm.enviada_em AS created_at,o.numero AS ordem_numero
         FROM whatsapp_mensagens wm JOIN whatsapp_conversas wc ON wc.id=wm.conversa_id
         LEFT JOIN clientes c ON c.id=wc.cliente_id LEFT JOIN ordens_servico o ON o.id=wm.ordem_servico_id
        WHERE wm.user_id=? AND wm.direcao='entrada' ORDER BY wm.enviada_em DESC LIMIT 5`, [userId],
    );

    const [orderSummaryResult, agendaResult, overdueOrdersResult, attentionResult, historyResult, messageResult] = await Promise.all([
      orderSummaryPromise, agendaPromise, overdueOrdersPromise, attentionCountsPromise, orderHistoryPromise, messageActivityPromise,
    ]);
    const summary = orderSummaryResult[0][0] || {};
    const agenda = agendaResult[0];
    const overdueOrders = overdueOrdersResult[0];
    const attention = attentionResult[0][0] || {};
    let financial = null;
    let overdueReceivables = [];
    let paymentActivity = [];
    if (includeFinancial) {
      await reconcileReceivables(pool, userId);
      const [financialResult, receivablesResult, paymentsResult] = await Promise.all([
        pool.query(
          `SELECT
            (SELECT COALESCE(SUM(valor),0) FROM transacoes_financeiras WHERE user_id=? AND tipo='receita' AND LEFT(data,10)>=? AND LEFT(data,10)<?) AS recebido_mes,
            (SELECT COALESCE(SUM(GREATEST(valor-COALESCE(valor_recebido,0),0)),0) FROM contas_receber WHERE user_id=? AND status IN ('pendente','parcial','atrasado')) AS a_receber,
            (SELECT COALESCE(SUM(GREATEST(valor-COALESCE(valor_recebido,0),0)),0) FROM contas_receber WHERE user_id=? AND status IN ('pendente','parcial','atrasado') AND LEFT(data_vencimento,10)>=? AND LEFT(data_vencimento,10)<?) AS a_receber_mes,
            (SELECT COALESCE(SUM(GREATEST(valor-COALESCE(valor_recebido,0),0)),0) FROM contas_receber WHERE user_id=? AND status IN ('pendente','parcial','atrasado') AND LEFT(data_vencimento,10)<?) AS vencido`,
          [userId, month.start, month.next, userId, userId, month.start, month.next, userId, today],
        ),
        pool.query(
          `SELECT cr.id,cr.ordem_servico_id,cr.data_vencimento,GREATEST(cr.valor-COALESCE(cr.valor_recebido,0),0) AS saldo,
                  c.nome AS cliente_nome,o.numero AS ordem_numero
             FROM contas_receber cr
             LEFT JOIN clientes c ON c.user_id=cr.user_id AND c.id=cr.cliente_id
             LEFT JOIN ordens_servico o ON o.user_id=cr.user_id AND o.id=cr.ordem_servico_id
            WHERE cr.user_id=? AND cr.status IN ('pendente','parcial','atrasado') AND LEFT(cr.data_vencimento,10)<?
            ORDER BY LEFT(cr.data_vencimento,10) LIMIT 5`, [userId, today],
        ),
        pool.query(
          `SELECT p.id,'pagamento' AS tipo,CONCAT('Pagamento recebido: R$ ',CAST(p.valor AS CHAR)) AS descricao,
                  p.data_pagamento AS created_at,o.numero AS ordem_numero
             FROM os_pagamentos p LEFT JOIN ordens_servico o ON o.user_id=p.user_id AND o.id=p.ordem_servico_id
            WHERE p.user_id=? AND p.status='confirmado' ORDER BY p.data_pagamento DESC LIMIT 5`, [userId],
        ),
      ]);
      financial = financialResult[0][0];
      overdueReceivables = receivablesResult[0];
      paymentActivity = paymentsResult[0];
    }

    const priorities = [
      ...overdueOrders.map((order) => ({ id: `ordem-${order.id}`, type: 'ordem_atrasada', severity: 'danger', title: `OS #${order.numero} em atraso`, description: `${order.cliente_nome} · previsão ${String(order.data_previsao || '').slice(0,10)}`, href: `/ordens/${order.id}/historico` })),
      ...(Number(attention.aditivos_aguardando || 0) ? [{ id: 'aditivos', type: 'aditivos', severity: 'warning', title: `${attention.aditivos_aguardando} aditivo(s) aguardando aprovação`, description: 'Acompanhe a resposta dos clientes', href: '/ordens' }] : []),
      ...(Number(attention.mensagens_nao_lidas || 0) ? [{ id: 'mensagens', type: 'mensagens', severity: 'info', title: `${attention.mensagens_nao_lidas} mensagem(ns) não lida(s)`, description: 'Conversas aguardando atendimento', href: '/conversas' }] : []),
      ...overdueReceivables.map((item) => ({ id: `receber-${item.id}`, type: 'financeiro_vencido', severity: 'danger', title: `${item.cliente_nome || 'Cliente'} · ${money(item.saldo).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, description: `Pagamento vencido${item.ordem_numero ? ` · OS #${item.ordem_numero}` : ''}`, href: '/financeiro' })),
      ...(Number(attention.avaliacoes_com_erro || 0) ? [{ id: 'avaliacoes', type: 'avaliacoes', severity: 'warning', title: `${attention.avaliacoes_com_erro} envio(s) de avaliação com erro`, description: 'Revise telefone ou conexão do WhatsApp', href: '/avaliacoes' }] : []),
    ].slice(0, 10);
    const activity = [...historyResult[0], ...messageResult[0], ...paymentActivity]
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .slice(0, 10);

    return res.json({ data: {
      generated_at: now(), period: { today, month_start: month.start, month_end_exclusive: month.next },
      metrics: { entregas_hoje: Number(summary.entregas_hoje || 0), atrasadas: Number(summary.atrasadas || 0), em_andamento: Number(summary.em_andamento || 0), concluidas_mes: Number(summary.concluidas_mes || 0) },
      pipeline: { pendente: Number(summary.pendentes || 0), em_andamento: Number(summary.em_andamento || 0), atraso: Number(summary.atrasadas || 0), concluido_mes: Number(summary.concluidas_mes || 0) },
      financial: financial ? {
        recebido_mes: money(financial.recebido_mes),
        a_receber: money(financial.a_receber),
        a_receber_mes: money(financial.a_receber_mes),
        vencido: money(financial.vencido),
      } : null,
      agenda, priorities, activity,
    } });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

function addFilter(where, params, cols, filter) {
  let { column, operator, value } = filter;
  if (column?.includes('.')) return;
  if (column === 'template_type') column = 'tipo';
  if (column === 'template_content') column = 'conteudo';
  if (column === 'is_active') column = 'ativo';
  if (!cols.has(column)) return;

  const field = `\`${column}\``;
  if (operator === 'eq') { where.push(`${field} = ?`); params.push(value); }
  if (operator === 'neq') { where.push(`${field} <> ?`); params.push(value); }
  if (operator === 'gte') { where.push(`${field} >= ?`); params.push(value); }
  if (operator === 'lte') { where.push(`${field} <= ?`); params.push(value); }
  if (operator === 'lt') { where.push(`${field} < ?`); params.push(value); }
  if (operator === 'gt') { where.push(`${field} > ?`); params.push(value); }
  if (operator === 'ilike') { where.push(`${field} LIKE ?`); params.push(String(value).replaceAll('%', '%')); }
  if (operator === 'is') {
    if (value === null) where.push(`${field} IS NULL`);
    else { where.push(`${field} IS ?`); params.push(value); }
  }
  if (operator === 'in' && Array.isArray(value) && value.length) {
    where.push(`${field} IN (${value.map(() => '?').join(',')})`);
    params.push(...value);
  }
}

function addOrFilter(where, params, cols, expression) {
  const clauses = String(expression || '').split(',').map((item) => item.trim()).filter(Boolean);
  const orParts = [];
  for (const clause of clauses) {
    const match = clause.match(/^([a-zA-Z0-9_]+)\.ilike\.(.*)$/);
    if (!match || !cols.has(match[1])) continue;
    orParts.push(`\`${match[1]}\` LIKE ?`);
    params.push(match[2].replaceAll('*', '%'));
  }
  if (orParts.length) where.push(`(${orParts.join(' OR ')})`);
}

app.post('/api/query', requireAuth, async (req, res) => {
  const { table, action, payload, filters = [], orFilters = [], orders = [], range, single, maybeSingle, count, head, select, upsertOptions } = req.body;

  try {
    if (!allowedTables.has(table)) {
      return res.status(400).json({ error: { message: `Tabela nao permitida: ${table}` } });
    }

    const physicalTable = table === 'message_templates' ? 'templates_mensagem' : table;
    const cols = await getColumns(physicalTable);
    if (!canQuery(req.auth.role, physicalTable, action)) {
      return res.status(403).json({ error: { message: 'Seu perfil não possui permissão para esta ação' } });
    }

    if (action === 'select') {
      // Remove registros legados deixados por exclusoes de OS anteriores a
      // sincronizacao transacional implementada abaixo.
      if (physicalTable === 'contas_receber' || (physicalTable === 'ordens_servico' && req.auth.role === 'admin')) {
        await reconcileReceivables(pool, req.user.id);
      }

      const where = [];
      const params = [];
      // O tenant sempre vem da sessao. Ignorar user_id enviado pelo cliente evita
      // que um subusuario filtre acidentalmente pelo proprio id em vez da conta.
      for (const filter of filters) {
        if (filter?.column === 'user_id') continue;
        addFilter(where, params, cols, filter);
      }
      for (const expression of orFilters) addOrFilter(where, params, cols, expression);
      if (cols.has('user_id')) {
        where.push('`user_id` = ?');
        params.push(req.user.id);
      }

      const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[countRow]] = count ? await pool.query(`SELECT COUNT(*) AS total FROM \`${physicalTable}\`${whereSql}`, params) : [[{ total: null }]];
      if (head) return res.json({ data: null, count: countRow.total, error: null });

      let sql = `SELECT * FROM \`${physicalTable}\`${whereSql}`;
      const orderClauses = orders
        .filter((order) => cols.has(order.column))
        .map((order) => `\`${order.column}\` ${order.ascending === false ? 'DESC' : 'ASC'}`);
      if (orderClauses.length) sql += ` ORDER BY ${orderClauses.join(', ')}`;
      if (range) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(Number(range.to) - Number(range.from) + 1, Number(range.from));
      } else if (req.body.limit) {
        sql += ' LIMIT ?';
        params.push(Number(req.body.limit));
      }

      const [rows] = await pool.query(sql, params);
      const normalized = await normalizeRows(physicalTable, rows, select, req.auth.accountId);
      if (req.auth.role === 'operador' && physicalTable === 'ordens_servico') {
        for (const row of normalized) {
          for (const column of OPERATOR_ORDER_BLOCKED_COLUMNS) delete row[column];
        }
      }

      if (single || maybeSingle) {
        if (!normalized.length && single) return res.status(406).json({ error: { code: 'PGRST116', message: 'No rows found' }, data: null, count: countRow.total });
        return res.json({ data: normalized[0] || null, count: countRow.total, error: null });
      }

      return res.json({ data: normalized, count: countRow.total, error: null });
    }

    if (action === 'insert') {
      const inputRows = Array.isArray(payload) ? payload : [payload];
      const inserted = [];

      for (const row of inputRows) {
        const data = await filterDataToColumns(physicalTable, row);
        if (req.auth.role === 'operador' && physicalTable === 'ordens_servico') {
          for (const column of OPERATOR_ORDER_BLOCKED_COLUMNS) delete data[column];
          if (data.status && !['pendente', 'em_andamento', 'concluido'].includes(data.status)) data.status = 'pendente';
        }
        if (cols.has('id') && !data.id) data.id = uuid();
        if (cols.has('user_id')) data.user_id = req.user.id;
        if (cols.has('created_at') && !data.created_at) data.created_at = now();

        if (physicalTable === 'ordens_servico') {
          if (!data.numero) data.numero = await getNextOrderNumber(data.user_id);
          if (!data.data_entrada) data.data_entrada = todayDate();
          if (data.valor_total === undefined && cols.has('valor_total')) {
            data.valor_total = Number(data.valor_servicos || 0) - Number(data.desconto || 0);
          }
        }

        const keys = Object.keys(data);
        await pool.query(
          `INSERT INTO \`${physicalTable}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          Object.values(data),
        );
        if (physicalTable === 'ordens_servico') {
          await syncReceivableForOrder(pool, data.user_id, data.id);
          await markRemarketingConversion(pool, data.user_id, data);
        }
        inserted.push(normalizeRow(physicalTable, data));
        await writeAudit(req, { action: 'registro.criar', resource: physicalTable, resourceId: data.id || null, details: { fields: Object.keys(data) } });
      }

      return res.json({ data: single ? inserted[0] : inserted, error: null });
    }

    if (action === 'update' || action === 'delete') {
      if (req.auth.role === 'operador' && physicalTable === 'ordens_servico' && action === 'update') {
        const exactIdFilter = filters.find((filter) => filter?.column === 'id' && filter?.operator === 'eq' && filter?.value);
        if (!exactIdFilter) {
          return res.status(400).json({ error: { message: 'A alteração da ordem exige um identificador único' } });
        }
      }
      const where = [];
      const params = [];
      for (const filter of filters) {
        if (filter?.column === 'user_id') continue;
        addFilter(where, params, cols, filter);
      }
      if (cols.has('user_id')) {
        where.push('`user_id` = ?');
        params.push(req.user.id);
      }
      if (!where.length) return res.status(400).json({ error: { message: 'Filtro obrigatorio para alteracao' } });

      if (action === 'delete') {
        let result;
        if (physicalTable === 'ordens_servico') {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            const [orders] = await conn.query(
              `SELECT id FROM \`${physicalTable}\` WHERE ${where.join(' AND ')} FOR UPDATE`,
              params,
            );
            const orderIds = orders.map((order) => order.id);
            if (orderIds.length) {
              const placeholders = orderIds.map(() => '?').join(',');
              const [[linkedHistory]] = await conn.query(
                `SELECT
                   (SELECT COUNT(*) FROM os_historico WHERE user_id=? AND ordem_servico_id IN (${placeholders})) +
                   (SELECT COUNT(*) FROM notas_fiscais WHERE user_id=? AND ordem_servico_id IN (${placeholders})) +
                   (SELECT COUNT(*) FROM whatsapp_mensagens WHERE user_id=? AND ordem_servico_id IN (${placeholders})) AS total`,
                [req.user.id, ...orderIds, req.user.id, ...orderIds, req.user.id, ...orderIds],
              );
              if (Number(linkedHistory?.total || 0) > 0) {
                throw Object.assign(new Error('Esta OS possui histórico, conversa ou documento fiscal e não pode ser excluída. Cancele a OS para preservar a rastreabilidade.'), { status: 409 });
              }
              await conn.query(
                `DELETE FROM os_condicoes_pagamento
                  WHERE user_id = ? AND ordem_servico_id IN (${orderIds.map(() => '?').join(',')})`,
                [req.user.id, ...orderIds],
              );
              await conn.query(
                `DELETE FROM contas_receber
                  WHERE user_id = ? AND ordem_servico_id IN (${orderIds.map(() => '?').join(',')})`,
                [req.user.id, ...orderIds],
              );
            }
            [result] = await conn.query(`DELETE FROM \`${physicalTable}\` WHERE ${where.join(' AND ')}`, params);
            await conn.commit();
          } catch (error) {
            await conn.rollback();
            throw error;
          } finally {
            conn.release();
          }
        } else {
          [result] = await pool.query(`DELETE FROM \`${physicalTable}\` WHERE ${where.join(' AND ')}`, params);
        }
        await writeAudit(req, { action: 'registro.excluir', resource: physicalTable, details: { filters, affected: Number(result.affectedRows || 0) } });
        return res.json({ data: null, count: Number(result.affectedRows || 0), error: null });
      }

      const data = await filterDataToColumns(physicalTable, payload);
      if (cols.has('user_id')) delete data.user_id;
      if (req.auth.role === 'operador' && physicalTable === 'ordens_servico') {
        for (const column of OPERATOR_ORDER_UPDATE_BLOCKED_COLUMNS) delete data[column];
        const [[currentOrder]] = await pool.query(
          `SELECT status FROM \`${physicalTable}\` WHERE ${where.join(' AND ')} LIMIT 1`,
          params,
        );
        if (['concluido', 'cancelado'].includes(currentOrder?.status)) {
          const terminalAllowedFields = new Set(['status', 'solicita_avaliacao', 'updated_at']);
          if (Object.keys(data).some((key) => !terminalAllowedFields.has(key))) {
            return res.status(403).json({ error: { message: 'Ordens concluídas ou canceladas não podem ser editadas pelo operador' } });
          }
        }
        if (data.status) {
          const allowed = OPERATOR_STATUS_TRANSITIONS[currentOrder?.status] || new Set();
          if (!allowed.has(data.status)) {
            return res.status(403).json({ error: { message: 'O operador não pode executar esta transição de status' } });
          }
        }
      }
      const affectedOrderIds = [];
      if (physicalTable === 'ordens_servico') {
        const [ordersBeforeUpdate] = await pool.query(
          `SELECT id FROM \`${physicalTable}\` WHERE ${where.join(' AND ')}`,
          params,
        );
        affectedOrderIds.push(...ordersBeforeUpdate.map((row) => row.id));
        if (data.status === 'concluido' && !data.data_entrega) data.data_entrega = todayDate();
        if (data.valor_total === undefined && (data.valor_servicos !== undefined || data.desconto !== undefined)) {
          const [[current]] = await pool.query(
            `SELECT valor_servicos, desconto FROM \`${physicalTable}\` WHERE ${where.join(' AND ')} LIMIT 1`,
            params,
          );
          data.valor_total = Number(data.valor_servicos ?? current?.valor_servicos ?? 0) - Number(data.desconto ?? current?.desconto ?? 0);
        }
      }
      const keys = Object.keys(data);
      if (!keys.length) return res.json({ data: null, error: null });
      const [result] = await pool.query(
        `UPDATE \`${physicalTable}\` SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE ${where.join(' AND ')}`,
        [...Object.values(data), ...params],
      );
      for (const ordemId of affectedOrderIds) {
        await syncReceivableForOrder(pool, req.user.id, ordemId);
      }
      await writeAudit(req, { action: 'registro.atualizar', resource: physicalTable, details: { filters, fields: Object.keys(data), affected: Number(result.affectedRows || 0) } });
      return res.json({ data: null, count: Number(result.affectedRows || 0), error: null });
    }

    if (action === 'upsert') {
      const inputRows = Array.isArray(payload) ? payload : [payload];
      const conflict = upsertOptions?.onConflict || (cols.has('user_id') && cols.has('tipo') ? 'user_id,tipo' : 'id');
      const conflictCols = conflict.split(',')
        .map((item) => item.trim())
        .map((col) => {
          if (physicalTable === 'templates_mensagem' && col === 'template_type') return 'tipo';
          if (physicalTable === 'templates_mensagem' && col === 'template_content') return 'conteudo';
          if (physicalTable === 'templates_mensagem' && col === 'is_active') return 'ativo';
          return col;
        })
        .filter((col) => cols.has(col));
      if (cols.has('user_id') && !conflictCols.includes('user_id')) conflictCols.push('user_id');
      const upserted = [];

      for (const row of inputRows) {
        const data = await filterDataToColumns(physicalTable, row);
        if (req.auth.role === 'operador' && physicalTable === 'ordens_servico') {
          for (const column of OPERATOR_ORDER_UPDATE_BLOCKED_COLUMNS) delete data[column];
        }
        if (cols.has('id') && !data.id) data.id = uuid();
        if (cols.has('user_id')) data.user_id = req.user.id;
        if (cols.has('created_at') && !data.created_at) data.created_at = now();

        const where = conflictCols.map((col) => `\`${col}\` = ?`).join(' AND ');
        const [existing] = conflictCols.length
          ? await pool.query(`SELECT id FROM \`${physicalTable}\` WHERE ${where} LIMIT 1`, conflictCols.map((col) => data[col]))
          : [[]];
        if (existing.length) {
          const keys = Object.keys(data).filter((key) => !conflictCols.includes(key));
          if (keys.length) {
            await pool.query(
              `UPDATE \`${physicalTable}\` SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE ${where}`,
              [...keys.map((key) => data[key]), ...conflictCols.map((col) => data[col])],
            );
          }
        } else {
          const keys = Object.keys(data);
          await pool.query(
            `INSERT INTO \`${physicalTable}\` (${keys.map((key) => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            Object.values(data),
          );
        }
        upserted.push(normalizeRow(physicalTable, data));
        await writeAudit(req, { action: 'registro.upsert', resource: physicalTable, resourceId: data.id || null, details: { fields: Object.keys(data) } });
      }
      return res.json({ data: upserted, error: null });
    }

    res.status(400).json({ error: { message: `Acao nao suportada: ${action}` } });
  } catch (error) {
    res.status(error.status || 500).json({ data: null, count: null, error: { message: error.message, code: error.code } });
  }
});

app.post('/api/rpc/get_next_order_number', requireAuth, async (req, res) => {
  try {
    const requestedUserId = req.body?.p_user_id;
    if (requestedUserId && ![req.user.id, req.auth.userId].includes(requestedUserId)) {
      return res.status(403).json({ data: null, error: { message: 'Acesso negado' } });
    }

    const next = await getNextOrderNumber(req.user.id);
    res.json({ data: next, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: error.message } });
  }
});

app.post('/api/rpc/get_next_rps_number', requireAuth, requireAdmin, async (req, res) => {
  const requestedUserId = req.body?.p_user_id;
  if (requestedUserId && ![req.user.id, req.auth.userId].includes(requestedUserId)) {
    return res.status(403).json({ data: null, error: { message: 'Acesso negado' } });
  }
  const userId = req.user.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, ultimo_numero_rps FROM empresa_fiscal WHERE user_id = ? FOR UPDATE', [userId]);
    if (!rows.length) throw new Error('Configuracao fiscal nao encontrada');
    const next = Number(rows[0].ultimo_numero_rps || 0) + 1;
    await conn.query('UPDATE empresa_fiscal SET ultimo_numero_rps = ?, updated_at = ? WHERE id = ?', [next, now(), rows[0].id]);
    await conn.commit();
    res.json({ data: next, error: null });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ data: null, error: { message: error.message } });
  } finally {
    conn.release();
  }
});

app.post('/api/storage/:bucket/upload', requireAuth, requireAdmin, express.raw({ type: '*/*', limit: '8mb' }), async (req, res) => {
  try {
    const upload = resolveUploadPath(req.params.bucket, req.query.path);
    if (!upload) return res.status(400).json({ error: { message: 'Caminho invalido' } });
    fs.mkdirSync(path.dirname(upload.target), { recursive: true });
    fs.writeFileSync(upload.target, req.body);
    res.json({ data: { path: upload.path }, error: null });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.delete('/api/storage/:bucket', requireAuth, requireAdmin, async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  for (const item of paths) {
    const upload = resolveUploadPath(req.params.bucket, item);
    if (!upload) continue;
    if (fs.existsSync(upload.target)) fs.rmSync(upload.target, { force: true });
  }
  res.json({ data: null, error: null });
});

app.get('/api/branding/logo', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT mime_type, content, updated_at
         FROM tenant_assets
        WHERE user_id = ? AND asset_key = 'brand_logo'
        LIMIT 1`,
      [req.user.id],
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Logo nao cadastrada' } });
    res.setHeader('Content-Type', rows[0].mime_type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(rows[0].content);
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/branding/logo', requireAuth, requireAdmin, express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  try {
    const mimeType = detectImageMime(req.body);
    if (!mimeType) {
      return res.status(400).json({ error: { message: 'Envie uma imagem PNG, JPEG ou WebP valida' } });
    }
    const createdAt = now();
    await pool.query(
      `INSERT INTO tenant_assets
       (id, user_id, asset_key, mime_type, content, file_size, created_at, updated_at)
       VALUES (?, ?, 'brand_logo', ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), content = VALUES(content),
         file_size = VALUES(file_size), updated_at = VALUES(updated_at)`,
      [uuid(), req.user.id, mimeType, req.body, req.body.length, createdAt, createdAt],
    );
    await writeAudit(req, { action: 'identidade.logo.atualizar', resource: 'tenant_assets', details: { mimeType, size: req.body.length } });
    return res.json({ data: { mime_type: mimeType, file_size: req.body.length }, error: null });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.delete('/api/branding/logo', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tenant_assets WHERE user_id = ? AND asset_key = 'brand_logo'`,
      [req.user.id],
    );
    await writeAudit(req, { action: 'identidade.logo.remover', resource: 'tenant_assets', details: { affected: Number(result.affectedRows || 0) } });
    return res.json({ data: null, error: null });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.get('/api/document-templates', requireAuth, async (req, res) => {
  try {
    const documentType = String(req.query.type || 'service_order').slice(0, 50);
    const [rows] = await pool.query(
      `SELECT id, name, document_type, config_json, is_default, version, created_at, updated_at
         FROM document_templates
        WHERE user_id = ? AND document_type = ?
        ORDER BY is_default DESC, updated_at DESC, name ASC`,
      [req.user.id, documentType],
    );
    return res.json({
      data: rows.map((row) => ({
        ...row,
        is_default: Boolean(row.is_default),
        config_json: typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json,
      })),
      error: null,
    });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/document-templates', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const documentType = String(req.body?.document_type || 'service_order').slice(0, 50);
    if (documentType !== 'service_order') {
      return res.status(400).json({ error: { message: 'Tipo de documento nao suportado' } });
    }
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: { message: 'Informe o nome do modelo' } });
    const config = normalizeDocumentConfig(req.body?.config_json);
    const requestedId = String(req.body?.id || '').trim();
    const isDefault = req.body?.is_default !== false;
    const updatedAt = now();

    await conn.beginTransaction();
    let id = requestedId;
    let version = 1;
    if (requestedId) {
      const [existing] = await conn.query(
        'SELECT id, version FROM document_templates WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
        [requestedId, req.user.id],
      );
      if (!existing.length) {
        await conn.rollback();
        return res.status(404).json({ error: { message: 'Modelo nao encontrado nesta empresa' } });
      }
      version = Number(existing[0].version || 0) + 1;
    } else {
      id = uuid();
    }

    if (isDefault) {
      await conn.query(
        'UPDATE document_templates SET is_default = 0, updated_at = ? WHERE user_id = ? AND document_type = ?',
        [updatedAt, req.user.id, documentType],
      );
    }

    if (requestedId) {
      await conn.query(
        `UPDATE document_templates
            SET name = ?, document_type = ?, config_json = ?, is_default = ?, version = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
        [name, documentType, JSON.stringify(config), isDefault ? 1 : 0, version, updatedAt, id, req.user.id],
      );
    } else {
      await conn.query(
        `INSERT INTO document_templates
         (id, user_id, name, document_type, config_json, is_default, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, req.user.id, name, documentType, JSON.stringify(config), isDefault ? 1 : 0, updatedAt, updatedAt],
      );
    }
    await conn.commit();
    await writeAudit(req, { action: requestedId ? 'documento.modelo.atualizar' : 'documento.modelo.criar', resource: 'document_templates', resourceId: id, details: { name, documentType, version, isDefault } });
    return res.json({ data: { id, name, document_type: documentType, config_json: config, is_default: isDefault, version, updated_at: updatedAt }, error: null });
  } catch (error) {
    await conn.rollback().catch(() => {});
    return res.status(500).json({ error: { message: error.message } });
  } finally {
    conn.release();
  }
});

app.delete('/api/document-templates/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT is_default FROM document_templates WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id],
    );
    if (!rows.length) return res.status(404).json({ error: { message: 'Modelo nao encontrado nesta empresa' } });
    if (rows[0].is_default) return res.status(400).json({ error: { message: 'Defina outro modelo como padrao antes de excluir este' } });
    await pool.query('DELETE FROM document_templates WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    await writeAudit(req, { action: 'documento.modelo.excluir', resource: 'document_templates', resourceId: req.params.id });
    return res.json({ data: null, error: null });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeWhatsappPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function whatsappPhoneCandidates(phone) {
  const cleaned = normalizeWhatsappPhone(phone);
  if (!cleaned) return [];

  const candidates = new Set([cleaned]);
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    candidates.add(cleaned.slice(2));
  } else if (cleaned.length >= 10 && cleaned.length <= 11) {
    candidates.add(`55${cleaned}`);
  }

  const addBrazilMobileVariants = (number) => {
    const national = number.startsWith('55') ? number.slice(2) : number;
    if (national.length === 10) {
      const withNinthDigit = `${national.slice(0, 2)}9${national.slice(2)}`;
      candidates.add(withNinthDigit);
      candidates.add(`55${withNinthDigit}`);
    }
    if (national.length === 11 && national[2] === '9') {
      const withoutNinthDigit = `${national.slice(0, 2)}${national.slice(3)}`;
      candidates.add(withoutNinthDigit);
      candidates.add(`55${withoutNinthDigit}`);
    }
  };

  [...candidates].forEach(addBrazilMobileVariants);
  return [...candidates];
}

function parseMoneyFromText(text) {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  const match = normalized.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:[,.](\d{1,2}))?\s*(?:reais|real|rs|brl)?/);
  if (!match) return null;
  return Number(`${match[1].replace(/\./g, '')}.${(match[2] || '00').padEnd(2, '0')}`);
}

function normalizeTextForAi(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const numberWordValues = new Map(Object.entries({
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
}));

function parsePortugueseNumberWords(text) {
  const tokens = normalizeTextForAi(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token !== 'e' && token !== 'de' && token !== 'reais' && token !== 'real');
  let total = 0;
  let current = 0;

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      current += Number(token);
      continue;
    }
    if (token === 'mil') {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    if (!numberWordValues.has(token)) return null;
    current += numberWordValues.get(token);
  }

  return total + current;
}

function parseMoneyWordsFromText(text) {
  const normalized = normalizeTextForAi(text);
  const afterValue = normalized.match(/(?:valor\s+de|no\s+valor\s+de|de)\s+(.+?)(?:\s*,?\s*(?:vencimento|vence|para|com|em)\b|$)/)?.[1];
  if (!afterValue) return null;

  const explicitCents = afterValue.match(/(.+?)\s+(?:reais|real)\s+e\s+(.+?)\s+centavos?/);
  if (explicitCents) {
    const reais = parsePortugueseNumberWords(explicitCents[1]);
    const cents = parsePortugueseNumberWords(explicitCents[2]);
    if (reais !== null && cents !== null) return Number((reais + cents / 100).toFixed(2));
  }

  const parts = afterValue.split(/\s+e\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const cents = parsePortugueseNumberWords(parts.slice(-2).join(' e '));
    const reais = parsePortugueseNumberWords(parts.slice(0, -2).join(' e '));
    if (reais !== null && cents !== null && cents > 0 && cents < 100) {
      return Number((reais + cents / 100).toFixed(2));
    }
  }

  const value = parsePortugueseNumberWords(afterValue);
  return value === null ? null : Number(value.toFixed(2));
}

function parseFinancialMoney(text) {
  return parseMoneyWordsFromText(text) ?? parseMoneyFromText(text);
}

function parseDueDateFromText(text) {
  const normalized = normalizeTextForAi(text);
  const numeric = normalized.match(/(?:vencimento|vence|dia)(?:\s+dia)?\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : new Date().getFullYear();
    return `${year}-${String(Number(numeric[2])).padStart(2, '0')}-${String(Number(numeric[1])).padStart(2, '0')}`;
  }

  const wordDay = normalized.match(/(?:vencimento|vence|dia)(?:\s+dia)?\s+([a-z\s]+?)[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (wordDay) {
    const day = parsePortugueseNumberWords(wordDay[1]);
    if (!day) return null;
    const year = wordDay[3] ? Number(wordDay[3].length === 2 ? `20${wordDay[3]}` : wordDay[3]) : new Date().getFullYear();
    return `${year}-${String(Number(wordDay[2])).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function titleCaseDescription(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractAccountPayableDescription(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/(?:conta|boleto|fatura)\s+(?:da|do|de)?\s*(.+?)(?:\s+(?:no\s+)?valor\b|\s+r\$|\s+\d+(?:[,.]\d{1,2})?\b|\s+vencimento\b|\s+vence\b|$)/i);
  return titleCaseDescription(
    (match?.[1] || 'Conta via WhatsApp')
      .replace(/\s*(?:r\$\s*)?\d+(?:[,.]\d{1,2})?\s*$/i, '')
      .trim(),
  );
}

function extractPaymentMethod(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('pix')) return 'pix';
  if (value.includes('dinheiro')) return 'dinheiro';
  if (value.includes('crédito') || value.includes('credito')) return 'credito';
  if (value.includes('débito') || value.includes('debito')) return 'debito';
  if (value.includes('boleto')) return 'boleto';
  return null;
}

function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = String(isoDate || todayDate()).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return date.toISOString().slice(0, 10);
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!br) return null;
  const today = todayDate();
  const year = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : Number(today.slice(0, 4));
  return `${year}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
}

function parseNaturalDate(text) {
  const raw = String(text || '').trim();
  const normalized = normalizeTextForAi(raw);
  if (!raw) return null;
  if (/\bdepois de amanha\b/.test(normalized)) return addDaysToIsoDate(todayDate(), 2);
  if (/\bamanha\b/.test(normalized)) return addDaysToIsoDate(todayDate(), 1);
  if (/\bontem\b/.test(normalized)) return addDaysToIsoDate(todayDate(), -1);
  if (/\bhoje\b/.test(normalized)) return todayDate();

  const numeric = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) return normalizeIsoDate(numeric[0]);

  const dayOnly = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOnly) {
    const today = todayDate();
    return `${today.slice(0, 8)}${String(Number(dayOnly[1])).padStart(2, '0')}`;
  }

  return null;
}

function extractPhoneFromText(text) {
  const match = String(text || '').match(/(?:telefone|fone|celular|whats(?:app)?)\D*(\+?\d[\d\s().-]{8,})/i);
  return match ? match[1].replace(/\D/g, '') : null;
}

function extractCpfCnpjFromText(text) {
  const match = String(text || '').match(/(?:cpf|cnpj)\D*([\d./-]{11,18})/i);
  return match ? match[1].replace(/\D/g, '') : null;
}

function extractEmailFromText(text) {
  return String(text || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] || null;
}

function extractClientNameFromText(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/(?:cliente|para|da|do|de)\s+(.+?)(?:\s+(?:telefone|fone|celular|whats|cpf|cnpj|email|endereco|endere[cç]o|os\b|ordem\b|previs[aã]o|entrega|valor|status|modelo|problema|servi[cç]o|dia\s+\d|em\s+\d|r\$)|$)/i);
  return titleCaseDescription(match?.[1] || '');
}

function extractQuotedValue(text) {
  return String(text || '').match(/["“”']([^"“”']+)["“”']/)?.[1]?.trim() || null;
}

function extractServiceOrderStatus(text) {
  const normalized = normalizeTextForAi(text);
  if (/\bcancelad/.test(normalized)) return 'cancelado';
  if (/\bconcluid|\bfinalizad|\bpront/.test(normalized)) return 'concluido';
  if (/\batras/.test(normalized)) return 'atraso';
  if (/\bandamento|executando|servico/.test(normalized)) return 'em_andamento';
  if (/\bpendent/.test(normalized)) return 'pendente';
  return null;
}

function parseFinancialIntent(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const normalized = normalizeTextForAi(raw);
  const value = parseFinancialMoney(raw);
  const formaPagamento = extractPaymentMethod(raw);
  const osMatch = lower.match(/\bos\s*#?\s*(\d+)\b|ordem\s*(?:de\s*servi[cç]o)?\s*#?\s*(\d+)\b/);
  const osNumero = osMatch ? Number(osMatch[1] || osMatch[2]) : null;

  if (/^confirmar(?:\s+[a-z0-9-]+)?$/i.test(raw)) {
    return { intent: 'confirmar_acao', token: raw.split(/\s+/)[1] || null };
  }

  if (/(cadastre|cadastrar|registre|registrar|crie|criar|novo|nova).*(cliente)/.test(normalized)) {
    return {
      intent: 'cadastrar_cliente',
      nome: extractClientNameFromText(raw),
      telefone: extractPhoneFromText(raw),
      cpfCnpj: extractCpfCnpjFromText(raw),
      email: extractEmailFromText(raw),
    };
  }

  if (/(edite|editar|altere|alterar|atualize|atualizar).*(cliente)/.test(normalized)) {
    return {
      intent: 'editar_cliente',
      cliente: extractClientNameFromText(raw),
      nome: extractQuotedValue(raw),
      telefone: extractPhoneFromText(raw),
      cpfCnpj: extractCpfCnpjFromText(raw),
      email: extractEmailFromText(raw),
    };
  }

  if (/(exclua|excluir|remova|remover|apague|apagar).*(cliente)/.test(normalized)) {
    return { intent: 'excluir_cliente', cliente: extractClientNameFromText(raw) };
  }

  if (/(cadastre|cadastrar|registre|registrar|crie|criar|abrir|abra|nova|novo).*(os|ordem)/.test(normalized) && !/(pagamento|paga|pago|recebi|recebido|quitad)/.test(normalized)) {
    return {
      intent: 'cadastrar_os',
      cliente: extractClientNameFromText(raw),
      dataPrevisao: parseNaturalDate(raw),
      value,
      formaPagamento,
      modelo: extractQuotedValue(raw),
      observacoes: raw,
    };
  }

  if (osNumero && /(cancele|cancelar|cancelad)/.test(normalized)) {
    return { intent: 'cancelar_os', osNumero };
  }

  if (osNumero && /(edite|editar|altere|alterar|atualize|atualizar|mude|mudar|troque|trocar|status|previs|entrega)/.test(normalized)) {
    return {
      intent: 'editar_os',
      osNumero,
      statusOs: extractServiceOrderStatus(raw),
      dataPrevisao: parseNaturalDate(raw),
      value,
      formaPagamento,
      observacoes: raw,
    };
  }

  if (/(cadastre|registre|lanca|lancar|lance).*(conta|boleto|fatura)/.test(normalized)) {
    return {
      intent: 'registrar_conta_pagar',
      value,
      description: extractAccountPayableDescription(raw),
      dataVencimento: parseDueDateFromText(raw),
      formaPagamento,
    };
  }

  if (/(cadastre|registre|lan[cç]a|lançar|lance).*(despesa|gasto|compra)|despesa de|gastei|paguei(?!.*os)/.test(lower)) {
    const description = raw
      .replace(/cadastre|registre|lan[cç]a|lançar|lance|uma|um|despesa|gasto|compra|de|r\$|reais|real|paguei/gi, ' ')
      .replace(/\d+[,.]?\d*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Despesa via WhatsApp';
    return { intent: 'registrar_despesa', value, description, formaPagamento };
  }

  if (osNumero && /(paga|pago|recebi|recebido|quitad|pagamento)/.test(lower)) {
    return { intent: 'registrar_pagamento_os', osNumero, value, formaPagamento };
  }

  if (/contas?.*vencem hoje|vence hoje|vencimentos hoje/.test(lower)) return { intent: 'contas_vencem_hoje' };
  if (/quanto.*receber.*m[eê]s|a receber.*m[eê]s|receber este m[eê]s/.test(lower)) return { intent: 'a_receber_mes' };
  if (/faturamento.*m[eê]s|receita.*m[eê]s|quanto faturei/.test(lower)) return { intent: 'faturamento_mes' };
  if (/pendentes?.*pagamento|os.*pendentes?.*pagamento|ordens.*devem/.test(lower)) return { intent: 'os_pendentes_pagamento' };
  if (/(os|ordens).*(hoje|dia)|quais.*(os|ordens).*(hoje|dia)|agenda.*(hoje|dia)/.test(normalized)) {
    return { intent: 'os_do_dia', dataPrevisao: parseNaturalDate(raw) || todayDate() };
  }
  if (/clientes?.*(recentes|ultimos|cadastrados)/.test(normalized)) return { intent: 'listar_clientes_recentes' };
  if (/(busque|buscar|procure|procurar|localize|listar|mostrar).*(cliente)/.test(normalized)) {
    return {
      intent: 'buscar_cliente',
      cliente: extractClientNameFromText(raw) || raw.replace(/busque|buscar|procure|procurar|localize|listar|mostrar|cliente/gi, '').trim(),
    };
  }
  if (osNumero && (/(busque|buscar|procure|procurar|localize|mostrar|ver).*(os|ordem)/.test(normalized) || /\bos\s*#?\s*\d+/.test(normalized))) {
    return { intent: 'buscar_os', osNumero };
  }
  if (/cliente\s+(.+).*(deve|devendo|d[eé]bito)/.test(lower)) {
    const cliente = lower.match(/cliente\s+(.+?)(?:\s+(?:deve|devendo|d[eé]bito)|$)/)?.[1]?.trim();
    return { intent: 'divida_cliente', cliente };
  }

  return { intent: 'desconhecida' };
}

function canWriteFinancial(permission) {
  return ['escrita', 'admin'].includes(String(permission || '').toLowerCase());
}

function canWriteSystem(permission) {
  return canWriteFinancial(permission);
}

function canAdminSystem(permission) {
  return String(permission || '').toLowerCase() === 'admin';
}

function extractResponsesText(json) {
  if (typeof json?.output_text === 'string') return json.output_text;
  for (const item of json?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') return content.text;
      if (typeof content.output_text === 'string') return content.output_text;
    }
  }
  return '';
}

function normalizeAiIntent(rawIntent) {
  if (!rawIntent || typeof rawIntent !== 'object') return null;
  const intent = String(rawIntent.intent || '').trim();
  const allowed = new Set([...SYSTEM_AI_WRITE_INTENTS, ...SYSTEM_AI_QUERY_INTENTS, 'confirmar_acao', 'desconhecida']);
  if (!allowed.has(intent)) return null;
  const normalized = { ...rawIntent, intent };
  normalized.value = rawIntent.value === null || rawIntent.value === undefined || rawIntent.value === '' ? null : money(rawIntent.value);
  normalized.osNumero = rawIntent.osNumero === null || rawIntent.osNumero === undefined || rawIntent.osNumero === '' ? null : Number(rawIntent.osNumero);
  normalized.dataVencimento = normalizeIsoDate(rawIntent.dataVencimento) || null;
  normalized.dataPrevisao = normalizeIsoDate(rawIntent.dataPrevisao) || null;
  normalized.formaPagamento = rawIntent.formaPagamento || null;
  normalized.statusOs = SERVICE_ORDER_STATUSES.has(rawIntent.statusOs) ? rawIntent.statusOs : null;
  return normalized;
}

async function interpretSystemIntentWithOpenAI(message) {
  if (!process.env.OPENAI_API_KEY) return null;
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'intent',
      'confidence',
      'value',
      'description',
      'dataVencimento',
      'formaPagamento',
      'osNumero',
      'cliente',
      'clienteId',
      'nome',
      'telefone',
      'cpfCnpj',
      'email',
      'endereco',
      'dataPrevisao',
      'statusOs',
      'modelo',
      'observacoes',
    ],
    properties: {
      intent: {
        type: 'string',
        enum: [...SYSTEM_AI_WRITE_INTENTS, ...SYSTEM_AI_QUERY_INTENTS, 'confirmar_acao', 'desconhecida'],
      },
      confidence: { type: 'number' },
      value: { type: ['number', 'null'] },
      description: { type: ['string', 'null'] },
      dataVencimento: { type: ['string', 'null'] },
      formaPagamento: { type: ['string', 'null'], enum: ['credito', 'debito', 'pix', 'dinheiro', 'boleto', null] },
      osNumero: { type: ['number', 'null'] },
      cliente: { type: ['string', 'null'] },
      clienteId: { type: ['string', 'null'] },
      nome: { type: ['string', 'null'] },
      telefone: { type: ['string', 'null'] },
      cpfCnpj: { type: ['string', 'null'] },
      email: { type: ['string', 'null'] },
      endereco: { type: ['string', 'null'] },
      dataPrevisao: { type: ['string', 'null'] },
      statusOs: { type: ['string', 'null'], enum: ['pendente', 'em_andamento', 'concluido', 'cancelado', 'atraso', null] },
      modelo: { type: ['string', 'null'] },
      observacoes: { type: ['string', 'null'] },
    },
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SYSTEM_AI_MODEL,
      input: [
        {
          role: 'system',
          content:
            `Voce interpreta mensagens de WhatsApp para um sistema de luthieria/OS. Hoje e ${todayDate()} em ${EVALUATION_TIMEZONE}. ` +
            'Retorne apenas a intencao e entidades. Datas devem ser yyyy-mm-dd. Use confirmar_acao somente para mensagens de confirmacao. ' +
            'Operacoes de escrita serao confirmadas pelo backend antes de executar.',
        },
        { role: 'user', content: String(message || '') },
      ],
      text: { format: { type: 'json_schema', name: 'system_ai_intent', strict: true, schema } },
      max_output_tokens: 900,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `OpenAI intent HTTP ${response.status}`);
  const text = extractResponsesText(json);
  return normalizeAiIntent(JSON.parse(text || '{}'));
}

async function getSystemIntent(message) {
  const heuristic = parseFinancialIntent(message);
  try {
    const aiIntent = await interpretSystemIntentWithOpenAI(message);
    if (aiIntent && aiIntent.intent !== 'desconhecida') return aiIntent;
  } catch (error) {
    console.warn('[sistema-ia:intent] usando parser local:', error.message);
  }
  return heuristic;
}

async function ensureDefaultFinancialCategory(userId, tipo, nome, cor, conn = pool) {
  const [rows] = await conn.query(
    'SELECT id FROM categorias_financeiras WHERE user_id = ? AND tipo = ? AND LOWER(nome) = LOWER(?) LIMIT 1',
    [userId, tipo, nome],
  );
  if (rows[0]?.id) return rows[0].id;
  const id = uuid();
  await conn.query(
    `INSERT INTO categorias_financeiras (id, user_id, nome, tipo, cor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, nome, tipo, cor, now(), now()],
  );
  return id;
}

async function syncOrderFinancialStatus(conn, userId, ordemId) {
  const [[totals]] = await conn.query(
    `SELECT COALESCE(o.valor_total, COALESCE(o.valor_servicos, 0) - COALESCE(o.desconto, 0), 0) AS valor_total,
            o.status, COALESCE(SUM(CASE WHEN p.status = 'confirmado' THEN p.valor ELSE 0 END), 0) AS total_pago,
            MAX(CASE WHEN p.status = 'confirmado' THEN p.data_pagamento ELSE NULL END) AS ultima_data
       FROM ordens_servico o
       LEFT JOIN os_pagamentos p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
      WHERE o.user_id = ? AND o.id = ?
      GROUP BY o.id, o.valor_total, o.valor_servicos, o.desconto, o.status`,
    [userId, ordemId],
  );
  if (!totals) return null;
  const total = money(totals.valor_total);
  const paid = money(totals.total_pago);
  const status = totals.status === 'cancelado' ? 'cancelado' : total <= 0 || paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente';
  await conn.query(
    `UPDATE ordens_servico
        SET valor_pago = ?, status_financeiro = ?, data_ultimo_pagamento = ?, updated_at = ?
      WHERE user_id = ? AND id = ?`,
    [paid, status, totals.ultima_data, now(), userId, ordemId],
  );
  await conn.query(
    `UPDATE contas_receber
        SET valor_recebido = ?, status = ?, data_recebimento = CASE WHEN ? = 'pago' THEN ? ELSE data_recebimento END, updated_at = ?
      WHERE user_id = ? AND ordem_servico_id = ?`,
    [paid, status === 'pago' ? 'recebido' : status, status, totals.ultima_data, now(), userId, ordemId],
  );
  await syncReceivableForOrder(conn, userId, ordemId);
  return { total, paid, status };
}

async function syncReceivableForOrder(conn, userId, ordemId) {
  const [[order]] = await conn.query(
    `SELECT o.*, c.nome AS cliente_nome,
            COALESCE(p.total_pago, 0) AS total_pago,
            p.ultima_data
       FROM ordens_servico o
       LEFT JOIN clientes c ON c.user_id = o.user_id AND c.id = o.cliente_id
       LEFT JOIN (
         SELECT user_id, ordem_servico_id, COALESCE(SUM(valor), 0) AS total_pago, MAX(data_pagamento) AS ultima_data
           FROM os_pagamentos
          WHERE status = 'confirmado'
          GROUP BY user_id, ordem_servico_id
       ) p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
      WHERE o.user_id = ? AND o.id = ?
      LIMIT 1`,
    [userId, ordemId],
  );
  if (!order) return null;

  const total = money(order.valor_total ?? (Number(order.valor_servicos || 0) - Number(order.desconto || 0)));
  const paid = money(order.total_pago || 0);
  const statusFinanceiro = order.status === 'cancelado' ? 'cancelado' : total <= 0 || paid >= total ? 'pago' : paid > 0 ? 'parcial' : 'pendente';
  const dataRecebimento = statusFinanceiro === 'pago' && total > 0 ? order.ultima_data || order.data_ultimo_pagamento || order.updated_at || now() : null;
  const dueDate = String(order.data_previsao || order.data_entrega || order.data_entrada || order.created_at || todayDate()).slice(0, 10);
  const receivableStatus = statusFinanceiro === 'pago'
    ? 'recebido'
    : statusFinanceiro === 'pendente' && dueDate < todayDate()
      ? 'atrasado'
      : statusFinanceiro;

  await conn.query(
    `UPDATE ordens_servico
        SET valor_pago = ?, status_financeiro = ?, data_ultimo_pagamento = ?, updated_at = ?
      WHERE user_id = ? AND id = ?`,
    [paid, statusFinanceiro, order.ultima_data || order.data_ultimo_pagamento || null, now(), userId, ordemId],
  );

  const [existing] = await conn.query(
    'SELECT id FROM contas_receber WHERE user_id = ? AND ordem_servico_id = ? LIMIT 1',
    [userId, ordemId],
  );

  if (total <= 0 || order.status === 'cancelado') {
    if (existing[0]?.id) {
      await conn.query(
        `UPDATE contas_receber
            SET valor = ?, valor_recebido = ?, status = ?, data_recebimento = ?, updated_at = ?
          WHERE user_id = ? AND ordem_servico_id = ?`,
        [total, paid, receivableStatus, dataRecebimento, now(), userId, ordemId],
      );
      return existing[0].id;
    }
    return null;
  }

  const description = `OS #${order.numero} - ${order.cliente_nome || 'Cliente'}`;
  if (existing[0]?.id) {
    await conn.query(
      `UPDATE contas_receber
          SET cliente_id = ?, descricao = ?, valor = ?, valor_recebido = ?, data_vencimento = ?,
              data_recebimento = ?, status = ?, forma_pagamento = ?, parcelas = ?, updated_at = ?
        WHERE user_id = ? AND ordem_servico_id = ?`,
      [
        order.cliente_id,
        description,
        total,
        paid,
        dueDate,
        dataRecebimento,
        receivableStatus,
        order.forma_pagamento || null,
        Number(order.parcelas || 1),
        now(),
        userId,
        ordemId,
      ],
    );
    return existing[0].id;
  }

  const id = uuid();
  await conn.query(
    `INSERT INTO contas_receber
     (id, user_id, ordem_servico_id, cliente_id, descricao, valor, valor_recebido, data_vencimento,
      data_recebimento, status, forma_pagamento, parcelas, parcela_atual, observacoes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id,
      userId,
      ordemId,
      order.cliente_id,
      description,
      total,
      paid,
      dueDate,
      dataRecebimento,
      receivableStatus,
      order.forma_pagamento || null,
      Number(order.parcelas || 1),
      'Recebivel criado automaticamente a partir da OS',
      now(),
      now(),
    ],
  );
  return id;
}

async function ensureReceivableForOrder(conn, userId, order) {
  return syncReceivableForOrder(conn, userId, order.id);
}

async function appendOrderHistory(conn, { userId, orderId, actorUserId, event, entity, entityId, description, data }) {
  await conn.query(
    `INSERT INTO os_historico
      (id, user_id, ordem_servico_id, actor_user_id, evento, entidade, entidade_id, descricao, dados_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), userId, orderId, actorUserId || null, event, entity || null, entityId || null, description, data ? JSON.stringify(data) : null, now()],
  );
}

app.get('/api/ordens/:id/historico', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.accountId;
    const [[order]] = await pool.query(
      `SELECT o.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
              i.nome AS instrumento_nome, m.nome AS marca_nome
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
         LEFT JOIN instrumentos i ON i.id = o.instrumento_id
         LEFT JOIN marcas m ON m.id = o.marca_id
        WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
      [req.params.id, userId],
    );
    if (!order) return res.status(404).json({ error: { message: 'Ordem de serviço não encontrada' } });
    const [occurrences] = await pool.query(
      'SELECT * FROM os_ocorrencias WHERE user_id = ? AND ordem_servico_id = ? ORDER BY created_at DESC',
      [userId, order.id],
    );
    const [addenda] = await pool.query(
      'SELECT * FROM os_aditivos WHERE user_id = ? AND ordem_servico_id = ? ORDER BY numero DESC',
      [userId, order.id],
    );
    const addendumIds = addenda.map((item) => item.id);
    let items = [];
    if (addendumIds.length) {
      [items] = await pool.query(
        `SELECT * FROM os_aditivo_itens WHERE user_id = ? AND aditivo_id IN (${addendumIds.map(() => '?').join(',')}) ORDER BY created_at`,
        [userId, ...addendumIds],
      );
    }
    const [history] = await pool.query(
      'SELECT * FROM os_historico WHERE user_id = ? AND ordem_servico_id = ? ORDER BY created_at DESC',
      [userId, order.id],
    );
    const [invoices] = await pool.query(
      `SELECT id, aditivo_id, tipo_origem, nota_substituida_id, tipo_evento_fiscal, numero_nfse,
              valor_servicos, status, data_emissao, url_nota
         FROM notas_fiscais WHERE user_id = ? AND ordem_servico_id = ? ORDER BY data_emissao DESC`,
      [userId, order.id],
    );
    return res.json({ data: {
      order,
      occurrences,
      addenda: addenda.map((item) => ({ ...item, itens: items.filter((detail) => detail.aditivo_id === item.id) })),
      history,
      invoices,
    } });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/ordens/:id/ocorrencias', requireAuth, async (req, res) => {
  const title = String(req.body.titulo || '').trim();
  const description = String(req.body.descricao || '').trim();
  if (!title || !description || title.length > 255 || description.length > 10000) {
    return res.status(400).json({ error: { message: 'Informe título e descrição válidos para a ocorrência' } });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT id, numero FROM ordens_servico WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.auth.accountId]);
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ error: { message: 'Ordem de serviço não encontrada' } });
    }
    const occurrence = {
      id: uuid(), user_id: req.auth.accountId, ordem_servico_id: order.id, actor_user_id: req.auth.userId,
      tipo: String(req.body.tipo || 'novo_problema').slice(0, 50), titulo: title, descricao: description,
      status: 'aberta', created_at: now(), updated_at: now(),
    };
    await conn.query(
      `INSERT INTO os_ocorrencias (id, user_id, ordem_servico_id, actor_user_id, tipo, titulo, descricao, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, Object.values(occurrence),
    );
    await appendOrderHistory(conn, { userId: req.auth.accountId, orderId: order.id, actorUserId: req.auth.userId, event: 'ocorrencia_criada', entity: 'ocorrencia', entityId: occurrence.id, description: title, data: { tipo: occurrence.tipo, descricao: description } });
    await conn.commit();
    await writeAudit(req, { action: 'ordem.ocorrencia_criar', resource: 'ordens_servico', resourceId: order.id, details: { ocorrencia_id: occurrence.id } });
    return res.status(201).json({ data: occurrence });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: { message: error.message } });
  } finally { conn.release(); }
});

app.post('/api/ordens/:id/aditivos', requireAuth, async (req, res) => {
  const title = String(req.body.titulo || '').trim();
  const justification = String(req.body.justificativa || '').trim();
  const rawItems = Array.isArray(req.body.itens) ? req.body.itens : [];
  const items = rawItems.map((item) => {
    const quantity = money(item.quantidade || 1);
    const unitValue = money(item.valor_unitario);
    return { descricao: String(item.descricao || '').trim(), tipo: String(item.tipo || 'servico').slice(0, 30), quantidade: quantity, valor_unitario: unitValue, valor_total: money(quantity * unitValue) };
  }).filter((item) => item.descricao && item.quantidade > 0 && item.valor_unitario >= 0);
  const additionalValue = money(items.reduce((total, item) => total + item.valor_total, 0));
  if (!title || !justification || !items.length || additionalValue <= 0) {
    return res.status(400).json({ error: { message: 'Informe justificativa e ao menos um serviço adicional com valor positivo' } });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT * FROM ordens_servico WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.auth.accountId]);
    if (!order) throw Object.assign(new Error('Ordem de serviço não encontrada'), { status: 404 });
    if (order.status === 'cancelado') throw Object.assign(new Error('Não é possível criar aditivo para uma OS cancelada'), { status: 409 });
    const [[sequence]] = await conn.query('SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM os_aditivos WHERE user_id = ? AND ordem_servico_id = ?', [req.auth.accountId, order.id]);
    const previousTotal = money(order.valor_total);
    const addendum = {
      id: uuid(), user_id: req.auth.accountId, ordem_servico_id: order.id, ocorrencia_id: req.body.ocorrencia_id || null,
      numero: Number(sequence.numero), versao: 1, titulo: title, justificativa: justification, valor_adicional: additionalValue,
      valor_total_anterior: previousTotal, valor_total_novo: money(previousTotal + additionalValue), prazo_anterior: order.data_previsao || null,
      prazo_novo: req.body.prazo_novo || null, status: 'rascunho', created_by: req.auth.userId, created_at: now(), updated_at: now(),
    };
    await conn.query(
      `INSERT INTO os_aditivos
       (id,user_id,ordem_servico_id,ocorrencia_id,numero,versao,titulo,justificativa,valor_adicional,valor_total_anterior,valor_total_novo,prazo_anterior,prazo_novo,status,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(addendum),
    );
    for (const item of items) {
      await conn.query(
        `INSERT INTO os_aditivo_itens (id,user_id,aditivo_id,tipo,descricao,quantidade,valor_unitario,valor_total,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuid(), req.auth.accountId, addendum.id, item.tipo, item.descricao, item.quantidade, item.valor_unitario, item.valor_total, now()],
      );
    }
    await appendOrderHistory(conn, { userId: req.auth.accountId, orderId: order.id, actorUserId: req.auth.userId, event: 'aditivo_criado', entity: 'aditivo', entityId: addendum.id, description: `Aditivo #${addendum.numero}: ${title}`, data: { valor_adicional: additionalValue, itens: items } });
    await conn.commit();
    await writeAudit(req, { action: 'ordem.aditivo_criar', resource: 'ordens_servico', resourceId: order.id, details: { aditivo_id: addendum.id, valor_adicional: additionalValue } });
    return res.status(201).json({ data: { ...addendum, itens: items } });
  } catch (error) {
    await conn.rollback();
    return res.status(error.status || 500).json({ error: { message: error.message } });
  } finally { conn.release(); }
});

app.post('/api/ordens/:id/aditivos/:aditivoId/aprovar', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT * FROM ordens_servico WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.auth.accountId]);
    const [[addendum]] = await conn.query('SELECT * FROM os_aditivos WHERE id = ? AND ordem_servico_id = ? AND user_id = ? FOR UPDATE', [req.params.aditivoId, req.params.id, req.auth.accountId]);
    if (!order || !addendum) throw Object.assign(new Error('OS ou aditivo não encontrado'), { status: 404 });
    if (!['rascunho', 'enviado'].includes(addendum.status)) throw Object.assign(new Error('Este aditivo já foi decidido'), { status: 409 });
    const newTotal = money(Number(order.valor_total || 0) + Number(addendum.valor_adicional || 0));
    const timestamp = now();
    await conn.query(
      `UPDATE os_aditivos SET status='aprovado', valor_total_anterior=?, valor_total_novo=?, metodo_aprovacao=?,
              aprovado_por_nome=?, aprovado_por_telefone=?, aprovado_em=?, updated_at=? WHERE id=?`,
      [money(order.valor_total), newTotal, req.body.metodo_aprovacao || 'sistema', String(req.body.aprovado_por_nome || '').trim() || null, normalizePhone(req.body.aprovado_por_telefone || ''), timestamp, timestamp, addendum.id],
    );
    await conn.query('UPDATE ordens_servico SET valor_total = ?, valor_servicos = COALESCE(valor_servicos,0) + ?, data_previsao = COALESCE(?, data_previsao), updated_at = ? WHERE id = ?', [newTotal, addendum.valor_adicional, addendum.prazo_novo, timestamp, order.id]);
    await ensureReceivableForOrder(conn, req.auth.accountId, { ...order, valor_total: newTotal });
    await appendOrderHistory(conn, { userId: req.auth.accountId, orderId: order.id, actorUserId: req.auth.userId, event: 'aditivo_aprovado', entity: 'aditivo', entityId: addendum.id, description: `Aditivo #${addendum.numero} aprovado`, data: { valor_anterior: money(order.valor_total), valor_adicional: money(addendum.valor_adicional), valor_novo: newTotal } });
    await conn.commit();
    await writeAudit(req, { action: 'ordem.aditivo_aprovar', resource: 'ordens_servico', resourceId: order.id, details: { aditivo_id: addendum.id, valor_novo: newTotal } });
    return res.json({ data: { approved: true, valor_total: newTotal } });
  } catch (error) {
    await conn.rollback();
    return res.status(error.status || 500).json({ error: { message: error.message } });
  } finally { conn.release(); }
});

app.post('/api/ordens/:id/aditivos/:aditivoId/enviar', requireAuth, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT a.*,o.numero AS ordem_numero,o.cliente_id,c.nome AS cliente_nome,c.telefone
         FROM os_aditivos a JOIN ordens_servico o ON o.id=a.ordem_servico_id
         JOIN clientes c ON c.id=o.cliente_id
        WHERE a.id=? AND a.ordem_servico_id=? AND a.user_id=? LIMIT 1`,
      [req.params.aditivoId, req.params.id, req.auth.accountId],
    );
    if (!row) return res.status(404).json({ error: { message: 'Aditivo não encontrado' } });
    if (!['rascunho', 'enviado'].includes(row.status)) return res.status(409).json({ error: { message: 'Somente aditivos pendentes podem ser enviados' } });
    if (!validatePhone(row.telefone)) return res.status(400).json({ error: { message: 'Cliente sem telefone válido' } });
    const [items] = await pool.query('SELECT descricao,quantidade,valor_total FROM os_aditivo_itens WHERE user_id=? AND aditivo_id=? ORDER BY created_at', [req.auth.accountId, row.id]);
    const itemText = items.map((item) => `• ${item.descricao} (${Number(item.quantidade)}x): R$ ${Number(item.valor_total).toFixed(2).replace('.', ',')}`).join('\n');
    const message = String(req.body.mensagem || `Olá, ${row.cliente_nome}. Durante a execução da OS #${row.ordem_numero}, identificamos uma necessidade adicional:\n\n${row.justificativa}\n\n${itemText}\n\nValor adicional: R$ ${Number(row.valor_adicional).toFixed(2).replace('.', ',')}\nNovo total da OS: R$ ${Number(row.valor_total_novo).toFixed(2).replace('.', ',')}${row.prazo_novo ? `\nNova previsão: ${row.prazo_novo}` : ''}\n\nPor favor, confirme se autoriza este serviço adicional.`).trim();
    await ensureWhatsAppConnected(req.auth.accountId);
    const config = await loadWhatsAppConfig(req.auth.accountId);
    const provider = await sendEvaluationViaEvolution(row.telefone, message, config);
    const conversation = await ensureWhatsAppConversation(req.auth.accountId, { phone: row.telefone, pushName: row.cliente_nome, clientId: row.cliente_id, orderId: row.ordem_servico_id });
    const timestamp = now();
    await pool.query(
      `INSERT INTO whatsapp_mensagens
       (id,user_id,conversa_id,cliente_id,ordem_servico_id,actor_user_id,provider_message_id,direcao,tipo,conteudo,status,from_me,enviada_pelo_sistema,enviada_em,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,'saida','texto',?,'enviada',1,1,?,?,?)
       ON DUPLICATE KEY UPDATE enviada_pelo_sistema=1,ordem_servico_id=VALUES(ordem_servico_id),updated_at=VALUES(updated_at)`,
      [uuid(), req.auth.accountId, conversation.id, row.cliente_id, row.ordem_servico_id, req.auth.userId, provider.providerMessageId || null, message, timestamp, timestamp, timestamp],
    );
    await pool.query("UPDATE os_aditivos SET status='enviado',mensagem_aprovacao=?,provider_message_id=?,enviado_em=?,updated_at=? WHERE id=?", [message, provider.providerMessageId || null, timestamp, timestamp, row.id]);
    await pool.query('UPDATE whatsapp_conversas SET ultima_mensagem=?,ultima_mensagem_em=?,updated_at=? WHERE id=?', [message, timestamp, timestamp, conversation.id]);
    await appendOrderHistory(pool, { userId: req.auth.accountId, orderId: row.ordem_servico_id, actorUserId: req.auth.userId, event: 'aditivo_enviado', entity: 'aditivo', entityId: row.id, description: `Aditivo #${row.numero} enviado ao cliente`, data: { provider_message_id: provider.providerMessageId || null } });
    await writeAudit(req, { action: 'ordem.aditivo_enviar', resource: 'ordens_servico', resourceId: row.ordem_servico_id, details: { aditivo_id: row.id } });
    return res.json({ data: { sent: true, conversation_id: conversation.id } });
  } catch (error) {
    return res.status(error.status || 502).json({ error: { message: error.message } });
  }
});

app.post('/api/ordens/:id/aditivos/:aditivoId/recusar', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[addendum]] = await conn.query('SELECT * FROM os_aditivos WHERE id=? AND ordem_servico_id=? AND user_id=? FOR UPDATE', [req.params.aditivoId, req.params.id, req.auth.accountId]);
    if (!addendum) throw Object.assign(new Error('Aditivo não encontrado'), { status: 404 });
    if (!['rascunho', 'enviado'].includes(addendum.status)) throw Object.assign(new Error('Este aditivo já foi decidido'), { status: 409 });
    await conn.query("UPDATE os_aditivos SET status='recusado', recusado_em=?, updated_at=? WHERE id=?", [now(), now(), addendum.id]);
    await appendOrderHistory(conn, { userId: req.auth.accountId, orderId: req.params.id, actorUserId: req.auth.userId, event: 'aditivo_recusado', entity: 'aditivo', entityId: addendum.id, description: `Aditivo #${addendum.numero} recusado`, data: { motivo: String(req.body.motivo || '').slice(0, 1000) } });
    await conn.commit();
    return res.json({ data: { refused: true } });
  } catch (error) {
    await conn.rollback();
    return res.status(error.status || 500).json({ error: { message: error.message } });
  } finally { conn.release(); }
});

async function applyPaymentToConditions(conn, {
  userId,
  orderId,
  paymentId,
  amount,
  method,
  paidAt,
  conditionId = null,
}) {
  const [conditions] = await conn.query(
    `SELECT * FROM os_condicoes_pagamento
      WHERE user_id = ? AND ordem_servico_id = ? AND status = 'pendente'
      ORDER BY CASE WHEN id = ? THEN 0 WHEN forma_pagamento = ? THEN 1 ELSE 2 END, ordem, created_at
      FOR UPDATE`,
    [userId, orderId, conditionId || '', method],
  );
  let remaining = money(amount);
  for (const condition of conditions) {
    if (remaining <= 0) break;
    const conditionValue = money(condition.valor);
    const allocated = Math.min(remaining, conditionValue);
    if (allocated >= conditionValue) {
      await conn.query(
        `UPDATE os_condicoes_pagamento
            SET pagamento_id = ?, forma_pagamento = COALESCE(?, forma_pagamento), momento = 'agora',
                data_vencimento = ?, status = 'recebido', updated_at = ?
          WHERE id = ? AND user_id = ? AND ordem_servico_id = ?`,
        [paymentId, method, paidAt.slice(0, 10), paidAt, condition.id, userId, orderId],
      );
    } else {
      await conn.query(
        `UPDATE os_condicoes_pagamento SET valor = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND ordem_servico_id = ?`,
        [money(conditionValue - allocated), paidAt, condition.id, userId, orderId],
      );
      await conn.query(
        `INSERT INTO os_condicoes_pagamento
         (id, user_id, ordem_servico_id, pagamento_id, valor, forma_pagamento, momento,
          data_vencimento, status, observacoes, ordem, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'agora', ?, 'recebido', ?, ?, ?, ?)`,
        [uuid(), userId, orderId, paymentId, allocated, method, paidAt.slice(0, 10), 'Pagamento parcial confirmado', condition.ordem, paidAt, paidAt],
      );
    }
    remaining = money(remaining - allocated);
  }

  if (remaining > 0) {
    const [[nextOrder]] = await conn.query(
      'SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM os_condicoes_pagamento WHERE user_id = ? AND ordem_servico_id = ?',
      [userId, orderId],
    );
    await conn.query(
      `INSERT INTO os_condicoes_pagamento
       (id, user_id, ordem_servico_id, pagamento_id, valor, forma_pagamento, momento,
        data_vencimento, status, observacoes, ordem, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'agora', ?, 'recebido', ?, ?, ?, ?)`,
      [uuid(), userId, orderId, paymentId, remaining, method, paidAt.slice(0, 10), 'Pagamento confirmado', Number(nextOrder?.ordem || 1), paidAt, paidAt],
    );
  }
}

async function registerOrderPaymentInTransaction(conn, {
  userId,
  order,
  valor,
  formaPagamento,
  origem = 'manual',
  observacoes = null,
  conditionId = null,
}) {
  if (order.status === 'cancelado') throw new Error('Nao e possivel pagar uma OS cancelada');
  await ensureReceivableForOrder(conn, userId, order);

  const [[currentPaidRow]] = await conn.query(
    `SELECT COALESCE(SUM(valor), 0) AS total_pago
       FROM os_pagamentos
      WHERE user_id = ? AND ordem_servico_id = ? AND status = 'confirmado'`,
    [userId, order.id],
  );
  const orderTotal = money(order.valor_total ?? (Number(order.valor_servicos || 0) - Number(order.desconto || 0)));
  const remaining = money(orderTotal - Number(currentPaidRow?.total_pago || 0));
  const amount = money(valor ?? remaining);
  if (amount <= 0) throw new Error('Valor de pagamento invalido');
  if (remaining <= 0) throw new Error('Esta OS ja esta quitada');
  if (amount > remaining) throw new Error(`Valor maior que o saldo pendente da OS (${remaining.toFixed(2)})`);

  const categoriaId = await ensureDefaultFinancialCategory(userId, 'receita', 'Servicos', '#10B981', conn);
  const dataPagamento = now();
  const paymentId = uuid();
  const transactionId = uuid();
  const method = formaPagamento || order.forma_pagamento || null;
  if (!RECEIVED_PAYMENT_METHODS.has(method)) {
    throw new Error('Informe a forma usada no recebimento');
  }
  const description = `Pagamento OS #${order.numero} - ${order.cliente_nome || 'Cliente'}`;

  await conn.query(
    `INSERT INTO transacoes_financeiras
     (id, user_id, descricao, valor, tipo, data, categoria_id, ordem_servico_id, forma_pagamento, origem, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'receita', ?, ?, ?, ?, ?, ?, ?)`,
    [transactionId, userId, description, amount, dataPagamento, categoriaId, order.id, method, origem, dataPagamento, dataPagamento],
  );
  await conn.query(
    `INSERT INTO os_pagamentos
     (id, user_id, ordem_servico_id, cliente_id, transacao_financeira_id, valor, forma_pagamento, data_pagamento, observacoes, origem, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?)`,
    [paymentId, userId, order.id, order.cliente_id, transactionId, amount, method, dataPagamento, observacoes, origem, dataPagamento, dataPagamento],
  );

  await applyPaymentToConditions(conn, {
    userId,
    orderId: order.id,
    paymentId,
    amount,
    method,
    paidAt: dataPagamento,
    conditionId,
  });

  const financial = await syncOrderFinancialStatus(conn, userId, order.id);
  return { order, amount, transactionId, paymentId, financial, dataPagamento, method };
}

async function registerOrderPayment({ userId, ordemNumero, ordemId, valor, formaPagamento, origem = 'manual', observacoes = null, conditionId = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query(
      `SELECT o.*, c.nome AS cliente_nome
         FROM ordens_servico o
         JOIN clientes c ON c.user_id = o.user_id AND c.id = o.cliente_id
        WHERE o.user_id = ? AND ${ordemId ? 'o.id = ?' : 'o.numero = ?'}
        LIMIT 1 FOR UPDATE`,
      [userId, ordemId || ordemNumero],
    );
    const order = orders[0];
    if (!order) throw new Error('Ordem de servico nao encontrada');
    const result = await registerOrderPaymentInTransaction(conn, {
      userId, order, valor, formaPagamento, origem, observacoes, conditionId,
    });
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

const PAYMENT_METHODS = new Set(['pix', 'credito', 'debito', 'dinheiro', 'boleto', 'a_definir']);
const RECEIVED_PAYMENT_METHODS = new Set(['pix', 'credito', 'debito', 'dinheiro', 'boleto']);
const PAYMENT_MOMENTS = new Set(['agora', 'retirada', 'data']);

async function saveOrderPaymentConditions(conn, { userId, order, rawConditions, role }) {
  const [receivedConditions] = await conn.query(
    `SELECT * FROM os_condicoes_pagamento
      WHERE user_id = ? AND ordem_servico_id = ? AND status = 'recebido'
      ORDER BY ordem, created_at FOR UPDATE`,
    [userId, order.id],
  );
  const receivedIds = new Set(receivedConditions.map((condition) => condition.id));
  const orderTotal = money(order.valor_total ?? (Number(order.valor_servicos || 0) - Number(order.desconto || 0)));
  const conditions = (Array.isArray(rawConditions) ? rawConditions : [])
    .filter((condition) => !condition?.id || !receivedIds.has(condition.id))
    .filter((condition) => !(orderTotal === 0 && money(condition?.valor) === 0))
    .map((condition, index) => {
      const method = String(condition?.forma_pagamento || '').trim().toLowerCase();
      const moment = String(condition?.momento || 'retirada').trim().toLowerCase();
      const value = money(condition?.valor);
      const dueDate = condition?.data_vencimento ? String(condition.data_vencimento).slice(0, 10) : null;
      if (value <= 0) throw new Error(`Informe um valor valido na condicao ${index + 1}`);
      if (!PAYMENT_METHODS.has(method)) throw new Error(`Forma de pagamento invalida na condicao ${index + 1}`);
      if (!PAYMENT_MOMENTS.has(moment)) throw new Error(`Momento de pagamento invalido na condicao ${index + 1}`);
      if (moment === 'data' && !dueDate) throw new Error(`Informe o vencimento da condicao ${index + 1}`);
      if (moment === 'agora' && !RECEIVED_PAYMENT_METHODS.has(method)) throw new Error(`Informe a forma usada no recebimento da condicao ${index + 1}`);
      if (moment === 'agora' && role !== 'admin') throw Object.assign(new Error('Somente administradores podem confirmar valores recebidos'), { status: 403 });
      return {
        id: uuid(),
        value,
        method,
        moment,
        dueDate: moment === 'agora' ? todayDate() : moment === 'retirada' ? String(order.data_previsao || todayDate()).slice(0, 10) : dueDate,
        notes: cleanNullableText(condition?.observacoes),
        order: index + receivedConditions.length + 1,
      };
    });

  const plannedTotal = money(
    receivedConditions.reduce((sum, condition) => sum + Number(condition.valor || 0), 0)
    + conditions.reduce((sum, condition) => sum + condition.value, 0),
  );
  if (orderTotal > 0 && !conditions.length && !receivedConditions.length) {
    throw new Error('Adicione ao menos uma condicao de pagamento');
  }
  if (Math.round(plannedTotal * 100) !== Math.round(orderTotal * 100)) {
    throw new Error(`As condicoes somam R$ ${plannedTotal.toFixed(2)}, mas o total da OS e R$ ${orderTotal.toFixed(2)}`);
  }

  await conn.query(
    `DELETE FROM os_condicoes_pagamento
      WHERE user_id = ? AND ordem_servico_id = ? AND status = 'pendente'`,
    [userId, order.id],
  );

  const createdAt = now();
  for (const condition of conditions) {
    await conn.query(
      `INSERT INTO os_condicoes_pagamento
       (id, user_id, ordem_servico_id, pagamento_id, valor, forma_pagamento, momento,
        data_vencimento, status, observacoes, ordem, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?)`,
      [condition.id, userId, order.id, condition.value, condition.method, condition.moment, condition.dueDate, condition.notes, condition.order, createdAt, createdAt],
    );
  }

  for (const condition of conditions.filter((item) => item.moment === 'agora')) {
    await registerOrderPaymentInTransaction(conn, {
      userId,
      order,
      valor: condition.value,
      formaPagamento: condition.method,
      origem: 'abertura_os',
      observacoes: condition.notes || 'Pagamento confirmado na abertura da OS',
      conditionId: condition.id,
    });
  }

  const methods = [...new Set([...receivedConditions.map((item) => item.forma_pagamento), ...conditions.map((item) => item.method)].filter(Boolean))];
  const primaryMethod = methods.length > 1 ? 'misto' : methods[0] || 'a_definir';
  await conn.query(
    'UPDATE ordens_servico SET forma_pagamento = ? WHERE user_id = ? AND id = ?',
    [primaryMethod, userId, order.id],
  );
  await syncReceivableForOrder(conn, userId, order.id);

  const [savedConditions] = await conn.query(
    `SELECT * FROM os_condicoes_pagamento
      WHERE user_id = ? AND ordem_servico_id = ? AND status <> 'cancelado'
      ORDER BY ordem, created_at`,
    [userId, order.id],
  );
  return savedConditions.map((condition) => normalizeRow('os_condicoes_pagamento', condition));
}

async function createExpense({ userId, descricao, valor, formaPagamento, origem = 'manual' }) {
  const categoriaId = await ensureDefaultFinancialCategory(userId, 'despesa', 'Operacional', '#EF4444');
  const id = uuid();
  await pool.query(
    `INSERT INTO transacoes_financeiras
     (id, user_id, descricao, valor, tipo, data, categoria_id, forma_pagamento, origem, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'despesa', ?, ?, ?, ?, ?, ?)`,
    [id, userId, descricao, money(valor), now(), categoriaId, formaPagamento || null, origem, now(), now()],
  );
  return { id };
}

async function createAccountPayable({ userId, descricao, valor, dataVencimento, formaPagamento, origem = 'whatsapp_ia' }) {
  const categoriaId = await ensureDefaultFinancialCategory(userId, 'despesa', 'Operacional', '#EF4444');
  const id = uuid();
  await pool.query(
    `INSERT INTO contas_pagar
     (id, user_id, descricao, valor, data_vencimento, forma_pagamento, parcelas, status, categoria_id, recorrente, periodicidade, observacoes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'pendente', ?, 0, 'unica', ?, ?, ?)`,
    [
      id,
      userId,
      titleCaseDescription(descricao),
      money(valor),
      dataVencimento,
      formaPagamento || null,
      categoriaId,
      `Cadastrada pela IA do sistema via ${origem}`,
      now(),
      now(),
    ],
  );
  return { id, descricao: titleCaseDescription(descricao), valor: money(valor), dataVencimento };
}

async function payAccountPayable({ userId, contaId, formaPagamento, origem = 'manual' }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT cp.*, cf.id AS categoria_id_existente
         FROM contas_pagar cp
         LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
        WHERE cp.user_id = ? AND cp.id = ?
        LIMIT 1`,
      [userId, contaId],
    );
    const conta = rows[0];
    if (!conta) throw new Error('Conta a pagar nao encontrada');
    if (conta.status === 'pago') throw new Error('Conta ja esta paga');
    if (conta.status === 'cancelado') throw new Error('Conta cancelada nao pode ser paga');

    const transactionId = uuid();
    const paidAt = now();
    const categoriaId = conta.categoria_id || await ensureDefaultFinancialCategory(userId, 'despesa', 'Operacional', '#EF4444');
    await conn.query(
      `INSERT INTO transacoes_financeiras
       (id, user_id, descricao, valor, tipo, data, categoria_id, conta_pagar_id, forma_pagamento, origem, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'despesa', ?, ?, ?, ?, ?, ?, ?)`,
      [transactionId, userId, conta.descricao, money(conta.valor), paidAt, categoriaId, conta.id, formaPagamento || conta.forma_pagamento || null, origem, paidAt, paidAt],
    );
    await conn.query(
      `UPDATE contas_pagar
          SET status = 'pago', data_pagamento = ?, forma_pagamento = COALESCE(?, forma_pagamento), updated_at = ?
        WHERE user_id = ? AND id = ?`,
      [paidAt, formaPagamento || null, now(), userId, conta.id],
    );
    await conn.commit();
    return { conta, transactionId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function formatDateBr(value) {
  const iso = normalizeIsoDate(value);
  if (!iso) return '-';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function readableOrderStatus(status) {
  const labels = {
    pendente: 'pendente',
    em_andamento: 'em andamento',
    concluido: 'concluida',
    cancelado: 'cancelada',
    atraso: 'em atraso',
  };
  return labels[status] || status || '-';
}

function cleanNullableText(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function searchSystemClients(userId, query, limit = 10) {
  const term = cleanNullableText(query);
  if (!term) {
    const [rows] = await pool.query(
      `SELECT * FROM clientes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, Number(limit)],
    );
    return rows;
  }
  const like = `%${term.toLowerCase()}%`;
  const digits = term.replace(/\D/g, '');
  const [rows] = await pool.query(
    `SELECT * FROM clientes
      WHERE user_id = ?
        AND (LOWER(nome) LIKE ? OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone, ''), '+', ''), '-', ''), ' ', ''), '.', '') LIKE ? OR REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj, ''), '.', ''), '/', ''), '-', '') LIKE ?)
      ORDER BY nome ASC LIMIT ?`,
    [userId, like, `%${digits || term}%`, `%${digits || term}%`, Number(limit)],
  );
  return rows;
}

async function resolveClientForAi(userId, intent) {
  if (intent.clienteId) {
    const [rows] = await pool.query('SELECT * FROM clientes WHERE user_id = ? AND id = ? LIMIT 1', [userId, intent.clienteId]);
    return { rows };
  }
  const query = intent.cliente || intent.nome || intent.telefone || intent.cpfCnpj;
  const rows = await searchSystemClients(userId, query, 6);
  return { rows, query };
}

async function findOrderForAi(userId, intent) {
  if (!intent.osNumero) return null;
  const [rows] = await pool.query(
    `SELECT o.*, c.nome AS cliente_nome
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
      WHERE o.user_id = ? AND o.numero = ?
      LIMIT 1`,
    [userId, intent.osNumero],
  );
  return rows[0] || null;
}

async function createSystemClient({ userId, nome, telefone, cpfCnpj, email, endereco }) {
  const id = uuid();
  await pool.query(
    `INSERT INTO clientes (id, user_id, nome, cpf_cnpj, telefone, email, endereco, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, titleCaseDescription(nome), cpfCnpj || null, telefone || null, email || null, endereco || null, now(), now()],
  );
  return { id, nome: titleCaseDescription(nome) };
}

async function updateSystemClient({ userId, clienteId, nome, telefone, cpfCnpj, email, endereco }) {
  const updates = {};
  if (cleanNullableText(nome)) updates.nome = titleCaseDescription(nome);
  if (telefone !== undefined && telefone !== null) updates.telefone = cleanNullableText(telefone);
  if (cpfCnpj !== undefined && cpfCnpj !== null) updates.cpf_cnpj = cleanNullableText(cpfCnpj);
  if (email !== undefined && email !== null) updates.email = cleanNullableText(email);
  if (endereco !== undefined && endereco !== null) updates.endereco = cleanNullableText(endereco);
  const keys = Object.keys(updates);
  if (!keys.length) throw new Error('Nenhum dado de cliente informado para alterar');
  await pool.query(
    `UPDATE clientes SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')}, updated_at = ? WHERE user_id = ? AND id = ?`,
    [...keys.map((key) => updates[key]), now(), userId, clienteId],
  );
  const [rows] = await pool.query('SELECT * FROM clientes WHERE user_id = ? AND id = ? LIMIT 1', [userId, clienteId]);
  return rows[0];
}

async function deleteSystemClient({ userId, clienteId }) {
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM ordens_servico WHERE user_id = ? AND cliente_id = ?', [userId, clienteId]);
  if (Number(row?.total || 0) > 0) {
    throw new Error('Cliente possui OS vinculada. Cancele/edite as OS antes de excluir o cliente.');
  }
  await pool.query('DELETE FROM clientes WHERE user_id = ? AND id = ?', [userId, clienteId]);
  return true;
}

async function createBasicServiceOrder({ userId, clienteId, modelo, dataPrevisao, valor, formaPagamento, observacoes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [lastRows] = await conn.query(
      'SELECT numero FROM ordens_servico WHERE user_id = ? ORDER BY numero DESC LIMIT 1 FOR UPDATE',
      [userId],
    );
    const numero = Number(lastRows[0]?.numero || 0) + 1;
    const id = uuid();
    const total = money(valor || 0);
    await conn.query(
      `INSERT INTO ordens_servico
       (id, user_id, numero, cliente_id, modelo, valor_servicos, desconto, valor_total, valor_pago, status_financeiro,
        forma_pagamento, parcelas, observacoes, data_entrada, data_previsao, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 'pendente', ?, 1, ?, ?, ?, 'pendente', ?, ?)`,
      [
        id,
        userId,
        numero,
        clienteId,
        cleanNullableText(modelo),
        total,
        total,
        formaPagamento || 'pix',
        cleanNullableText(observacoes) || 'OS criada pela IA do sistema via WhatsApp',
        todayDate(),
        dataPrevisao || null,
        now(),
        now(),
      ],
    );
    await syncReceivableForOrder(conn, userId, id);
    await markRemarketingConversion(conn, userId, { id, cliente_id: clienteId, modelo: cleanNullableText(modelo) });
    await conn.commit();
    return { id, numero, valor: total, dataPrevisao };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function updateSystemServiceOrder({ userId, ordemId, statusOs, dataPrevisao, valor, formaPagamento, modelo, observacoes }) {
  const updates = {};
  if (statusOs && SERVICE_ORDER_STATUSES.has(statusOs)) {
    updates.status = statusOs;
    if (statusOs === 'concluido') updates.data_entrega = todayDate();
  }
  if (dataPrevisao !== undefined && dataPrevisao !== null) updates.data_previsao = dataPrevisao;
  if (valor !== undefined && valor !== null) {
    updates.valor_servicos = money(valor);
    updates.valor_total = money(valor);
  }
  if (formaPagamento) updates.forma_pagamento = formaPagamento;
  if (cleanNullableText(modelo)) updates.modelo = cleanNullableText(modelo);
  if (cleanNullableText(observacoes)) updates.observacoes = cleanNullableText(observacoes);
  const keys = Object.keys(updates);
  if (!keys.length) throw new Error('Nenhuma alteracao de OS informada');
  await pool.query(
    `UPDATE ordens_servico SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')}, updated_at = ? WHERE user_id = ? AND id = ?`,
    [...keys.map((key) => updates[key]), now(), userId, ordemId],
  );
  await syncReceivableForOrder(pool, userId, ordemId);
  const [rows] = await pool.query('SELECT * FROM ordens_servico WHERE user_id = ? AND id = ? LIMIT 1', [userId, ordemId]);
  return rows[0];
}

async function cancelSystemServiceOrder({ userId, ordemId }) {
  await pool.query('UPDATE ordens_servico SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?', ['cancelado', now(), userId, ordemId]);
  await syncReceivableForOrder(pool, userId, ordemId);
}

function describeClient(row) {
  return `${row.nome}${row.telefone ? ` - ${row.telefone}` : ''}${row.cpf_cnpj ? ` - ${row.cpf_cnpj}` : ''}`;
}

function describeOrder(row) {
  const remaining = Number(row.valor_total || 0) - Number(row.valor_pago || 0);
  return `OS #${row.numero} - ${row.cliente_nome || 'Cliente'} - ${readableOrderStatus(row.status)} - previsao ${formatDateBr(row.data_previsao)} - saldo R$ ${remaining.toFixed(2)}`;
}

async function prepareSystemWriteIntent(userId, intent) {
  if (intent.intent === 'registrar_despesa' && (!intent.value || intent.value <= 0)) {
    return { ok: false, reply: 'Informe um valor valido para registrar a despesa.' };
  }
  if (intent.intent === 'registrar_conta_pagar') {
    if (!intent.value || intent.value <= 0) return { ok: false, reply: 'Informe um valor valido para cadastrar a conta.' };
    if (!intent.dataVencimento) return { ok: false, reply: 'Informe a data de vencimento da conta.' };
  }
  if (intent.intent === 'registrar_pagamento_os') {
    if (!intent.osNumero) return { ok: false, reply: 'Informe o numero da OS para registrar o pagamento.' };
    const order = await findOrderForAi(userId, intent);
    if (!order) return { ok: false, reply: `Nao encontrei a OS #${intent.osNumero}.` };
    return {
      ok: true,
      intent: { ...intent, ordemId: order.id },
      actionText: `registrar pagamento da OS #${order.numero}${intent.value ? ` de R$ ${Number(intent.value).toFixed(2)}` : ' pelo saldo pendente'}`,
    };
  }
  if (intent.intent === 'cadastrar_cliente') {
    if (!cleanNullableText(intent.nome)) return { ok: false, reply: 'Informe o nome do cliente para cadastrar.' };
    return { ok: true, intent, actionText: `cadastrar cliente ${titleCaseDescription(intent.nome)}` };
  }
  if (['editar_cliente', 'excluir_cliente'].includes(intent.intent)) {
    const resolved = await resolveClientForAi(userId, intent);
    if (!resolved.rows.length) return { ok: false, reply: `Nao encontrei o cliente ${resolved.query || ''}.` };
    if (resolved.rows.length > 1) {
      return { ok: false, reply: 'Encontrei mais de um cliente. Me envie o nome completo ou telefone:\n' + resolved.rows.map(describeClient).join('\n') };
    }
    const client = resolved.rows[0];
    if (intent.intent === 'editar_cliente' && !cleanNullableText(intent.nome) && !intent.telefone && !intent.cpfCnpj && !intent.email && !intent.endereco) {
      return { ok: false, reply: 'Informe o que devo alterar no cliente.' };
    }
    return {
      ok: true,
      intent: { ...intent, clienteId: client.id, clienteNome: client.nome },
      actionText: intent.intent === 'excluir_cliente' ? `excluir cliente ${client.nome}` : `editar cliente ${client.nome}`,
    };
  }
  if (intent.intent === 'cadastrar_os') {
    if (!cleanNullableText(intent.cliente) && !intent.clienteId) return { ok: false, reply: 'Informe para qual cliente devo abrir a OS.' };
    const resolved = await resolveClientForAi(userId, intent);
    if (!resolved.rows.length) return { ok: false, reply: `Nao encontrei o cliente ${resolved.query || intent.cliente}. Cadastre o cliente primeiro.` };
    if (resolved.rows.length > 1) {
      return { ok: false, reply: 'Encontrei mais de um cliente. Me envie o nome completo ou telefone:\n' + resolved.rows.map(describeClient).join('\n') };
    }
    const client = resolved.rows[0];
    return {
      ok: true,
      intent: { ...intent, clienteId: client.id, clienteNome: client.nome },
      actionText: `abrir nova OS para ${client.nome}${intent.dataPrevisao ? ` com previsao ${formatDateBr(intent.dataPrevisao)}` : ''}`,
    };
  }
  if (['editar_os', 'cancelar_os'].includes(intent.intent)) {
    const order = await findOrderForAi(userId, intent);
    if (!order) return { ok: false, reply: `Nao encontrei a OS #${intent.osNumero || ''}.` };
    if (intent.intent === 'editar_os' && !intent.statusOs && !intent.dataPrevisao && intent.value === null && !intent.formaPagamento && !intent.modelo && !intent.observacoes) {
      return { ok: false, reply: 'Informe o que devo alterar na OS.' };
    }
    return {
      ok: true,
      intent: { ...intent, ordemId: order.id, clienteNome: order.cliente_nome },
      actionText: intent.intent === 'cancelar_os' ? `cancelar OS #${order.numero}` : `editar OS #${order.numero}`,
    };
  }

  const actionText = intent.intent === 'registrar_despesa'
    ? `registrar despesa "${intent.description}" de R$ ${Number(intent.value).toFixed(2)}`
    : intent.intent === 'registrar_conta_pagar'
      ? `cadastrar conta "${intent.description}" de R$ ${Number(intent.value).toFixed(2)} com vencimento em ${formatDateBr(intent.dataVencimento)}`
      : 'executar acao';
  return { ok: true, intent, actionText };
}

async function executeSystemWriteIntent(userId, intent) {
  if (intent.intent === 'registrar_despesa') {
    await createExpense({ userId, descricao: intent.description, valor: intent.value, formaPagamento: intent.formaPagamento, origem: 'whatsapp_ia' });
    return `Despesa registrada: ${intent.description} - R$ ${Number(intent.value).toFixed(2)}.`;
  }
  if (intent.intent === 'registrar_pagamento_os') {
    const payment = await registerOrderPayment({ userId, ordemId: intent.ordemId || null, ordemNumero: intent.osNumero, valor: intent.value, formaPagamento: intent.formaPagamento, origem: 'whatsapp_ia' });
    return `Pagamento registrado na OS #${payment.order.numero}: R$ ${Number(payment.amount).toFixed(2)}.`;
  }
  if (intent.intent === 'registrar_conta_pagar') {
    const conta = await createAccountPayable({ userId, descricao: intent.description, valor: intent.value, dataVencimento: intent.dataVencimento, formaPagamento: intent.formaPagamento, origem: 'whatsapp_ia' });
    return `Conta cadastrada: ${conta.descricao} - R$ ${Number(conta.valor).toFixed(2)}. Vencimento: ${formatDateBr(conta.dataVencimento)}.`;
  }
  if (intent.intent === 'cadastrar_cliente') {
    const client = await createSystemClient({ userId, nome: intent.nome, telefone: intent.telefone, cpfCnpj: intent.cpfCnpj, email: intent.email, endereco: intent.endereco });
    return `Cliente cadastrado: ${client.nome}.`;
  }
  if (intent.intent === 'editar_cliente') {
    const client = await updateSystemClient({ userId, clienteId: intent.clienteId, nome: intent.nome, telefone: intent.telefone, cpfCnpj: intent.cpfCnpj, email: intent.email, endereco: intent.endereco });
    return `Cliente atualizado: ${describeClient(client)}.`;
  }
  if (intent.intent === 'excluir_cliente') {
    await deleteSystemClient({ userId, clienteId: intent.clienteId });
    return `Cliente excluido: ${intent.clienteNome || intent.cliente}.`;
  }
  if (intent.intent === 'cadastrar_os') {
    const order = await createBasicServiceOrder({ userId, clienteId: intent.clienteId, modelo: intent.modelo, dataPrevisao: intent.dataPrevisao, valor: intent.value, formaPagamento: intent.formaPagamento, observacoes: intent.observacoes });
    return `OS #${order.numero} cadastrada para ${intent.clienteNome}. Previsao: ${formatDateBr(order.dataPrevisao)}.`;
  }
  if (intent.intent === 'editar_os') {
    const order = await updateSystemServiceOrder({ userId, ordemId: intent.ordemId, statusOs: intent.statusOs, dataPrevisao: intent.dataPrevisao, valor: intent.value, formaPagamento: intent.formaPagamento, modelo: intent.modelo, observacoes: intent.observacoes });
    return `OS #${order.numero} atualizada: ${readableOrderStatus(order.status)}.`;
  }
  if (intent.intent === 'cancelar_os') {
    await cancelSystemServiceOrder({ userId, ordemId: intent.ordemId });
    return `OS #${intent.osNumero} cancelada.`;
  }
  return 'Acao executada.';
}

async function transcribeAudioFromUrl(audioUrl) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nao configurada para transcricao de audio');
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error(`Falha ao baixar audio: HTTP ${audioResponse.status}`);
  const blob = await audioResponse.blob();
  const form = new FormData();
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  form.append('file', blob, 'audio.ogg');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `OpenAI transcription HTTP ${response.status}`);
  return json.text || '';
}

async function transcribeAudioFromBase64(base64Audio, mimetype = 'audio/ogg') {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nao configurada para transcricao de audio');
  const cleaned = String(base64Audio || '').replace(/^data:[^;]+;base64,/, '');
  const bytes = Buffer.from(cleaned, 'base64');
  if (!bytes.length) throw new Error('Audio em base64 vazio');
  const blob = new Blob([bytes], { type: mimetype || 'audio/ogg' });
  const form = new FormData();
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  form.append('file', blob, mimetype.includes('mpeg') ? 'audio.mp3' : 'audio.ogg');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `OpenAI transcription HTTP ${response.status}`);
  return json.text || '';
}

const recentFinancialAiReplies = new Map();

function rememberFinancialAiReply(phone, reply) {
  const key = `${normalizeWhatsappPhone(phone)}:${String(reply || '').trim()}`;
  recentFinancialAiReplies.set(key, Date.now());
  for (const [itemKey, timestamp] of recentFinancialAiReplies.entries()) {
    if (Date.now() - timestamp > 5 * 60 * 1000) recentFinancialAiReplies.delete(itemKey);
  }
}

function isRecentFinancialAiReply(phone, text) {
  const key = `${normalizeWhatsappPhone(phone)}:${String(text || '').trim()}`;
  const timestamp = recentFinancialAiReplies.get(key);
  return Boolean(timestamp && Date.now() - timestamp < 5 * 60 * 1000);
}

function getNestedValue(source, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], source);
    if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') return value;
  }
  return null;
}

function extractEvolutionWebhookMessage(body = {}) {
  const data = body.data || body;
  const key = data.key || body.key || {};
  const messageNode = data.message || body.message || {};
  const audioNode = messageNode.audioMessage || data.audioMessage || body.audioMessage || {};
  const text = getNestedValue(body, [
    'text',
    'mensagem',
    'data.text',
    'data.message.conversation',
    'data.message.extendedTextMessage.text',
    'data.message.text',
    'message.conversation',
    'message.extendedTextMessage.text',
    'message',
  ]);
  const remoteJid = key.remoteJid || data.remoteJid || body.remoteJid || body.from || body.phone || body.telefone;
  const participant = key.participant || data.participant || body.participant;
  const phone = normalizeWhatsappPhone(participant || remoteJid || body.phone || body.telefone || body.from);
  const audioUrl = getNestedValue(body, [
    'audio_url',
    'audioUrl',
    'data.audio_url',
    'data.audioUrl',
    'data.message.audioMessage.url',
    'message.audioMessage.url',
  ]);
  const audioBase64 = getNestedValue(body, [
    'audio_base64',
    'audioBase64',
    'base64',
    'data.audio_base64',
    'data.audioBase64',
    'data.message.base64',
  ]);
  const mediaBase64 = audioBase64 || getNestedValue(body, ['data.base64', 'data.message.base64', 'message.base64', 'base64']);
  const mediaNode = messageNode.audioMessage || messageNode.imageMessage || messageNode.videoMessage || messageNode.documentMessage || {};
  const mimetype = mediaNode.mimetype || body.mimetype || data.mimetype || null;
  const fileName = mediaNode.fileName || data.fileName || body.fileName || null;
  const providerMessageId = key.id || data.id || body.id || null;
  const messageTimestamp = Number(data.messageTimestamp || body.messageTimestamp || data.timestamp || body.timestamp || 0);
  const pushName = String(data.pushName || body.pushName || data.senderName || body.senderName || '').trim() || null;
  const caption = getNestedValue(body, [
    'data.message.imageMessage.caption', 'data.message.videoMessage.caption', 'data.message.documentMessage.caption',
    'message.imageMessage.caption', 'message.videoMessage.caption', 'message.documentMessage.caption',
  ]);
  const messageType = messageNode.audioMessage ? 'audio'
    : messageNode.imageMessage ? 'imagem'
      : messageNode.videoMessage ? 'video'
        : messageNode.documentMessage ? 'documento'
          : messageNode.stickerMessage ? 'figurinha'
            : messageNode.locationMessage ? 'localizacao'
              : 'texto';

  return {
    phone,
    text: String(text || caption || '').trim(),
    audioUrl,
    audioBase64,
    mimetype,
    fromMe: Boolean(key.fromMe ?? data.fromMe ?? body.fromMe),
    event: body.event || data.event || null,
    instance: body.instance || data.instance || null,
    remoteJid,
    messageKey: key.id ? { id: key.id, remoteJid: key.remoteJid, fromMe: key.fromMe, participant: key.participant } : null,
    hasAudioMessage: Boolean(messageNode.audioMessage || data.audioMessage || body.audioMessage),
    providerMessageId,
    messageTimestamp,
    pushName,
    messageType,
    mediaBase64,
    fileName,
  };
}

function safeWebhookJson(payload) {
  const json = JSON.stringify(payload, (key, value) => {
    const normalized = String(key).toLowerCase();
    if (normalized.includes('base64') || normalized === 'apikey' || normalized.includes('token')) return '[omitido]';
    return value;
  });
  if (json.length <= 250_000) return json;
  return JSON.stringify({ truncated: true, event: payload?.event || null, instance: payload?.instance || null });
}

function providerTimestamp(value) {
  if (!Number.isFinite(value) || value <= 0) return now();
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? now() : date.toISOString();
}

async function matchClientByWhatsAppPhone(userId, phone) {
  const candidates = whatsappPhoneCandidates(phone);
  if (!candidates.length) return null;
  const [clients] = await pool.query('SELECT id, nome, telefone FROM clientes WHERE user_id = ? AND telefone IS NOT NULL', [userId]);
  return clients.find((client) => {
    const stored = normalizeWhatsappPhone(client.telefone);
    return candidates.some((candidate) => stored === candidate || stored.endsWith(candidate) || candidate.endsWith(stored));
  }) || null;
}

async function ensureWhatsAppConversation(userId, { phone, remoteJid, pushName, clientId = null, orderId = null }) {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  const client = clientId ? null : await matchClientByWhatsAppPhone(userId, normalizedPhone);
  const timestamp = now();
  await pool.query(
    `INSERT INTO whatsapp_conversas
      (id,user_id,cliente_id,ordem_servico_id,telefone,remote_jid,nome_contato,status,nao_lidas,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'aberta',0,?,?)
     ON DUPLICATE KEY UPDATE cliente_id=COALESCE(cliente_id,VALUES(cliente_id)),
       ordem_servico_id=COALESCE(VALUES(ordem_servico_id),ordem_servico_id), remote_jid=COALESCE(VALUES(remote_jid),remote_jid),
       nome_contato=COALESCE(NULLIF(VALUES(nome_contato),''),nome_contato), updated_at=VALUES(updated_at)`,
    [uuid(), userId, clientId || client?.id || null, orderId || null, normalizedPhone, remoteJid || null, pushName || client?.nome || null, timestamp, timestamp],
  );
  const [[conversation]] = await pool.query('SELECT * FROM whatsapp_conversas WHERE user_id=? AND telefone=? LIMIT 1', [userId, normalizedPhone]);
  return conversation;
}

async function archiveEvolutionMessage(userId, body) {
  const parsed = extractEvolutionWebhookMessage(body);
  if (!parsed.phone || String(parsed.remoteJid || '').includes('@g.us') || String(parsed.remoteJid || '').includes('status@broadcast')) return null;
  const conversation = await ensureWhatsAppConversation(userId, parsed);
  const providerId = parsed.providerMessageId || crypto.createHash('sha256').update(`${userId}|${parsed.phone}|${parsed.fromMe}|${parsed.messageTimestamp}|${parsed.text}`).digest('hex');
  const messageId = uuid();
  const sentAt = providerTimestamp(parsed.messageTimestamp);
  const [result] = await pool.query(
    `INSERT IGNORE INTO whatsapp_mensagens
      (id,user_id,conversa_id,cliente_id,ordem_servico_id,provider_message_id,direcao,tipo,conteudo,status,from_me,enviada_pelo_sistema,enviada_em,raw_payload,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?, ?,?,?,?,0,?,?,?,?)`,
    [messageId, userId, conversation.id, conversation.cliente_id, conversation.ordem_servico_id, providerId,
      parsed.fromMe ? 'saida' : 'entrada', parsed.messageType, parsed.text || null, parsed.fromMe ? 'enviada' : 'recebida', parsed.fromMe ? 1 : 0,
      sentAt, safeWebhookJson(body), now(), now()],
  );
  if (result.affectedRows > 0) {
    const preview = parsed.text || `[${parsed.messageType}]`;
    await pool.query(
      `UPDATE whatsapp_conversas SET ultima_mensagem=?, ultima_mensagem_em=?,
              nao_lidas=nao_lidas + ?, updated_at=? WHERE id=? AND user_id=?`,
      [preview.slice(0, 1000), sentAt, parsed.fromMe ? 0 : 1, now(), conversation.id, userId],
    );
    if (parsed.messageType !== 'texto' && parsed.mediaBase64) {
      const cleanBase64 = String(parsed.mediaBase64).replace(/^data:[^;]+;base64,/, '');
      if (/^[a-zA-Z0-9+/]*={0,2}$/.test(cleanBase64) && cleanBase64.length <= 11_200_000) {
        const content = Buffer.from(cleanBase64, 'base64');
        if (content.length <= 8 * 1024 * 1024) {
          await pool.query(
            `INSERT INTO whatsapp_anexos (id,user_id,mensagem_id,tipo_mime,nome_arquivo,tamanho_bytes,conteudo,sha256,created_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [uuid(), userId, messageId, parsed.mimetype || 'application/octet-stream', String(parsed.fileName || `${parsed.messageType}-${providerId}`).slice(0, 255), content.length, content, crypto.createHash('sha256').update(content).digest('hex'), now()],
          );
        }
      }
    }
  }
  return { ...parsed, conversationId: conversation.id, messageId, inserted: result.affectedRows > 0 };
}

async function processRemarketingInbound(userId, archived) {
  if (!archived?.inserted || archived.fromMe || !archived.conversationId) return { optedOut: false };
  const [[conversation]] = await pool.query(
    'SELECT cliente_id FROM whatsapp_conversas WHERE id=? AND user_id=? LIMIT 1',
    [archived.conversationId, userId],
  );
  if (!conversation?.cliente_id) return { optedOut: false };
  const normalizedText = String(archived.text || '').trim().toLocaleLowerCase('pt-BR').replace(/[.!?]+$/g, '');
  const optedOut = REMARKETING_OPT_OUT_WORDS.has(normalizedText);
  const timestamp = now();
  if (optedOut) {
    await pool.query(
      `INSERT INTO comunicacao_preferencias
        (id,user_id,cliente_id,lembretes_manutencao_autorizado,origem_consentimento,consentido_em,descadastrado_em,motivo_descadastro,created_at,updated_at)
       VALUES (?,?,?,0,'whatsapp_optout',NULL,?,'Solicitado pelo WhatsApp',?,?)
       ON DUPLICATE KEY UPDATE lembretes_manutencao_autorizado=0,origem_consentimento='whatsapp_optout',
         consentido_em=NULL,descadastrado_em=VALUES(descadastrado_em),motivo_descadastro=VALUES(motivo_descadastro),updated_at=VALUES(updated_at)`,
      [uuid(), userId, conversation.cliente_id, timestamp, timestamp, timestamp],
    );
    await pool.query(
      `UPDATE remarketing_lembretes SET status='descadastrado',respondido_em=COALESCE(respondido_em,?),updated_at=?
        WHERE user_id=? AND cliente_id=? AND status='enviado'`,
      [timestamp, timestamp, userId, conversation.cliente_id],
    );
    return { optedOut: true };
  }
  await pool.query(
    `UPDATE remarketing_lembretes SET status='respondido',respondido_em=?,updated_at=?
      WHERE user_id=? AND cliente_id=? AND status='enviado'
      ORDER BY data_envio DESC LIMIT 1`,
    [timestamp, timestamp, userId, conversation.cliente_id],
  );
  return { optedOut: false };
}

async function sendFinancialAiReply(userId, phone, reply) {
  const whatsappConfig = await loadWhatsAppConfig(userId);
  await sendEvaluationViaEvolution(phone, reply, whatsappConfig);
  rememberFinancialAiReply(phone, reply);
}

async function getEvolutionMediaBase64(config, webhookMessage) {
  if (!webhookMessage.messageKey?.id) return null;
  if (!config || config.method !== 'webhook' || !config.webhook_url) return null;

  const baseUrl = String(config.webhook_url).replace(/\/$/, '');
  const instanceName = webhookMessage.instance || config.instance_name || 'default';
  const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.api_key || '',
    },
    body: JSON.stringify({
      message: { key: webhookMessage.messageKey },
      convertToMp4: false,
    }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Evolution media HTTP ${response.status}: ${responseText}`);
  const json = JSON.parse(responseText || '{}');
  return json.base64 || json.data?.base64 || json.media?.base64 || json.message?.base64 || null;
}

async function logFinancialAi(data) {
  const id = data.id || uuid();
  await pool.query(
    `INSERT INTO financeiro_ia_logs
     (id, user_id, autorizado_id, telefone, mensagem, tipo_mensagem, intencao, entidades, status, resposta, confirmacao_token, confirmado_em, erro, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), resposta = VALUES(resposta), confirmado_em = VALUES(confirmado_em), erro = VALUES(erro), updated_at = VALUES(updated_at)`,
    [
      id,
      data.user_id,
      data.autorizado_id || null,
      data.telefone,
      data.mensagem || null,
      data.tipo_mensagem || 'texto',
      data.intencao || null,
      data.entidades ? JSON.stringify(data.entidades) : null,
      data.status || 'recebido',
      data.resposta || null,
      data.confirmacao_token || null,
      data.confirmado_em || null,
      data.erro || null,
      data.created_at || now(),
      now(),
    ],
  );
  return id;
}

async function answerSystemQuery(userId, intent) {
  const today = todayDate();
  const month = monthRange(today);

  if (intent.intent === 'a_receber_mes' || intent.intent === 'os_pendentes_pagamento') {
    await reconcileReceivables(pool, userId);
  }

  if (intent.intent === 'contas_vencem_hoje') {
    const [rows] = await pool.query(
      `SELECT descricao, valor FROM contas_pagar
        WHERE user_id = ? AND status IN ('pendente', 'atrasado') AND LEFT(data_vencimento, 10) = ?
        ORDER BY data_vencimento ASC LIMIT 10`,
      [userId, today],
    );
    if (!rows.length) return 'Nenhuma conta a pagar vence hoje.';
    return rows.map((row) => `${row.descricao}: R$ ${Number(row.valor).toFixed(2)}`).join('\n');
  }

  if (intent.intent === 'a_receber_mes') {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(valor - COALESCE(valor_recebido, 0)), 0) AS total FROM contas_receber
        WHERE user_id = ? AND status IN ('pendente', 'parcial', 'atrasado')
          AND LEFT(data_vencimento, 10) >= ? AND LEFT(data_vencimento, 10) < ?`,
      [userId, month.start, month.next],
    );
    return `A receber este mes: R$ ${Number(row.total || 0).toFixed(2)}.`;
  }

  if (intent.intent === 'faturamento_mes') {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM transacoes_financeiras
        WHERE user_id = ? AND tipo = 'receita' AND LEFT(data, 10) >= ? AND LEFT(data, 10) < ?`,
      [userId, month.start, month.next],
    );
    return `Faturamento recebido no mes: R$ ${Number(row.total || 0).toFixed(2)}.`;
  }

  if (intent.intent === 'os_pendentes_pagamento') {
    const [rows] = await pool.query(
      `SELECT numero, valor_total, valor_pago FROM ordens_servico
        WHERE user_id = ? AND status <> 'cancelado' AND COALESCE(status_financeiro, 'pendente') IN ('pendente', 'parcial')
        ORDER BY numero DESC LIMIT 10`,
      [userId],
    );
    if (!rows.length) return 'Nenhuma OS pendente de pagamento.';
    return rows.map((row) => `OS #${row.numero}: falta R$ ${(Number(row.valor_total || 0) - Number(row.valor_pago || 0)).toFixed(2)}`).join('\n');
  }

  if (intent.intent === 'divida_cliente' && intent.cliente) {
    const [rows] = await pool.query(
      `SELECT c.nome, o.numero, o.valor_total, o.valor_pago
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
        WHERE o.user_id = ? AND LOWER(c.nome) LIKE ? AND o.status <> 'cancelado'
          AND COALESCE(o.status_financeiro, 'pendente') IN ('pendente', 'parcial')
        ORDER BY o.numero DESC LIMIT 10`,
      [userId, `%${intent.cliente.toLowerCase()}%`],
    );
    if (!rows.length) return `Nao encontrei debitos pendentes para ${intent.cliente}.`;
    const total = rows.reduce((acc, row) => acc + Number(row.valor_total || 0) - Number(row.valor_pago || 0), 0);
    return `${rows[0].nome} deve R$ ${total.toFixed(2)}.\n` + rows.map((row) => `OS #${row.numero}: R$ ${(Number(row.valor_total || 0) - Number(row.valor_pago || 0)).toFixed(2)}`).join('\n');
  }

  if (intent.intent === 'os_do_dia') {
    const targetDate = normalizeIsoDate(intent.dataPrevisao) || today;
    const [rows] = await pool.query(
      `SELECT o.*, c.nome AS cliente_nome
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
        WHERE o.user_id = ?
          AND o.status <> 'cancelado'
          AND (LEFT(o.data_previsao, 10) = ? OR LEFT(o.data_entrada, 10) = ?)
        ORDER BY o.data_previsao ASC, o.numero ASC
        LIMIT 20`,
      [userId, targetDate, targetDate],
    );
    if (!rows.length) return `Nenhuma OS encontrada para ${formatDateBr(targetDate)}.`;
    return `OS de ${formatDateBr(targetDate)}:\n` + rows.map(describeOrder).join('\n');
  }

  if (intent.intent === 'buscar_cliente') {
    const rows = await searchSystemClients(userId, intent.cliente || intent.telefone || intent.cpfCnpj, 10);
    if (!rows.length) return 'Nao encontrei cliente com esses dados.';
    return rows.map(describeClient).join('\n');
  }

  if (intent.intent === 'listar_clientes_recentes') {
    const rows = await searchSystemClients(userId, null, 10);
    if (!rows.length) return 'Nenhum cliente cadastrado ainda.';
    return 'Clientes recentes:\n' + rows.map(describeClient).join('\n');
  }

  if (intent.intent === 'buscar_os') {
    let rows = [];
    if (intent.osNumero) {
      const order = await findOrderForAi(userId, intent);
      rows = order ? [order] : [];
    } else if (intent.cliente) {
      const [orders] = await pool.query(
        `SELECT o.*, c.nome AS cliente_nome
           FROM ordens_servico o
           JOIN clientes c ON c.id = o.cliente_id
          WHERE o.user_id = ? AND LOWER(c.nome) LIKE ?
          ORDER BY o.numero DESC LIMIT 10`,
        [userId, `%${String(intent.cliente).toLowerCase()}%`],
      );
      rows = orders;
    }
    if (!rows.length) return 'Nao encontrei OS com esses dados.';
    return rows.map(describeOrder).join('\n');
  }

  return 'Nao entendi o pedido. Exemplos: "quais OS tenho hoje?", "cadastre cliente Maria telefone 61999999999", "abra OS para Maria dia 05/06" ou "registre que a OS 125 foi paga em pix".';
}

app.post('/api/ordens/salvar', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  let savedOrder = null;
  try {
    const orderPayload = req.body?.ordem || {};
    const conditions = req.body?.condicoes_pagamento;
    const cols = await getColumns('ordens_servico');
    const data = await filterDataToColumns('ordens_servico', orderPayload);
    const orderId = cleanNullableText(orderPayload.id);
    const timestamp = now();

    for (const column of ['user_id', 'valor_pago', 'status_financeiro', 'data_ultimo_pagamento', 'observacoes_financeiras']) delete data[column];
    await conn.beginTransaction();

    if (orderId) {
      const [[current]] = await conn.query(
        'SELECT * FROM ordens_servico WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
        [orderId, req.auth.accountId],
      );
      if (!current) throw Object.assign(new Error('Ordem de servico nao encontrada'), { status: 404 });
      if (req.auth.role === 'operador') {
        if (['concluido', 'cancelado'].includes(current.status)) {
          throw Object.assign(new Error('Ordens concluidas ou canceladas nao podem ser editadas pelo operador'), { status: 403 });
        }
        if (data.status) {
          const allowed = OPERATOR_STATUS_TRANSITIONS[current.status] || new Set();
          if (!allowed.has(data.status)) throw Object.assign(new Error('Transicao de status nao permitida'), { status: 403 });
        }
      }
      delete data.id;
      delete data.numero;
      delete data.created_at;
      data.updated_at = timestamp;
      if (data.valor_total === undefined && (data.valor_servicos !== undefined || data.desconto !== undefined)) {
        data.valor_total = money(Number(data.valor_servicos ?? current.valor_servicos ?? 0) - Number(data.desconto ?? current.desconto ?? 0));
      }
      if (data.status === 'concluido' && !data.data_entrega) data.data_entrega = todayDate();
      const keys = Object.keys(data);
      if (keys.length) {
        await conn.query(
          `UPDATE ordens_servico SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
          [...Object.values(data), orderId, req.auth.accountId],
        );
      }
      [[savedOrder]] = await conn.query(
        `SELECT o.*, c.nome AS cliente_nome FROM ordens_servico o
         JOIN clientes c ON c.user_id = o.user_id AND c.id = o.cliente_id
         WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
        [orderId, req.auth.accountId],
      );
    } else {
      data.id = uuid();
      data.user_id = req.auth.accountId;
      data.numero = Number(data.numero || await getNextOrderNumber(req.auth.accountId));
      data.data_entrada = data.data_entrada || todayDate();
      data.status = ['pendente', 'em_andamento'].includes(data.status) ? data.status : 'pendente';
      data.valor_total = money(data.valor_total ?? (Number(data.valor_servicos || 0) - Number(data.desconto || 0)));
      data.created_at = timestamp;
      data.updated_at = timestamp;
      const keys = Object.keys(data).filter((key) => cols.has(key));
      await conn.query(
        `INSERT INTO ordens_servico (${keys.map((key) => `\`${key}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        keys.map((key) => data[key]),
      );
      [[savedOrder]] = await conn.query(
        `SELECT o.*, c.nome AS cliente_nome FROM ordens_servico o
         JOIN clientes c ON c.user_id = o.user_id AND c.id = o.cliente_id
         WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
        [data.id, req.auth.accountId],
      );
    }

    if (!savedOrder) throw new Error('Falha ao salvar a ordem de servico');
    const [[client]] = await conn.query('SELECT id FROM clientes WHERE id = ? AND user_id = ? LIMIT 1', [savedOrder.cliente_id, req.auth.accountId]);
    if (!client) throw new Error('Cliente invalido para esta empresa');
    const savedConditions = await saveOrderPaymentConditions(conn, {
      userId: req.auth.accountId,
      order: savedOrder,
      rawConditions: conditions,
      role: req.auth.role,
    });
    await conn.commit();

    await markRemarketingConversion(pool, req.auth.accountId, savedOrder).catch(() => {});
    await writeAudit(req, {
      action: orderId ? 'ordem.atualizar_com_pagamentos' : 'ordem.criar_com_pagamentos',
      resource: 'ordens_servico',
      resourceId: savedOrder.id,
      details: { condicoes_pagamento: savedConditions.length },
    }).catch((auditError) => console.error('Falha ao auditar salvamento da OS:', auditError));
    return res.json({ data: { id: savedOrder.id, numero: savedOrder.numero, condicoes_pagamento: savedConditions }, error: null });
  } catch (error) {
    await conn.rollback();
    return res.status(error.status || 400).json({ data: null, error: { message: error.message } });
  } finally {
    conn.release();
  }
});

async function ensureLegacyPayableSeries(conn, userId) {
  const [legacyRows] = await conn.query(
    `SELECT * FROM contas_pagar
      WHERE user_id = ? AND recorrente = 1 AND periodicidade <> 'unica' AND recorrencia_id IS NULL
      FOR UPDATE`,
    [userId],
  );
  for (const conta of legacyRows) {
    const seriesId = uuid();
    await conn.query(
      `INSERT INTO contas_pagar_recorrencias
        (id,user_id,conta_origem_id,descricao,valor,categoria_id,forma_pagamento,parcelas,periodicidade,data_inicio,observacoes,ativa,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE updated_at=updated_at`,
      [seriesId, userId, conta.id, conta.descricao, conta.valor, conta.categoria_id, conta.forma_pagamento,
        conta.parcelas || 1, conta.periodicidade, String(conta.data_vencimento).slice(0, 10), conta.observacoes,
        conta.status === 'cancelado' ? 0 : 1, conta.created_at || now(), now()],
    );
    const [[series]] = await conn.query(
      'SELECT id FROM contas_pagar_recorrencias WHERE user_id=? AND conta_origem_id=? LIMIT 1',
      [userId, conta.id],
    );
    await conn.query(
      `UPDATE contas_pagar SET recorrencia_id=?, competencia=LEFT(data_vencimento,10), origem='recorrencia',
       recorrente=0, updated_at=? WHERE user_id=? AND id=?`,
      [series.id, now(), userId, conta.id],
    );
  }
}

async function materializePayableRecurrences(conn, userId, rangeStart, rangeEnd) {
  await ensureLegacyPayableSeries(conn, userId);
  const [seriesRows] = await conn.query(
    `SELECT * FROM contas_pagar_recorrencias
      WHERE user_id=? AND ativa=1 AND data_inicio < ? AND (data_fim IS NULL OR data_fim >= ?)`,
    [userId, rangeEnd, rangeStart],
  );
  let created = 0;
  for (const series of seriesRows) {
    const occurrences = occurrencesInRange({
      startDate: series.data_inicio,
      period: series.periodicidade,
      rangeStart,
      rangeEnd,
    });
    for (const competencia of occurrences) {
      const [legacyCandidates] = await conn.query(
        `SELECT id FROM contas_pagar
          WHERE user_id=? AND recorrencia_id IS NULL AND LEFT(data_vencimento,10)=?
            AND descricao=? AND valor=? AND COALESCE(categoria_id,'')=COALESCE(?,'')
            AND observacoes LIKE '%Gerada automaticamente da recorrencia%'
          ORDER BY created_at LIMIT 1 FOR UPDATE`,
        [userId, competencia, series.descricao, series.valor, series.categoria_id],
      );
      if (legacyCandidates[0]) {
        await conn.query(
          `UPDATE contas_pagar SET recorrencia_id=?, competencia=?, origem='recorrencia', updated_at=?
            WHERE user_id=? AND id=?`,
          [series.id, competencia, now(), userId, legacyCandidates[0].id],
        );
        continue;
      }

      const id = uuid();
      const status = competencia < todayDate() ? 'atrasado' : 'pendente';
      const [result] = await conn.query(
        `INSERT INTO contas_pagar
          (id,user_id,descricao,valor,data_vencimento,forma_pagamento,parcelas,status,categoria_id,
           recorrente,periodicidade,observacoes,recorrencia_id,competencia,origem,alterada_manualmente,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,0,?,?)
         ON DUPLICATE KEY UPDATE
           descricao=IF(status='cancelado' AND alterada_manualmente=0,VALUES(descricao),descricao),
           valor=IF(status='cancelado' AND alterada_manualmente=0,VALUES(valor),valor),
           data_vencimento=IF(status='cancelado' AND alterada_manualmente=0,VALUES(data_vencimento),data_vencimento),
           forma_pagamento=IF(status='cancelado' AND alterada_manualmente=0,VALUES(forma_pagamento),forma_pagamento),
           parcelas=IF(status='cancelado' AND alterada_manualmente=0,VALUES(parcelas),parcelas),
           categoria_id=IF(status='cancelado' AND alterada_manualmente=0,VALUES(categoria_id),categoria_id),
           periodicidade=IF(status='cancelado' AND alterada_manualmente=0,VALUES(periodicidade),periodicidade),
           observacoes=IF(status='cancelado' AND alterada_manualmente=0,VALUES(observacoes),observacoes),
           status=IF(status='cancelado' AND alterada_manualmente=0,VALUES(status),status),
           updated_at=IF(status='cancelado' AND alterada_manualmente=0,VALUES(updated_at),updated_at)`,
        [id, userId, series.descricao, series.valor, competencia, series.forma_pagamento, series.parcelas || 1,
          status, series.categoria_id, series.periodicidade, series.observacoes, series.id, competencia, 'recorrencia', now(), now()],
      );
      created += Number(result.affectedRows === 1);
    }
  }
  return created;
}

app.post('/api/financeiro/contas-pagar/materializar', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const rangeStart = String(req.body?.inicio || '').slice(0, 10);
    const rangeEnd = String(req.body?.fim || '').slice(0, 10);
    if (!parseDateOnly(rangeStart) || !parseDateOnly(rangeEnd) || rangeStart >= rangeEnd) {
      throw new Error('Intervalo de materializacao invalido');
    }
    await conn.beginTransaction();
    const created = await materializePayableRecurrences(conn, req.user.id, rangeStart, rangeEnd);
    await conn.commit();
    res.json({ data: { created }, error: null });
  } catch (error) {
    await conn.rollback();
    res.status(400).json({ data: null, error: { message: error.message } });
  } finally {
    conn.release();
  }
});

app.post('/api/financeiro/contas-pagar', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const input = validatePayableInput(req.body);
    await conn.beginTransaction();
    const accountId = uuid();
    let seriesId = null;
    if (input.recorrente) {
      seriesId = uuid();
      await conn.query(
        `INSERT INTO contas_pagar_recorrencias
          (id,user_id,conta_origem_id,descricao,valor,categoria_id,forma_pagamento,parcelas,periodicidade,data_inicio,observacoes,ativa,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [seriesId, req.user.id, accountId, input.descricao, input.valor, input.categoria_id, input.forma_pagamento,
          input.parcelas, input.periodicidade, input.data_vencimento, input.observacoes, now(), now()],
      );
    }
    await conn.query(
      `INSERT INTO contas_pagar
        (id,user_id,descricao,valor,data_vencimento,forma_pagamento,parcelas,status,categoria_id,recorrente,
         periodicidade,observacoes,recorrencia_id,competencia,origem,alterada_manualmente,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,0,?,?)`,
      [accountId, req.user.id, input.descricao, input.valor, input.data_vencimento, input.forma_pagamento,
        input.parcelas, input.status, input.categoria_id, input.periodicidade, input.observacoes, seriesId,
        seriesId ? input.data_vencimento : null, seriesId ? 'recorrencia' : 'manual', now(), now()],
    );
    await conn.commit();
    await writeAudit(req, { action: 'conta_pagar.criar', resource: 'contas_pagar', resourceId: accountId, details: { recorrente: input.recorrente } });
    res.json({ data: { id: accountId, recorrencia_id: seriesId }, error: null });
  } catch (error) {
    await conn.rollback();
    res.status(400).json({ data: null, error: { message: error.message } });
  } finally {
    conn.release();
  }
});

app.patch('/api/financeiro/contas-pagar/:id', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const input = validatePayableInput(req.body);
    const scope = req.body?.escopo === 'futuras' ? 'futuras' : 'ocorrencia';
    await conn.beginTransaction();
    await ensureLegacyPayableSeries(conn, req.user.id);
    const [[current]] = await conn.query('SELECT * FROM contas_pagar WHERE user_id=? AND id=? LIMIT 1 FOR UPDATE', [req.user.id, req.params.id]);
    if (!current) throw Object.assign(new Error('Conta nao encontrada'), { status: 404 });
    if (current.status === 'pago' && req.body?.escopo !== 'futuras') {
      throw Object.assign(new Error('Conta paga nao pode ser alterada. Para mudar apenas o padrao futuro, selecione esta e as proximas.'), { status: 409 });
    }

    let seriesId = current.recorrencia_id || null;
    if (!seriesId && input.recorrente) {
      seriesId = uuid();
      await conn.query(
        `INSERT INTO contas_pagar_recorrencias
          (id,user_id,conta_origem_id,descricao,valor,categoria_id,forma_pagamento,parcelas,periodicidade,data_inicio,observacoes,ativa,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [seriesId, req.user.id, current.id, input.descricao, input.valor, input.categoria_id, input.forma_pagamento,
          input.parcelas, input.periodicidade, input.data_vencimento, input.observacoes, now(), now()],
      );
    }

    if (seriesId && scope === 'futuras') {
      if (input.recorrente) {
        await conn.query(
          `UPDATE contas_pagar_recorrencias SET descricao=?,valor=?,categoria_id=?,forma_pagamento=?,parcelas=?,
           periodicidade=?,data_inicio=?,observacoes=?,ativa=1,updated_at=? WHERE user_id=? AND id=?`,
          [input.descricao, input.valor, input.categoria_id, input.forma_pagamento, input.parcelas,
            input.periodicidade, input.data_vencimento, input.observacoes, now(), req.user.id, seriesId],
        );
      } else {
        await conn.query('UPDATE contas_pagar_recorrencias SET ativa=0,data_fim=?,updated_at=? WHERE user_id=? AND id=?',
          [input.data_vencimento, now(), req.user.id, seriesId]);
      }
      await conn.query(
        `UPDATE contas_pagar SET status='cancelado',updated_at=?
          WHERE user_id=? AND recorrencia_id=? AND id<>? AND status IN ('pendente','atrasado')
            AND alterada_manualmente=0 AND LEFT(data_vencimento,10)>=?`,
        [now(), req.user.id, seriesId, current.id, String(current.data_vencimento).slice(0, 10)],
      );
    }

    const keepSeries = Boolean(seriesId && (scope === 'ocorrencia' || input.recorrente));
    const occurrenceKey = scope === 'ocorrencia'
      ? (current.competencia || String(current.data_vencimento).slice(0, 10))
      : input.data_vencimento;
    if (current.status !== 'pago') {
      await conn.query(
        `UPDATE contas_pagar SET descricao=?,valor=?,data_vencimento=?,categoria_id=?,forma_pagamento=?,parcelas=?,
         observacoes=?,status=?,recorrente=0,periodicidade=?,recorrencia_id=?,competencia=?,origem=?,
         alterada_manualmente=?,updated_at=? WHERE user_id=? AND id=?`,
        [input.descricao, input.valor, input.data_vencimento, input.categoria_id, input.forma_pagamento, input.parcelas,
          input.observacoes, input.status, keepSeries ? input.periodicidade : 'unica', keepSeries ? seriesId : null, keepSeries ? occurrenceKey : null,
          keepSeries ? 'recorrencia' : 'manual', current.recorrencia_id && scope === 'ocorrencia' ? 1 : 0,
          now(), req.user.id, current.id],
      );
    }
    await conn.commit();
    await writeAudit(req, { action: 'conta_pagar.atualizar', resource: 'contas_pagar', resourceId: current.id, details: { escopo: scope, recorrencia_id: seriesId } });
    res.json({ data: { id: current.id, recorrencia_id: keepSeries ? seriesId : null }, error: null });
  } catch (error) {
    await conn.rollback();
    res.status(error.status || 400).json({ data: null, error: { message: error.message } });
  } finally {
    conn.release();
  }
});

app.post('/api/financeiro/os/:id/pagamentos', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await registerOrderPayment({
      userId: req.user.id,
      ordemId: req.params.id,
      valor: req.body?.valor,
      formaPagamento: req.body?.forma_pagamento,
      origem: 'manual',
      observacoes: req.body?.observacoes || null,
      conditionId: req.body?.condicao_pagamento_id || null,
    });
    res.json({ data: result, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: error.message } });
  }
});

app.post('/api/financeiro/contas-pagar/:id/pagar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await payAccountPayable({
      userId: req.user.id,
      contaId: req.params.id,
      formaPagamento: req.body?.forma_pagamento,
      origem: 'manual',
    });
    res.json({ data: result, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: error.message } });
  }
});

async function handleFinancialAiWebhook(req, res) {
  const webhookMessage = extractEvolutionWebhookMessage(req.body);
  const phone = webhookMessage.phone;
  let message = webhookMessage.text;
  const audioUrl = webhookMessage.audioUrl;
  const audioBase64 = webhookMessage.audioBase64;
  const tipoMensagem = (audioUrl || audioBase64) && !message ? 'audio' : 'texto';

  try {
    if (!phone) throw new Error('Telefone ausente');
    if (String(webhookMessage.remoteJid || '').includes('@g.us') || String(webhookMessage.remoteJid || '').includes('status@broadcast')) {
      return res.json({ ignored: true, reason: 'Origem nao individual' });
    }
    if (webhookMessage.fromMe && message && isRecentFinancialAiReply(phone, message)) {
      return res.json({ ignored: true, reason: 'Mensagem enviada pela propria IA' });
    }

    const phoneCandidates = whatsappPhoneCandidates(phone);
    console.log('[financeiro-ia:webhook]', {
      event: webhookMessage.event,
      fromMe: webhookMessage.fromMe,
      remoteJid: webhookMessage.remoteJid,
      phone,
      phoneCandidates,
      tipoMensagem,
      hasText: Boolean(message),
      hasAudio: Boolean(audioUrl || audioBase64 || webhookMessage.hasAudioMessage),
    });
    if (!phoneCandidates.length) throw new Error('Telefone invalido');
    const placeholders = phoneCandidates.map(() => '?').join(', ');
    const [authorizedRows] = await pool.query(
      `SELECT * FROM financeiro_ia_autorizados
        WHERE ativo = 1
          AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') IN (${placeholders})
        ORDER BY updated_at DESC LIMIT 1`,
      phoneCandidates,
    );
    const authorized = authorizedRows[0];
    if (!authorized) {
      await logFinancialAi({ user_id: 'unauthorized', telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, status: 'bloqueado', erro: 'Numero nao autorizado' }).catch(() => {});
      return res.json({ ignored: true, reason: 'Numero nao autorizado para usar a IA do sistema' });
    }

    if (!message && audioUrl) message = await transcribeAudioFromUrl(audioUrl);
    if (!message && audioBase64) message = await transcribeAudioFromBase64(audioBase64, webhookMessage.mimetype);
    if (!message && webhookMessage.hasAudioMessage) {
      const whatsappConfig = await loadWhatsAppConfig(authorized.user_id);
      const mediaBase64 = await getEvolutionMediaBase64(whatsappConfig, webhookMessage);
      if (mediaBase64) message = await transcribeAudioFromBase64(mediaBase64, webhookMessage.mimetype);
    }
    if (!message) {
      const reply = 'Nao consegui ler a mensagem. Envie texto ou audio com arquivo acessivel.';
      await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: null, tipo_mensagem: tipoMensagem, status: 'erro', resposta: reply, erro: 'Mensagem vazia' });
      await sendFinancialAiReply(authorized.user_id, phone, reply);
      return res.json({ reply, whatsapp_sent: true });
    }

    const intent = await getSystemIntent(message);

    if (intent.intent === 'confirmar_acao') {
      const queryParams = [authorized.user_id, phone];
      let tokenFilter = '';
      if (intent.token) {
        tokenFilter = 'AND confirmacao_token = ?';
        queryParams.push(intent.token);
      }

      const [logs] = await pool.query(
        `SELECT * FROM financeiro_ia_logs
          WHERE user_id = ? AND telefone = ? ${tokenFilter} AND status = 'aguardando_confirmacao'
          ORDER BY created_at DESC LIMIT 1`,
        queryParams,
      );
      const pending = logs[0];
      if (!pending) {
        const reply = intent.token
          ? 'Nao encontrei uma acao pendente para esse codigo.'
          : 'Nao encontrei uma acao pendente para confirmar.';
        await sendFinancialAiReply(authorized.user_id, phone, reply);
        return res.json({ reply, whatsapp_sent: true });
      }
      const entities = typeof pending.entidades === 'string' ? JSON.parse(pending.entidades || '{}') : pending.entidades || {};
      const reply = await executeSystemWriteIntent(authorized.user_id, { ...entities, intent: pending.intencao });
      await logFinancialAi({ id: pending.id, user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: pending.mensagem, tipo_mensagem: pending.tipo_mensagem, intencao: pending.intencao, entidades, status: 'executado', resposta: reply, confirmacao_token: intent.token || pending.confirmacao_token, confirmado_em: now() });
      await sendFinancialAiReply(authorized.user_id, phone, reply);
      return res.json({ reply, whatsapp_sent: true });
    }

    if (SYSTEM_AI_WRITE_INTENTS.has(intent.intent)) {
      if (!canWriteSystem(authorized.permissao)) {
        const reply = 'Seu numero tem permissao apenas de consulta.';
        await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'negado', resposta: reply });
        await sendFinancialAiReply(authorized.user_id, phone, reply);
        return res.status(403).json({ reply, whatsapp_sent: true });
      }
      if (SYSTEM_AI_ADMIN_INTENTS.has(intent.intent) && !canAdminSystem(authorized.permissao)) {
        const reply = 'Essa acao exige permissao admin.';
        await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'negado', resposta: reply });
        await sendFinancialAiReply(authorized.user_id, phone, reply);
        return res.status(403).json({ reply, whatsapp_sent: true });
      }
      const prepared = await prepareSystemWriteIntent(authorized.user_id, intent);
      if (!prepared.ok) {
        await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'erro', resposta: prepared.reply });
        await sendFinancialAiReply(authorized.user_id, phone, prepared.reply);
        return res.json({ reply: prepared.reply, whatsapp_sent: true });
      }
      const preparedIntent = prepared.intent || intent;
      const token = crypto.randomBytes(3).toString('hex').toUpperCase();
      const reply = `Confirme para ${prepared.actionText}. Responda: confirmar ${token}`;
      await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: preparedIntent.intent, entidades: preparedIntent, status: 'aguardando_confirmacao', resposta: reply, confirmacao_token: token });
      await sendFinancialAiReply(authorized.user_id, phone, reply);
      return res.json({ reply, confirmation_required: true, token, whatsapp_sent: true });
    }

    const reply = await answerSystemQuery(authorized.user_id, intent);
    await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'respondido', resposta: reply });
    await sendFinancialAiReply(authorized.user_id, phone, reply);
    res.json({ reply, whatsapp_sent: true });
  } catch (error) {
    res.status(400).json({ reply: `Erro: ${error.message}`, error: { message: error.message } });
  }
}

function safeSecretMatch(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

async function handleEvolutionWebhook(req, res) {
  if (!safeSecretMatch(req.params.secret, EVOLUTION_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: { message: 'Webhook não autorizado' } });
  }

  const instanceName = req.body?.instance || req.body?.data?.instance || req.body?.instanceName || null;
  if (!instanceName) return res.status(400).json({ error: { message: 'Instância ausente no webhook' } });

  const [rows] = await pool.query(
    'SELECT * FROM configuracoes_whatsapp WHERE instance_name = ? LIMIT 1',
    [instanceName],
  );
  const config = rows[0];
  if (!config) return res.status(404).json({ error: { message: 'Instância não vinculada ao UltraOS' } });

  const event = String(req.body?.event || '').replaceAll('.', '_').replaceAll('-', '_').toUpperCase();
  if (event === 'LOGOUT_INSTANCE' || event === 'REMOVE_INSTANCE') {
    const reason = event === 'REMOVE_INSTANCE' ? 'instance_removed' : 'logged_out';
    await saveManagedWhatsApp(config.user_id, {
      status: 'desconectado',
      disconnected_at: now(),
      last_event_at: now(),
      last_checked_at: now(),
      disconnect_reason: reason,
      connection_status_code: null,
      last_error: null,
    });
    return res.json({ received: true, status: 'desconectado', reason });
  }

  if (event === 'CONNECTION_UPDATE') {
    const rawState = req.body?.data?.state || req.body?.state || connectionStateFromPayload(req.body);
    const status = connectionStatusFromPayload({ ...req.body, state: rawState });
    const disconnect = disconnectDetailsFromPayload(req.body, status === 'desconectado' ? rawState || 'connection_closed' : null);
    const phoneNumber = String(req.body?.data?.wuid || req.body?.data?.number || '').split('@')[0] || config.phone_number;
    await saveManagedWhatsApp(config.user_id, {
      status,
      phone_number: phoneNumber || null,
      connected_at: status === 'conectado' ? config.connected_at || now() : config.connected_at,
      disconnected_at: status === 'desconectado' ? now() : null,
      last_event_at: now(),
      last_checked_at: now(),
      disconnect_reason: status === 'desconectado' ? disconnect.reason || 'connection_closed' : null,
      connection_status_code: status === 'desconectado' ? disconnect.statusCode : null,
      last_error: null,
    });
    return res.json({ received: true, status });
  }

  if (event === 'QRCODE_UPDATED') {
    await saveManagedWhatsApp(config.user_id, {
      status: 'aguardando_qr',
      last_event_at: now(),
      last_checked_at: now(),
      disconnect_reason: null,
      connection_status_code: null,
      last_error: null,
    });
    return res.json({ received: true, status: 'aguardando_qr' });
  }

  if (event === 'MESSAGES_UPSERT' || event === 'SEND_MESSAGE') {
    const archived = await archiveEvolutionMessage(config.user_id, req.body);
    if (!archived || archived.fromMe || event === 'SEND_MESSAGE') {
      return res.json({ received: true, archived: Boolean(archived?.inserted), event });
    }
    const remarketing = await processRemarketingInbound(config.user_id, archived);
    if (remarketing.optedOut) {
      return res.json({ received: true, archived: Boolean(archived.inserted), event, remarketing_optout: true });
    }
    return handleFinancialAiWebhook(req, res);
  }
  if (event === 'MESSAGES_UPDATE' || event === 'MESSAGES_DELETE') {
    const parsed = extractEvolutionWebhookMessage(req.body);
    const providerId = parsed.providerMessageId;
    if (providerId) {
      const status = event === 'MESSAGES_DELETE' ? 'apagada' : String(req.body?.data?.status || req.body?.status || 'atualizada').toLowerCase();
      const [[message]] = await pool.query('SELECT id FROM whatsapp_mensagens WHERE user_id=? AND provider_message_id=? LIMIT 1', [config.user_id, providerId]);
      await pool.query(
        `UPDATE whatsapp_mensagens SET status=?,apagada_em=?,entregue_em=CASE WHEN ? IN ('delivery_ack','entregue') THEN ? ELSE entregue_em END,
                lida_em=CASE WHEN ? IN ('read','played','lida') THEN ? ELSE lida_em END,updated_at=?
          WHERE user_id=? AND provider_message_id=?`,
        [status, event === 'MESSAGES_DELETE' ? now() : null, status, now(), status, now(), now(), config.user_id, providerId],
      );
      await pool.query(
        'INSERT INTO whatsapp_mensagem_eventos (id,user_id,mensagem_id,provider_message_id,evento,dados_json,created_at) VALUES (?,?,?,?,?,?,?)',
        [uuid(), config.user_id, message?.id || null, providerId, event.toLowerCase(), safeWebhookJson(req.body), now()],
      );
    }
    return res.json({ received: true, event });
  }
  return res.json({ received: true, event });
}

app.post('/api/financeiro/ia/webhook', handleFinancialAiWebhook);
app.post('/api/webhooks/evolution/:secret', handleEvolutionWebhook);

let whatsappReconciliationRunning = false;

async function runWhatsAppReconciliation() {
  if (whatsappReconciliationRunning || !EVOLUTION_API_URL || !EVOLUTION_API_KEY) return;
  whatsappReconciliationRunning = true;
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, instance_name, status, phone_number, profile_name, profile_picture_url,
              connected_at, disconnected_at, last_event_at, last_checked_at, disconnect_reason,
              connection_status_code, last_error, created_at, updated_at
         FROM configuracoes_whatsapp
        WHERE provider = 'evolution' AND COALESCE(NULLIF(instance_name, ''), '') <> ''`,
    );
    for (const row of rows) {
      try {
        if (!configuredEvolutionWebhooks.has(row.instance_name)) await configureEvolutionWebhook(row.instance_name);
        await synchronizeWhatsAppConnection(row);
      } catch (error) {
        // Falha da infraestrutura não significa que o usuário deslogou. Mantemos
        // o último estado conhecido e registramos somente a falha da verificação.
        await pool.query(
          'UPDATE configuracoes_whatsapp SET last_checked_at = ?, last_error = ?, updated_at = ? WHERE id = ?',
          [now(), `Falha temporária ao verificar conexão: ${error.message}`, now(), row.id],
        ).catch(() => {});
      }
    }
  } catch (error) {
    console.error('[whatsapp-reconcile] Erro no ciclo:', error.message);
  } finally {
    whatsappReconciliationRunning = false;
  }
}

function startWhatsAppReconciliationJob() {
  if (!WHATSAPP_RECONCILE_ENABLED) {
    console.log('[whatsapp-reconcile] Desabilitado por WHATSAPP_RECONCILE_ENABLED=false');
    return;
  }
  const initialTimer = setTimeout(() => void runWhatsAppReconciliation(), 15_000);
  const interval = setInterval(() => void runWhatsAppReconciliation(), WHATSAPP_RECONCILE_INTERVAL_MS);
  initialTimer.unref?.();
  interval.unref?.();
  console.log(`[whatsapp-reconcile] Ativo. Intervalo ${WHATSAPP_RECONCILE_INTERVAL_MS}ms.`);
}

let evaluationJobRunning = false;

function datePartsInTimeZone(timeZone = EVALUATION_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    hour12: false,
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType;
}

function todayInTimeZone(timeZone = EVALUATION_TIMEZONE) {
  const parts = datePartsInTimeZone(timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentHourInTimeZone(timeZone = EVALUATION_TIMEZONE) {
  return Number(datePartsInTimeZone(timeZone).hour || 0);
}

function dateDaysAgo(days, timeZone = EVALUATION_TIMEZONE) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 0));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(phone) {
  const original = String(phone || '').trim();
  const cleaned = original.replace(/\D/g, '');
  if (!cleaned) return '';
  if (original.startsWith('+') || cleaned.startsWith('55')) return cleaned;
  return `55${cleaned}`;
}

function validatePhone(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 13;
}

function buildBackendEvaluationMessage(order, settings) {
  return `E ai ${order.cliente_nome}! Beleza?

Espero que esteja feliz com o reparo do seu instrumento!

Poderia nos ajudar avaliando nosso trabalho no Google?
Sua avaliacao ajuda outros musicos a me conhecerem!
Link para avaliar: ${settings.googleReviewLink}

Muito obrigado pela confianca!
Forte abraco`;
}

async function ensureEvaluationConfig(userId) {
  await pool.query(
    `INSERT INTO configuracoes_empresa
     (id, user_id, avaliacoes_enabled, avaliacoes_days_after_completion, avaliacoes_trigger_hour, avaliacoes_daily_limit, avaliacoes_min_interval_seconds, created_at, updated_at)
     VALUES (?, ?, 1, 7, 11, 20, 20, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [uuid(), userId, now(), now()],
  );
}

async function loadEvaluationSettings(userId) {
  await ensureEvaluationConfig(userId);

  const [rows] = await pool.query(
    `SELECT google_review_link, instagram_handle, avaliacoes_enabled, avaliacoes_days_after_completion,
            avaliacoes_trigger_hour, avaliacoes_daily_limit, avaliacoes_min_interval_seconds,
            avaliacoes_last_processed_date
       FROM configuracoes_empresa
      WHERE user_id = ?
      LIMIT 1`,
    [userId],
  );

  const row = rows[0] || {};
  return {
    enabled: row.avaliacoes_enabled === null || row.avaliacoes_enabled === undefined
      ? EVALUATION_DEFAULTS.enabled
      : Boolean(row.avaliacoes_enabled),
    daysAfterCompletion: Number(row.avaliacoes_days_after_completion || EVALUATION_DEFAULTS.daysAfterCompletion),
    triggerHour: Number(row.avaliacoes_trigger_hour || EVALUATION_DEFAULTS.triggerHour),
    dailyLimit: Math.max(1, Number(row.avaliacoes_daily_limit || EVALUATION_DEFAULTS.dailyLimit)),
    minIntervalSeconds: Math.max(5, Number(row.avaliacoes_min_interval_seconds || EVALUATION_DEFAULTS.minIntervalSeconds)),
    googleReviewLink: row.google_review_link || EVALUATION_DEFAULTS.googleReviewLink,
    instagramHandle: row.instagram_handle || EVALUATION_DEFAULTS.instagramHandle,
    lastProcessedDate: row.avaliacoes_last_processed_date || null,
  };
}

async function loadWhatsAppConfig(userId) {
  const [rows] = await pool.query(
    'SELECT user_id, method, provider, webhook_url, api_key, instance_name, status FROM configuracoes_whatsapp WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const row = rows[0] || null;
  if (!row) return null;
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && row.instance_name) {
    return { ...row, method: 'webhook', webhook_url: EVOLUTION_API_URL, api_key: EVOLUTION_API_KEY };
  }
  return { ...row, api_key: decryptSecret(row.api_key) };
}

async function reserveEvaluationProcessing(userId, today) {
  const [result] = await pool.query(
    `UPDATE configuracoes_empresa
        SET avaliacoes_last_processed_date = ?, updated_at = ?
      WHERE user_id = ?
        AND (avaliacoes_last_processed_date IS NULL OR avaliacoes_last_processed_date <> ?)`,
    [today, now(), userId, today],
  );
  return Number(result.affectedRows || 0) > 0;
}

async function getPendingEvaluationOrdersForUser(userId, settings) {
  const cutoffDate = dateDaysAgo(settings.daysAfterCompletion);
  const limit = settings.dailyLimit;
  const candidateLimit = Math.max(100, limit * 5);
  const [rows] = await pool.query(
    `SELECT o.id AS ordem_id,
            o.numero AS ordem_numero,
            o.cliente_id,
            o.modelo,
            COALESCE(NULLIF(o.data_entrega, ''), NULLIF(o.data_previsao, '')) AS data_conclusao,
            c.nome AS cliente_nome,
            c.telefone AS cliente_telefone,
            COALESCE(i.nome, 'Instrumento') AS instrumento_nome,
            COALESCE(m.nome, '') AS marca_nome,
            al.status AS lembrete_status,
            al.tentativas AS tentativas
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN instrumentos i ON i.id = o.instrumento_id
       LEFT JOIN marcas m ON m.id = o.marca_id
       LEFT JOIN avaliacoes_lembretes al
              ON al.user_id = o.user_id
             AND al.ordem_servico_id = o.id
      WHERE o.user_id = ?
        AND o.status = 'concluido'
        AND COALESCE(c.avaliou, 0) = 0
        AND COALESCE(NULLIF(c.telefone, ''), '') <> ''
        AND COALESCE(NULLIF(o.data_entrega, ''), NULLIF(o.data_previsao, '')) IS NOT NULL
        AND DATE(COALESCE(NULLIF(o.data_entrega, ''), NULLIF(o.data_previsao, ''))) <= ?
        AND (al.status IS NULL OR al.status NOT IN ('enviado', 'respondido', 'cancelado', 'processando'))
        AND NOT (COALESCE(o.solicita_avaliacao, 0) = 1 AND al.id IS NULL)
      ORDER BY DATE(COALESCE(NULLIF(o.data_entrega, ''), NULLIF(o.data_previsao, ''))) ASC
      LIMIT ?`,
    [userId, cutoffDate, candidateLimit],
  );
  const uniqueByClient = [];
  const clientIds = new Set();
  for (const row of rows) {
    if (clientIds.has(row.cliente_id)) continue;
    clientIds.add(row.cliente_id);
    uniqueByClient.push(row);
    if (uniqueByClient.length >= limit) break;
  }
  return uniqueByClient;
}

async function upsertEvaluationLog(userId, order, status, extra = {}) {
  const data = {
    id: uuid(),
    user_id: userId,
    ordem_servico_id: order.ordem_id,
    cliente_id: order.cliente_id,
    status,
    created_at: now(),
    updated_at: now(),
    ...extra,
  };
  const keys = Object.keys(data);
  const updates = keys
    .filter((key) => key !== 'id' && key !== 'user_id' && key !== 'ordem_servico_id' && key !== 'created_at')
    .map((key) => `\`${key}\` = VALUES(\`${key}\`)`)
    .join(', ');

  await pool.query(
    `INSERT INTO avaliacoes_lembretes (${keys.map((key) => `\`${key}\``).join(',')})
     VALUES (${keys.map(() => '?').join(',')})
     ON DUPLICATE KEY UPDATE ${updates}`,
    Object.values(data),
  );
}

async function sendEvaluationViaEvolution(phone, message, config) {
  if (!config || config.method !== 'webhook' || !config.webhook_url) {
    throw new Error('Backend exige WhatsApp por webhook/Evolution API para envio automatico');
  }

  const baseUrl = String(config.webhook_url).replace(/\/$/, '');
  const instanceName = config.instance_name || 'default';
  const url = `${baseUrl}/message/sendText/${instanceName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.api_key || '',
    },
    body: JSON.stringify({
      number: normalizePhone(phone),
      text: message,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    let details = responseText;
    try { details = JSON.parse(responseText); } catch {}
    const error = new Error(`Evolution API HTTP ${response.status}`);
    error.status = response.status;
    error.details = details;
    const disconnect = disconnectDetailsFromError(error);
    if (disconnect.disconnected && config.user_id) {
      await saveManagedWhatsApp(config.user_id, {
        status: 'desconectado',
        disconnected_at: now(),
        last_checked_at: now(),
        disconnect_reason: disconnect.reason,
        connection_status_code: disconnect.statusCode,
        last_error: 'Sessão do WhatsApp perdeu a autorização e precisa ser reconectada.',
      }).catch(() => {});
      error.status = 409;
      error.message = 'WhatsApp desconectado pelo celular. Reconecte o número pelo QR Code antes de enviar.';
    }
    throw error;
  }

  let responseData = null;
  try {
    responseData = JSON.parse(responseText);
  } catch {}
  return {
    providerMessageId: responseData?.key?.id || responseData?.messageId || responseData?.id || null,
  };
}

async function sendMediaViaEvolution(phone, attachment, config) {
  if (!config || config.method !== 'webhook' || !config.webhook_url) {
    throw new Error('Backend exige WhatsApp por webhook/Evolution API para envio automatico');
  }

  const baseUrl = String(config.webhook_url).replace(/\/$/, '');
  const instanceName = config.instance_name || 'default';
  const response = await fetch(`${baseUrl}/message/sendMedia/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.api_key || '',
    },
    body: JSON.stringify({
      number: normalizePhone(phone),
      mediatype: 'document',
      mimetype: attachment.mimeType,
      caption: 'Ordem de serviço em PDF',
      media: attachment.dataBase64,
      fileName: attachment.fileName,
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    const error = new Error(`Evolution API (PDF) HTTP ${response.status}`);
    error.status = response.status;
    error.details = responseText;
    throw error;
  }
  let responseData = null;
  try { responseData = JSON.parse(responseText); } catch {}
  return { providerMessageId: responseData?.key?.id || responseData?.messageId || responseData?.id || null };
}

async function processEvaluationsForUser(userId) {
  const settings = await loadEvaluationSettings(userId);
  if (!settings.enabled) return { sent: 0, errors: 0, skipped: 0 };

  const currentHour = currentHourInTimeZone();
  if (currentHour !== settings.triggerHour) return { sent: 0, errors: 0, skipped: 0 };

  const whatsappConfig = await loadWhatsAppConfig(userId);
  if (!whatsappConfig || whatsappConfig.method !== 'webhook' || !whatsappConfig.webhook_url) {
    console.warn(`[avaliacoes-job] Usuario ${userId} sem webhook WhatsApp configurado; envio automatico ignorado.`);
    return { sent: 0, errors: 0, skipped: 0 };
  }

  const today = todayInTimeZone();
  if (!(await reserveEvaluationProcessing(userId, today))) {
    return { sent: 0, errors: 0, skipped: 0 };
  }

  const pendingOrders = await getPendingEvaluationOrdersForUser(userId, settings);
  const result = { sent: 0, errors: 0, skipped: 0 };

  for (let i = 0; i < pendingOrders.length; i++) {
    const order = pendingOrders[i];
    const message = buildBackendEvaluationMessage(order, settings);

    if (!validatePhone(order.cliente_telefone)) {
      await upsertEvaluationLog(userId, order, 'erro', {
        telefone: order.cliente_telefone,
        mensagem: message,
        mensagem_erro: 'Telefone invalido para envio de WhatsApp',
        tentativas: Number(order.tentativas || 0) + 1,
      });
      result.errors++;
      continue;
    }

    if (i > 0) await sleep(settings.minIntervalSeconds * 1000);

    try {
      await upsertEvaluationLog(userId, order, 'processando', {
        telefone: order.cliente_telefone,
        mensagem: message,
        mensagem_erro: null,
        tentativas: Number(order.tentativas || 0) + 1,
      });
      await sendEvaluationViaEvolution(order.cliente_telefone, message, whatsappConfig);
      await upsertEvaluationLog(userId, order, 'enviado', {
        telefone: order.cliente_telefone,
        mensagem: message,
        mensagem_erro: null,
        data_envio: now(),
      });
      await pool.query(
        'UPDATE ordens_servico SET solicita_avaliacao = 1, updated_at = ? WHERE id = ? AND user_id = ?',
        [now(), order.ordem_id, userId],
      );
      result.sent++;
    } catch (error) {
      await upsertEvaluationLog(userId, order, 'erro', {
        telefone: order.cliente_telefone,
        mensagem: message,
        mensagem_erro: error.message,
      });
      result.errors++;
    }
  }

  if (result.sent || result.errors) {
    console.log(`[avaliacoes-job] Usuario ${userId}: ${result.sent} enviados, ${result.errors} erros.`);
  }

  return result;
}

async function runEvaluationBackendJob() {
  if (evaluationJobRunning) return;
  evaluationJobRunning = true;

  try {
    const [users] = await pool.query(
      `SELECT u.id
         FROM usuarios u
         LEFT JOIN configuracoes_empresa ce ON ce.user_id = u.id
        WHERE COALESCE(u.ativo, 1) = 1
          AND COALESCE(ce.avaliacoes_enabled, 1) = 1`,
    );

    for (const user of users) {
      await processEvaluationsForUser(user.id);
    }
  } catch (error) {
    console.error('[avaliacoes-job] Erro no processamento automatico:', error);
  } finally {
    evaluationJobRunning = false;
  }
}

function startEvaluationBackendJob() {
  if (!EVALUATION_JOB_ENABLED) {
    console.log('[avaliacoes-job] Desabilitado por EVALUATION_JOB_ENABLED=false');
    return;
  }

  setTimeout(() => void runEvaluationBackendJob(), 10_000);
  setInterval(() => void runEvaluationBackendJob(), EVALUATION_JOB_INTERVAL_MS);
  console.log(`[avaliacoes-job] Ativo. Intervalo ${EVALUATION_JOB_INTERVAL_MS}ms, timezone ${EVALUATION_TIMEZONE}.`);
}

const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

async function startServer() {
  const databaseWarmupStartedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    console.log(`[startup] MySQL pronto em ${Date.now() - databaseWarmupStartedAt}ms.`);
  } catch (error) {
    console.error('[startup] Nao foi possivel conectar ao MySQL:', error.code || error.message);
    process.exitCode = 1;
    return;
  }

  app.listen(PORT, HOST, () => {
    console.log(`Sistema OS API rodando em ${HOST}:${PORT}`);
    startWhatsAppReconciliationJob();
    startEvaluationBackendJob();
  });
}

void startServer();
