/**
 * Comprovantes financeiros.
 *
 * Os arquivos ficam no próprio MySQL (MEDIUMBLOB): o disco do Railway é efêmero
 * e a pasta /uploads é pública, o que não serve para comprovante bancário.
 * Todo acesso passa por rota autenticada e filtra por user_id.
 */

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;

export function isAcceptedReceiptMime(mime) {
  return ALLOWED.test(String(mime || '').split(';')[0].trim());
}

function extensionFor(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  return 'jpg';
}

export function createReceiptStore({ pool, uuid, now }) {
  async function ensureSchema() {
    await pool.query(`CREATE TABLE IF NOT EXISTS comprovantes_financeiros (
      id varchar(36) NOT NULL PRIMARY KEY,
      user_id varchar(36) NOT NULL,
      conta_pagar_id varchar(36) DEFAULT NULL,
      transacao_financeira_id varchar(36) DEFAULT NULL,
      nome_arquivo varchar(255) NOT NULL,
      tipo_mime varchar(100) NOT NULL,
      tamanho_bytes int NOT NULL,
      conteudo MEDIUMBLOB NOT NULL,
      origem varchar(30) DEFAULT 'manual',
      observacao varchar(500) DEFAULT NULL,
      created_at varchar(50) DEFAULT NULL,
      INDEX idx_comprovantes_user (user_id, created_at),
      INDEX idx_comprovantes_conta (conta_pagar_id),
      INDEX idx_comprovantes_transacao (transacao_financeira_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async function save(userId, { buffer, mime, name, origem = 'manual', contaPagarId = null, transacaoId = null, observacao = null }) {
    const cleanMime = String(mime || 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!isAcceptedReceiptMime(cleanMime)) throw new Error('Formato não aceito. Envie foto (JPG/PNG) ou PDF.');
    if (!buffer?.length) throw new Error('Arquivo vazio');
    if (buffer.length > MAX_RECEIPT_BYTES) throw new Error('Arquivo maior que 8 MB');
    const id = uuid();
    const stamp = now();
    const fileName = String(name || '').trim() || `comprovante-${stamp.slice(0, 10)}.${extensionFor(cleanMime)}`;
    await pool.query(
      `INSERT INTO comprovantes_financeiros
       (id,user_id,conta_pagar_id,transacao_financeira_id,nome_arquivo,tipo_mime,tamanho_bytes,conteudo,origem,observacao,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, userId, contaPagarId, transacaoId, fileName.slice(0, 255), cleanMime, buffer.length, buffer, origem, observacao, stamp],
    );
    return { id, nome_arquivo: fileName, tipo_mime: cleanMime, tamanho_bytes: buffer.length };
  }

  /** Vincula um comprovante (ou o último pendente) a uma conta e/ou lançamento. */
  async function attach(userId, { comprovanteId = null, contaPagarId = null, transacaoId = null }) {
    if (!contaPagarId && !transacaoId) throw new Error('Informe a conta ou o lançamento do comprovante');
    let id = comprovanteId;
    if (!id) {
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      const [rows] = await pool.query(
        `SELECT id FROM comprovantes_financeiros
          WHERE user_id = ? AND conta_pagar_id IS NULL AND transacao_financeira_id IS NULL AND created_at >= ?
          ORDER BY created_at DESC LIMIT 1`,
        [userId, since],
      );
      id = rows[0]?.id;
      if (!id) throw new Error('Não há comprovante pendente para anexar');
    }
    let contaId = contaPagarId;
    let txId = transacaoId;
    if (contaId && !txId) {
      const [tx] = await pool.query('SELECT id FROM transacoes_financeiras WHERE user_id = ? AND conta_pagar_id = ? ORDER BY created_at DESC LIMIT 1', [userId, contaId]);
      txId = tx[0]?.id || null;
    }
    const [result] = await pool.query(
      'UPDATE comprovantes_financeiros SET conta_pagar_id = COALESCE(?, conta_pagar_id), transacao_financeira_id = COALESCE(?, transacao_financeira_id) WHERE user_id = ? AND id = ?',
      [contaId, txId, userId, id],
    );
    if (!result.affectedRows) throw new Error('Comprovante não encontrado');
    return { id, conta_pagar_id: contaId, transacao_financeira_id: txId };
  }

  async function list(userId, { contaPagarId = null, busca = null, limite = 10 } = {}) {
    const where = ['c.user_id = ?'];
    const params = [userId];
    if (contaPagarId) { where.push('c.conta_pagar_id = ?'); params.push(contaPagarId); }
    if (busca) {
      where.push('(LOWER(cp.descricao) LIKE ? OR LOWER(t.descricao) LIKE ? OR LOWER(c.nome_arquivo) LIKE ?)');
      const like = `%${String(busca).toLowerCase()}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.nome_arquivo, c.tipo_mime, c.tamanho_bytes, c.created_at, c.conta_pagar_id, c.transacao_financeira_id,
              COALESCE(cp.descricao, t.descricao) AS referente_a,
              COALESCE(cp.valor, t.valor) AS valor
         FROM comprovantes_financeiros c
         LEFT JOIN contas_pagar cp ON cp.id = c.conta_pagar_id
         LEFT JOIN transacoes_financeiras t ON t.id = c.transacao_financeira_id
        WHERE ${where.join(' AND ')}
        ORDER BY c.created_at DESC LIMIT ?`,
      [...params, Math.min(Number(limite) || 10, 25)],
    );
    return rows.map((row) => ({ ...row, valor: row.valor === null ? null : Number(row.valor), pendente: !row.conta_pagar_id && !row.transacao_financeira_id }));
  }

  async function get(userId, id) {
    const [rows] = await pool.query('SELECT * FROM comprovantes_financeiros WHERE user_id = ? AND id = ? LIMIT 1', [userId, id]);
    return rows[0] || null;
  }

  async function remove(userId, id) {
    const [result] = await pool.query('DELETE FROM comprovantes_financeiros WHERE user_id = ? AND id = ?', [userId, id]);
    return result.affectedRows > 0;
  }

  async function countsByPayable(userId) {
    const [rows] = await pool.query(
      `SELECT conta_pagar_id, COUNT(*) AS total FROM comprovantes_financeiros
        WHERE user_id = ? AND conta_pagar_id IS NOT NULL GROUP BY conta_pagar_id`,
      [userId],
    );
    return Object.fromEntries(rows.map((row) => [row.conta_pagar_id, Number(row.total)]));
  }

  return { ensureSchema, save, attach, list, get, remove, countsByPayable };
}
