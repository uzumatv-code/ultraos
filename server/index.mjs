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
const DATABASE_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.JWT_TTL || '12h';

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
  'transacoes_financeiras',
  'configuracoes_empresa',
  'configuracoes_whatsapp',
  'system_settings',
  'message_templates',
  'templates_mensagem',
  'empresa_fiscal',
  'notas_fiscais',
  'nfse_logs',
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
  },
  notas_fiscais: {
    ordem_servico: ['ordens_servico', 'ordem_servico_id'],
  },
};

const columnCache = new Map();

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(rootDir, 'uploads')));

function now() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function uuid() {
  return crypto.randomUUID();
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
      if (key === 'is_active') mappedKey = 'ativo';
    }

    if (table === 'templates_mensagem') {
      if (key === 'template_type') mappedKey = 'tipo';
      if (key === 'content') mappedKey = 'conteudo';
      if (key === 'is_active') mappedKey = 'ativo';
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
      if (physicalTable === 'ordens_servico') {
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
      return res.json({ data: null, error: null });
    }

    if (action === 'upsert') {
      const inputRows = Array.isArray(payload) ? payload : [payload];
      const conflict = upsertOptions?.onConflict || (cols.has('user_id') && cols.has('tipo') ? 'user_id,tipo' : 'id');
      const conflictCols = conflict.split(',').map((item) => item.trim()).filter((col) => cols.has(col));
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
    const bucket = req.params.bucket.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = String(req.query.path || '').replaceAll('..', '').replace(/^\/+/, '');
    if (!bucket || !filePath) return res.status(400).json({ error: { message: 'Caminho invalido' } });
    const target = path.join(rootDir, 'uploads', bucket, filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, req.body);
    res.json({ data: { path: filePath }, error: null });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.delete('/api/storage/:bucket', requireAuth, async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  for (const item of paths) {
    const target = path.join(rootDir, 'uploads', req.params.bucket, String(item).replaceAll('..', ''));
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
  res.json({ data: null, error: null });
});

const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Sistema OS API rodando na porta ${PORT}`);
});
