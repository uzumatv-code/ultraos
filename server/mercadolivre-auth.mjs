// Conexão com a conta do Mercado Livre (OAuth com PKCE). A API do ML só responde com login: o painel conecta uma vez
// e o sistema guarda e renova o acesso sozinho (o token vale ~6 h; o de renovação é de uso único e dura ~6 meses).
import crypto from 'node:crypto';
import express from 'express';

const ESTADO_TTL_MS = 10 * 60 * 1000;
// Renova um pouco antes de vencer, para nenhuma consulta pegar o token no último minuto.
const MARGEM_MS = 5 * 60 * 1000;

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Par verificador/desafio do PKCE (S256). */
export function pkce() {
  const verificador = base64url(crypto.randomBytes(48));
  return { verificador, desafio: base64url(crypto.createHash('sha256').update(verificador).digest()) };
}

export function urlAutorizacao({ authUrl, clientId, redirectUri, state, desafio }) {
  const url = new URL('/authorization', authUrl);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state, code_challenge: desafio, code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/** Resposta de POST /oauth/token → dados para o banco. */
export function tokensDaResposta(resposta, agora = Date.now()) {
  if (!resposta?.access_token || !resposta?.refresh_token) return null;
  return {
    access_token: String(resposta.access_token),
    refresh_token: String(resposta.refresh_token),
    expira_em: new Date(agora + Math.max(60, Number(resposta.expires_in) || 21600) * 1000).toISOString(),
    ml_user_id: resposta.user_id == null ? null : String(resposta.user_id),
  };
}

export function createMercadoLivreAuth({
  pool, now, clientId, clientSecret, osPublicUrl, envToken = '', log = console,
  apiUrl = 'https://api.mercadolibre.com', authUrl = 'https://auth.mercadolivre.com.br',
}) {
  const osUrl = (osPublicUrl || 'https://os.luthieriabrasilia.com.br').replace(/\/+$/, '');
  const API = apiUrl.replace(/\/+$/, '');
  const redirectUri = `${osUrl}/api/mercadolivre/callback`;
  const configurado = Boolean(clientId && clientSecret);
  // state -> quem pediu e o verificador PKCE. Em memória: a conexão é feita na hora, pelo próprio dono da conta.
  const estados = new Map();
  const renovando = new Map();

  async function ensureSchema() {
    await pool.query(`CREATE TABLE IF NOT EXISTS mercadolivre_conexao (
      user_id varchar(36) NOT NULL PRIMARY KEY,
      access_token varchar(500) DEFAULT NULL,
      refresh_token varchar(500) DEFAULT NULL,
      expira_em varchar(50) DEFAULT NULL,
      ml_user_id varchar(30) DEFAULT NULL,
      ml_apelido varchar(120) DEFAULT NULL,
      conectado_em varchar(50) DEFAULT NULL,
      erro varchar(300) DEFAULT NULL,
      updated_at varchar(50) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async function pedirToken(campos) {
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...campos }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const tokens = res.ok ? tokensDaResposta(data) : null;
    if (!tokens) {
      // Sem o escopo offline_access o ML entrega o acesso, mas não o token de renovação.
      const semRenovacao = res.ok && data?.access_token && !data?.refresh_token;
      const erro = new Error(semRenovacao
        ? 'o aplicativo do Mercado Livre está sem o escopo offline_access; ative e conecte de novo'
        : data?.message || data?.error_description || data?.error || `Mercado Livre respondeu ${res.status}`);
      erro.definitivo = data?.error === 'invalid_grant' || res.status === 400 || res.status === 401;
      throw erro;
    }
    return tokens;
  }

  async function lerConexao(userId) {
    const [[row]] = await pool.query('SELECT * FROM mercadolivre_conexao WHERE user_id = ?', [userId]);
    return row || null;
  }

  async function salvarTokens(userId, tokens, extra = {}) {
    await pool.query(
      `INSERT INTO mercadolivre_conexao (user_id, access_token, refresh_token, expira_em, ml_user_id, ml_apelido, conectado_em, erro, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), refresh_token = VALUES(refresh_token), expira_em = VALUES(expira_em),
         ml_user_id = COALESCE(VALUES(ml_user_id), ml_user_id), ml_apelido = COALESCE(VALUES(ml_apelido), ml_apelido),
         conectado_em = COALESCE(VALUES(conectado_em), conectado_em), erro = NULL, updated_at = VALUES(updated_at)`,
      [userId, tokens.access_token, tokens.refresh_token, tokens.expira_em, tokens.ml_user_id, extra.apelido ?? null, extra.conectadoEm ?? null, now()],
    );
  }

  /**
   * Token válido para consultar a API, renovando se preciso. Sem conexão, usa MERCADOLIVRE_ACCESS_TOKEN (se houver).
   * A renovação é uma por vez por conta: o token de renovação só pode ser usado uma vez.
   */
  async function token(userId, { forcar = false } = {}) {
    if (!configurado || !userId) return envToken || null;
    const conexao = await lerConexao(userId);
    if (!conexao?.refresh_token) return envToken || null;
    if (!forcar && conexao.access_token && new Date(conexao.expira_em).getTime() - Date.now() > MARGEM_MS) return conexao.access_token;
    if (!renovando.has(userId)) {
      renovando.set(userId, (async () => {
        try {
          const tokens = await pedirToken({ grant_type: 'refresh_token', refresh_token: conexao.refresh_token });
          await salvarTokens(userId, tokens);
          return tokens.access_token;
        } catch (error) {
          log.error('[mercadolivre] renovação do acesso falhou:', error.message);
          if (error.definitivo) {
            // Autorização revogada ou vencida: só conectando de novo pelo painel.
            await pool.query('UPDATE mercadolivre_conexao SET access_token = NULL, refresh_token = NULL, erro = ?, updated_at = ? WHERE user_id = ?',
              ['O Mercado Livre recusou a renovação do acesso. Conecte a conta de novo.', now(), userId]);
            return envToken || null;
          }
          return conexao.access_token || envToken || null;
        } finally {
          renovando.delete(userId);
        }
      })());
    }
    return renovando.get(userId);
  }

  async function status(userId) {
    const conexao = configurado ? await lerConexao(userId) : null;
    return {
      configurado,
      conectado: Boolean(conexao?.refresh_token),
      apelido: conexao?.ml_apelido || null,
      conectado_em: conexao?.conectado_em || null,
      erro: conexao?.erro || null,
      token_fixo: Boolean(envToken),
      redirect_uri: redirectUri,
    };
  }

  function iniciar(userId) {
    if (!configurado) {
      const erro = new Error('Faltam MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET no servidor.');
      erro.status = 503;
      throw erro;
    }
    for (const [chave, e] of estados) if (Date.now() - e.criado > ESTADO_TTL_MS) estados.delete(chave);
    const state = base64url(crypto.randomBytes(24));
    const { verificador, desafio } = pkce();
    estados.set(state, { userId, verificador, criado: Date.now() });
    return { url: urlAutorizacao({ authUrl, clientId, redirectUri, state, desafio }) };
  }

  async function desconectar(userId) {
    await pool.query('DELETE FROM mercadolivre_conexao WHERE user_id = ?', [userId]);
  }

  // Volta do Mercado Livre depois de autorizar. Sem login do painel (é um redirecionamento do navegador):
  // quem pediu é identificado pelo state, que vale 10 minutos e só uma vez.
  const callbackRouter = express.Router();
  callbackRouter.get('/callback', async (req, res) => {
    const voltar = (resultado, motivo = '') => res.redirect(302, `${osUrl}/loja/recomendados?ml=${resultado}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}`);
    const estado = estados.get(String(req.query.state || ''));
    estados.delete(String(req.query.state || ''));
    if (!estado || Date.now() - estado.criado > ESTADO_TTL_MS) return voltar('erro', 'O pedido de conexão expirou. Clique em Conectar de novo.');
    if (req.query.error || !req.query.code) return voltar('erro', 'A autorização foi cancelada no Mercado Livre.');
    try {
      const tokens = await pedirToken({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirectUri, code_verifier: estado.verificador });
      let apelido = null;
      try {
        const eu = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
        if (eu.ok) apelido = String((await eu.json()).nickname || '').slice(0, 120) || null;
      } catch { /* o apelido é só para mostrar no painel */ }
      await salvarTokens(estado.userId, tokens, { apelido, conectadoEm: now() });
      log.info?.(`[mercadolivre] conta conectada${apelido ? ` (${apelido})` : ''}.`);
      voltar('conectado');
    } catch (error) {
      log.error('[mercadolivre] troca do código falhou:', error.message);
      voltar('erro', `O Mercado Livre não confirmou a conexão: ${error.message}`.slice(0, 200));
    }
  });

  // O token de renovação vence se ficar meses sem uso: renova de tempos em tempos mesmo sem consultas.
  function startJobs(getUserId) {
    const manter = async () => {
      const userId = getUserId();
      if (!configurado || !userId) return;
      try {
        const conexao = await lerConexao(userId);
        if (conexao?.refresh_token && new Date(conexao.expira_em).getTime() - Date.now() < 60 * 60 * 1000) await token(userId);
      } catch (error) {
        log.error('[mercadolivre] manutenção do acesso falhou:', error.message);
      }
    };
    setInterval(() => void manter(), 30 * 60 * 1000).unref();
  }

  return { ensureSchema, token, status, iniciar, desconectar, callbackRouter, startJobs, configurado, redirectUri };
}
