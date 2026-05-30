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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.JWT_TTL || '12h';
const uploadsDir = path.join(rootDir, 'uploads');
const EVALUATION_JOB_ENABLED = process.env.EVALUATION_JOB_ENABLED !== 'false';
const EVALUATION_JOB_INTERVAL_MS = Number(process.env.EVALUATION_JOB_INTERVAL_MS || 60_000);
const EVALUATION_TIMEZONE = process.env.EVALUATION_TIMEZONE || 'America/Sao_Paulo';
const EVALUATION_DEFAULTS = {
  enabled: true,
  daysAfterCompletion: 7,
  triggerHour: 11,
  dailyLimit: 20,
  minIntervalSeconds: 20,
  googleReviewLink: 'https://g.page/r/Cd8CHsL7KDxCEBM/review',
  instagramHandle: '@luthieriabrasilia',
};

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
]);

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
      nivel: user.nivel || 'usuario',
    },
  };
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

    if (!cols.has(mappedKey)) continue;
    if (Array.isArray(mappedValue) || (mappedValue && typeof mappedValue === 'object' && !(mappedValue instanceof Date))) {
      mappedValue = JSON.stringify(mappedValue);
    }
    normalized[mappedKey] = mappedValue;
  }

  if (cols.has('updated_at') && !('updated_at' in normalized)) normalized.updated_at = now();
  return normalized;
}

async function normalizeRows(table, rows, select) {
  const out = rows.map((row) => normalizeRow(table, row));
  await attachRelations(table, out, select || '');
  return out;
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

  return copy;
}

async function attachRelations(table, rows, select) {
  const relations = relationMap[table];
  if (!relations || !rows.length) return;

  for (const [alias, [targetTable, fk]] of Object.entries(relations)) {
    if (!select.includes(`${alias}:`) && !select.includes(targetTable)) continue;
    const ids = [...new Set(rows.map((row) => row[fk]).filter(Boolean))];
    if (!ids.length) continue;

    const placeholders = ids.map(() => '?').join(',');
    const [relatedRows] = await pool.query(
      `SELECT * FROM \`${targetTable}\` WHERE id IN (${placeholders})`,
      ids,
    );
    const relatedById = new Map(relatedRows.map((row) => [row.id, normalizeRow(targetTable, row)]));
    for (const row of rows) row[alias] = relatedById.get(row[fk]) || null;
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: { message: 'Sessao invalida' } });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.sub, email: decoded.email, aud: 'authenticated' };
    next();
  } catch {
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
       (id, email, senha_hash, nivel, plano_atual, dias_restantes, status_assinatura, ativo, email_verificado, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'trial', 14, 'ativo', 1, 1, ?, ?)`,
      [id, email, hash, 'usuario', createdAt, createdAt],
    );

    const user = await findUserById(id);
    const token = signUser(user);
    res.status(201).json({ session: { access_token: token, token_type: 'bearer', user: publicUser(user) }, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.get('/api/auth/session', requireAuth, async (req, res) => {
  const user = await findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: { message: 'Sessao invalida' } });
  res.json({ session: { access_token: req.headers.authorization.slice(7), token_type: 'bearer', user: publicUser(user) }, user: publicUser(user) });
});

app.patch('/api/auth/user', requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.password) updates.senha_hash = await bcrypt.hash(String(req.body.password), 12);
    if (req.body.data?.nome) updates.nome = req.body.data.nome;
    if (req.body.data?.avatar_url) updates.avatar_url = req.body.data.avatar_url;
    if (!Object.keys(updates).length) return res.json({ user: publicUser(await findUserById(req.user.id)) });

    updates.updated_at = now();
    const sets = Object.keys(updates).map((key) => `\`${key}\` = ?`).join(', ');
    await pool.query(`UPDATE usuarios SET ${sets} WHERE id = ?`, [...Object.values(updates), req.user.id]);
    res.json({ user: publicUser(await findUserById(req.user.id)) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
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

    if (action === 'select') {
      const where = [];
      const params = [];
      for (const filter of filters) addFilter(where, params, cols, filter);
      for (const expression of orFilters) addOrFilter(where, params, cols, expression);
      if (cols.has('user_id')) {
        where.push('`user_id` = ?');
        params.push(req.user.id);
      }

      const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[countRow]] = count ? await pool.query(`SELECT COUNT(*) AS total FROM \`${physicalTable}\`${whereSql}`, params) : [[{ total: null }]];
      if (head) return res.json({ data: null, count: countRow.total, error: null });

      let sql = `SELECT * FROM \`${physicalTable}\`${whereSql}`;
      for (const order of orders) {
        if (cols.has(order.column)) sql += ` ORDER BY \`${order.column}\` ${order.ascending === false ? 'DESC' : 'ASC'}`;
      }
      if (range) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(Number(range.to) - Number(range.from) + 1, Number(range.from));
      } else if (req.body.limit) {
        sql += ' LIMIT ?';
        params.push(Number(req.body.limit));
      }

      const [rows] = await pool.query(sql, params);
      const normalized = await normalizeRows(physicalTable, rows, select);

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
        }
        inserted.push(normalizeRow(physicalTable, data));
      }

      return res.json({ data: single ? inserted[0] : inserted, error: null });
    }

    if (action === 'update' || action === 'delete') {
      const where = [];
      const params = [];
      for (const filter of filters) addFilter(where, params, cols, filter);
      if (cols.has('user_id')) {
        where.push('`user_id` = ?');
        params.push(req.user.id);
      }
      if (!where.length) return res.status(400).json({ error: { message: 'Filtro obrigatorio para alteracao' } });

      if (action === 'delete') {
        await pool.query(`DELETE FROM \`${physicalTable}\` WHERE ${where.join(' AND ')}`, params);
        return res.json({ data: null, error: null });
      }

      const data = await filterDataToColumns(physicalTable, payload);
      if (cols.has('user_id')) delete data.user_id;
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
      await pool.query(
        `UPDATE \`${physicalTable}\` SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE ${where.join(' AND ')}`,
        [...Object.values(data), ...params],
      );
      for (const ordemId of affectedOrderIds) {
        await syncReceivableForOrder(pool, req.user.id, ordemId);
      }
      return res.json({ data: null, error: null });
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
      const upserted = [];

      for (const row of inputRows) {
        const data = await filterDataToColumns(physicalTable, row);
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
      }
      return res.json({ data: upserted, error: null });
    }

    res.status(400).json({ error: { message: `Acao nao suportada: ${action}` } });
  } catch (error) {
    res.status(500).json({ data: null, count: null, error: { message: error.message, code: error.code } });
  }
});

app.post('/api/rpc/get_next_order_number', requireAuth, async (req, res) => {
  try {
    const userId = req.body?.p_user_id || req.user.id;
    if (userId !== req.user.id) {
      return res.status(403).json({ data: null, error: { message: 'Acesso negado' } });
    }

    const next = await getNextOrderNumber(userId);
    res.json({ data: next, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: error.message } });
  }
});

app.post('/api/rpc/get_next_rps_number', requireAuth, async (req, res) => {
  const userId = req.body?.p_user_id || req.user.id;
  if (userId !== req.user.id) {
    return res.status(403).json({ data: null, error: { message: 'Acesso negado' } });
  }

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

app.post('/api/storage/:bucket/upload', requireAuth, express.raw({ type: '*/*', limit: '8mb' }), async (req, res) => {
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

app.delete('/api/storage/:bucket', requireAuth, async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  for (const item of paths) {
    const upload = resolveUploadPath(req.params.bucket, item);
    if (!upload) continue;
    if (fs.existsSync(upload.target)) fs.rmSync(upload.target, { force: true });
  }
  res.json({ data: null, error: null });
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
  if (/cliente\s+(.+).*(deve|devendo|d[eé]bito)/.test(lower)) {
    const cliente = lower.match(/cliente\s+(.+?)(?:\s+(?:deve|devendo|d[eé]bito)|$)/)?.[1]?.trim();
    return { intent: 'divida_cliente', cliente };
  }

  return { intent: 'desconhecida' };
}

function canWriteFinancial(permission) {
  return ['escrita', 'admin'].includes(String(permission || '').toLowerCase());
}

async function ensureDefaultFinancialCategory(userId, tipo, nome, cor) {
  const [rows] = await pool.query(
    'SELECT id FROM categorias_financeiras WHERE user_id = ? AND tipo = ? AND LOWER(nome) = LOWER(?) LIMIT 1',
    [userId, tipo, nome],
  );
  if (rows[0]?.id) return rows[0].id;
  const id = uuid();
  await pool.query(
    `INSERT INTO categorias_financeiras (id, user_id, nome, tipo, cor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, nome, tipo, cor, now(), now()],
  );
  return id;
}

async function syncOrderFinancialStatus(conn, userId, ordemId) {
  const [[totals]] = await conn.query(
    `SELECT o.valor_total, o.status, COALESCE(SUM(CASE WHEN p.status = 'confirmado' THEN p.valor ELSE 0 END), 0) AS total_pago,
            MAX(CASE WHEN p.status = 'confirmado' THEN p.data_pagamento ELSE NULL END) AS ultima_data
       FROM ordens_servico o
       LEFT JOIN os_pagamentos p ON p.user_id = o.user_id AND p.ordem_servico_id = o.id
      WHERE o.user_id = ? AND o.id = ?
      GROUP BY o.id, o.valor_total, o.status`,
    [userId, ordemId],
  );
  if (!totals) return null;
  const total = money(totals.valor_total);
  const paid = money(totals.total_pago);
  const status = totals.status === 'cancelado' ? 'cancelado' : paid >= total && total > 0 ? 'pago' : paid > 0 ? 'parcial' : 'pendente';
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
       LEFT JOIN clientes c ON c.id = o.cliente_id
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
  const statusFinanceiro = order.status === 'cancelado' ? 'cancelado' : paid >= total && total > 0 ? 'pago' : paid > 0 ? 'parcial' : 'pendente';
  const dataRecebimento = statusFinanceiro === 'pago' ? order.ultima_data || order.data_ultimo_pagamento || order.updated_at || now() : null;
  const dueDate = order.data_previsao || order.data_entrega || todayDate();
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

async function registerOrderPayment({ userId, ordemNumero, ordemId, valor, formaPagamento, origem = 'manual', observacoes = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query(
      `SELECT o.*, c.nome AS cliente_nome
         FROM ordens_servico o
         JOIN clientes c ON c.id = o.cliente_id
        WHERE o.user_id = ? AND ${ordemId ? 'o.id = ?' : 'o.numero = ?'}
        LIMIT 1`,
      [userId, ordemId || ordemNumero],
    );
    const order = orders[0];
    if (!order) throw new Error('Ordem de servico nao encontrada');
    if (order.status === 'cancelado') throw new Error('Nao e possivel pagar uma OS cancelada');

    await ensureReceivableForOrder(conn, userId, order);

    const [[currentPaidRow]] = await conn.query(
      `SELECT COALESCE(SUM(valor), 0) AS total_pago
         FROM os_pagamentos
        WHERE user_id = ? AND ordem_servico_id = ? AND status = 'confirmado'`,
      [userId, order.id],
    );
    const remaining = money(Number(order.valor_total || 0) - Number(currentPaidRow?.total_pago || 0));
    const amount = money(valor || remaining);
    if (amount <= 0) throw new Error('Valor de pagamento invalido');
    if (remaining <= 0) throw new Error('Esta OS ja esta quitada');
    if (amount > remaining) throw new Error(`Valor maior que o saldo pendente da OS (${remaining.toFixed(2)})`);

    const categoriaId = await ensureDefaultFinancialCategory(userId, 'receita', 'Servicos', '#10B981');
    const dataPagamento = now();
    const paymentId = uuid();
    const transactionId = uuid();
    const description = `Pagamento OS #${order.numero} - ${order.cliente_nome}`;

    await conn.query(
      `INSERT INTO transacoes_financeiras
       (id, user_id, descricao, valor, tipo, data, categoria_id, ordem_servico_id, forma_pagamento, origem, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'receita', ?, ?, ?, ?, ?, ?, ?)`,
      [transactionId, userId, description, amount, dataPagamento, categoriaId, order.id, formaPagamento || order.forma_pagamento || null, origem, dataPagamento, dataPagamento],
    );

    await conn.query(
      `INSERT INTO os_pagamentos
       (id, user_id, ordem_servico_id, cliente_id, transacao_financeira_id, valor, forma_pagamento, data_pagamento, observacoes, origem, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?)`,
      [paymentId, userId, order.id, order.cliente_id, transactionId, amount, formaPagamento || order.forma_pagamento || null, dataPagamento, observacoes, origem, dataPagamento, dataPagamento],
    );

    const financial = await syncOrderFinancialStatus(conn, userId, order.id);
    await conn.commit();
    return { order, amount, transactionId, paymentId, financial };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
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
      `Cadastrada pela IA financeira via ${origem}`,
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
  const mimetype = audioNode.mimetype || body.mimetype || data.mimetype || 'audio/ogg';

  return {
    phone,
    text: String(text || '').trim(),
    audioUrl,
    audioBase64,
    mimetype,
    fromMe: Boolean(key.fromMe ?? data.fromMe ?? body.fromMe),
    event: body.event || data.event || null,
    instance: body.instance || data.instance || null,
    remoteJid,
    messageKey: key.id ? { id: key.id, remoteJid: key.remoteJid, fromMe: key.fromMe, participant: key.participant } : null,
    hasAudioMessage: Boolean(messageNode.audioMessage || data.audioMessage || body.audioMessage),
  };
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

async function answerFinancialQuery(userId, intent) {
  const today = todayDate();
  const monthStart = today.slice(0, 8) + '01';
  const monthEnd = today.slice(0, 8) + '31';

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
        WHERE user_id = ? AND status IN ('pendente', 'parcial', 'atrasado') AND LEFT(data_vencimento, 10) BETWEEN ? AND ?`,
      [userId, monthStart, monthEnd],
    );
    return `A receber este mes: R$ ${Number(row.total || 0).toFixed(2)}.`;
  }

  if (intent.intent === 'faturamento_mes') {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM transacoes_financeiras
        WHERE user_id = ? AND tipo = 'receita' AND LEFT(data, 10) BETWEEN ? AND ?`,
      [userId, monthStart, monthEnd],
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

  return 'Nao entendi o pedido financeiro. Tente, por exemplo: "quais contas vencem hoje?" ou "registre que a OS 125 foi paga em dinheiro".';
}

app.post('/api/financeiro/os/:id/pagamentos', requireAuth, async (req, res) => {
  try {
    const result = await registerOrderPayment({
      userId: req.user.id,
      ordemId: req.params.id,
      valor: req.body?.valor,
      formaPagamento: req.body?.forma_pagamento,
      origem: 'manual',
      observacoes: req.body?.observacoes || null,
    });
    res.json({ data: result, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: error.message } });
  }
});

app.post('/api/financeiro/contas-pagar/:id/pagar', requireAuth, async (req, res) => {
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

app.post('/api/financeiro/ia/webhook', async (req, res) => {
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
      return res.status(403).json({ reply: 'Numero nao autorizado para usar a IA financeira.' });
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

    const intent = parseFinancialIntent(message);

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
      let reply = 'Acao confirmada.';
      if (pending.intencao === 'registrar_despesa') {
        await createExpense({ userId: authorized.user_id, descricao: entities.description, valor: entities.value, formaPagamento: entities.formaPagamento, origem: 'whatsapp_ia' });
        reply = `Despesa registrada: ${entities.description} - R$ ${Number(entities.value).toFixed(2)}.`;
      }
      if (pending.intencao === 'registrar_pagamento_os') {
        const payment = await registerOrderPayment({ userId: authorized.user_id, ordemNumero: entities.osNumero, valor: entities.value, formaPagamento: entities.formaPagamento, origem: 'whatsapp_ia' });
        reply = `Pagamento registrado na OS #${payment.order.numero}: R$ ${Number(payment.amount).toFixed(2)}.`;
      }
      if (pending.intencao === 'registrar_conta_pagar') {
        const conta = await createAccountPayable({ userId: authorized.user_id, descricao: entities.description, valor: entities.value, dataVencimento: entities.dataVencimento, formaPagamento: entities.formaPagamento, origem: 'whatsapp_ia' });
        reply = `Conta cadastrada: ${conta.descricao} - R$ ${Number(conta.valor).toFixed(2)}. Vencimento: ${conta.dataVencimento}.`;
      }
      await logFinancialAi({ id: pending.id, user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: pending.mensagem, tipo_mensagem: pending.tipo_mensagem, intencao: pending.intencao, entidades, status: 'executado', resposta: reply, confirmacao_token: intent.token || pending.confirmacao_token, confirmado_em: now() });
      await sendFinancialAiReply(authorized.user_id, phone, reply);
      return res.json({ reply, whatsapp_sent: true });
    }

    if (['registrar_despesa', 'registrar_pagamento_os', 'registrar_conta_pagar'].includes(intent.intent)) {
      if (!canWriteFinancial(authorized.permissao)) {
        const reply = 'Seu numero tem permissao apenas de consulta.';
        await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'negado', resposta: reply });
        await sendFinancialAiReply(authorized.user_id, phone, reply);
        return res.status(403).json({ reply, whatsapp_sent: true });
      }
      if (!intent.value || intent.value <= 0) {
        const reply = 'Informe um valor valido para registrar essa acao.';
        await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'erro', resposta: reply, erro: 'Valor ausente' });
        await sendFinancialAiReply(authorized.user_id, phone, reply);
        return res.json({ reply, whatsapp_sent: true });
      }
      if (intent.intent === 'registrar_conta_pagar' && !intent.dataVencimento) {
        const reply = 'Informe a data de vencimento da conta.';
        await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'erro', resposta: reply, erro: 'Vencimento ausente' });
        await sendFinancialAiReply(authorized.user_id, phone, reply);
        return res.json({ reply, whatsapp_sent: true });
      }
      const token = crypto.randomBytes(3).toString('hex').toUpperCase();
      const actionText = intent.intent === 'registrar_despesa'
        ? `registrar despesa "${intent.description}" de R$ ${Number(intent.value).toFixed(2)}`
        : intent.intent === 'registrar_conta_pagar'
          ? `cadastrar conta "${intent.description}" de R$ ${Number(intent.value).toFixed(2)} com vencimento em ${intent.dataVencimento}`
          : `registrar pagamento da OS #${intent.osNumero} de R$ ${Number(intent.value).toFixed(2)}`;
      const reply = `Confirme para ${actionText}. Responda: confirmar ${token}`;
      await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'aguardando_confirmacao', resposta: reply, confirmacao_token: token });
      await sendFinancialAiReply(authorized.user_id, phone, reply);
      return res.json({ reply, confirmation_required: true, token, whatsapp_sent: true });
    }

    const reply = await answerFinancialQuery(authorized.user_id, intent);
    await logFinancialAi({ user_id: authorized.user_id, autorizado_id: authorized.id, telefone: phone, mensagem: message, tipo_mensagem: tipoMensagem, intencao: intent.intent, entidades: intent, status: 'respondido', resposta: reply });
    await sendFinancialAiReply(authorized.user_id, phone, reply);
    res.json({ reply, whatsapp_sent: true });
  } catch (error) {
    res.status(400).json({ reply: `Erro: ${error.message}`, error: { message: error.message } });
  }
});

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
    'SELECT method, webhook_url, api_key, instance_name FROM configuracoes_whatsapp WHERE user_id = ? LIMIT 1',
    [userId],
  );
  return rows[0] || null;
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
    [userId, cutoffDate, limit],
  );
  return rows;
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
    throw new Error(`Evolution API HTTP ${response.status}: ${responseText}`);
  }
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

app.listen(PORT, HOST, () => {
  console.log(`Sistema OS API rodando em ${HOST}:${PORT}`);
  startEvaluationBackendJob();
});
