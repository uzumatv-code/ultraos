// Regras puras do portal do cliente (sem banco): CPF, telefone, assinatura das chamadas
// site -> sistema, códigos de verificação, temperatura da agenda e detecção de duplicados.
import crypto from 'node:crypto';

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

export function formatCpf(value) {
  const cpf = onlyDigits(value);
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

export function maskCpf(value) {
  const cpf = onlyDigits(value);
  return cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : '';
}

/**
 * Forma comparável de um telefone brasileiro: { ddd, final8 }.
 * Aceita "(61) 98112-6864", "61981126864", "+55 61 8112-6864", "556181126864".
 * O nono dígito é ignorado (cadastros antigos não têm), e números sem DDD ficam com ddd vazio.
 */
export function phoneKey(value) {
  let digits = onlyDigits(value);
  if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length > 11 && digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length < 8) return null;
  const final8 = digits.slice(-8);
  const rest = digits.slice(0, -8);
  // rest pode ser "", "9", "61", "619"
  const ddd = rest.length >= 2 ? rest.slice(0, 2) : '';
  return { ddd, final8 };
}

export function phonesMatch(a, b) {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  if (!ka || !kb) return false;
  if (ka.final8 !== kb.final8) return false;
  // Sem DDD em um dos lados, os 8 últimos dígitos bastam.
  return !ka.ddd || !kb.ddd || ka.ddd === kb.ddd;
}

/** Telefone em formato E.164 sem "+", para o WhatsApp. Mantém o nono dígito se existir. */
export function whatsappNumber(value) {
  let digits = onlyDigits(value);
  if (digits.length >= 12 && digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function maskPhone(value) {
  const key = phoneKey(value);
  if (!key) return '';
  return `${key.ddd ? `(${key.ddd}) ` : ''}****-${key.final8.slice(4)}`;
}

// ---------- Assinatura site -> sistema ----------

const MAX_SKEW_MS = 5 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signPortalRequest({ secret, method, path, body = '', timestamp = Date.now() }) {
  const payload = `${timestamp}.${String(method).toUpperCase()}.${path}.${sha256(body)}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { timestamp: String(timestamp), signature };
}

export function verifyPortalRequest({ secret, method, path, body = '', timestamp, signature, now = Date.now() }) {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return false;
  const expected = signPortalRequest({ secret, method, path, body, timestamp: ts }).signature;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(signature), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Código de verificação ----------

export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(secret, verificationId, code) {
  return crypto.createHmac('sha256', secret).update(`${verificationId}:${onlyDigits(code)}`).digest('hex');
}

export function hashCpf(secret, cpf) {
  return crypto.createHmac('sha256', secret).update(`cpf:${onlyDigits(cpf)}`).digest('hex');
}

// ---------- Temperatura da agenda ----------

/**
 * @param {{capacidade:number, dias:string[], ocupacao:Record<string, number>}} input
 *   dias: datas úteis (YYYY-MM-DD) em ordem; ocupacao: OS ativas com previsão em cada dia.
 * @returns nível geral, nível por dia e primeiro dia com folga.
 */
export function agendaTemperature({ capacidade, dias, ocupacao }) {
  const cap = Math.max(1, Number(capacidade) || 1);
  const porDia = dias.map((dia) => {
    const total = Number(ocupacao[dia] || 0);
    const taxa = total / cap;
    return { dia, nivel: taxa >= 1 ? 'cheia' : taxa >= 0.6 ? 'moderada' : 'tranquila' };
  });
  const media = dias.length ? dias.reduce((s, d) => s + Number(ocupacao[d] || 0), 0) / (dias.length * cap) : 0;
  const nivel = media >= 0.85 ? 'cheia' : media >= 0.5 ? 'moderada' : 'tranquila';
  const livre = porDia.find((d) => d.nivel !== 'cheia');
  return { nivel, dias: porDia, primeiroDiaLivre: livre ? livre.dia : null };
}

/** Próximos N dias úteis (segunda a sábado) a partir de hoje, no formato YYYY-MM-DD. */
export function nextWorkingDays(todayIso, count) {
  const out = [];
  const date = new Date(`${todayIso}T12:00:00Z`);
  while (out.length < count) {
    if (date.getUTCDay() !== 0) out.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return out;
}

// ---------- Duplicados de clientes ----------

function normalizeName(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Agrupa clientes que parecem ser a mesma pessoa.
 * - Mesmo CPF: "cpf" (alta confiança).
 * - Mesmo telefone e nomes compatíveis (mesmo primeiro nome) ou um sem nome: "telefone".
 * - Mesmo telefone com nomes diferentes: "telefone_nomes_diferentes" (pode ser família; o atendente decide).
 * Nunca junta dois CPFs válidos diferentes.
 */
export function findDuplicateGroups(clients) {
  const parent = new Map(clients.map((c) => [c.id, c.id]));
  const reason = new Map();
  const find = (id) => {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)));
      id = parent.get(id);
    }
    return id;
  };
  const cpfOf = (c) => {
    const d = onlyDigits(c.cpf_cnpj);
    return d.length >= 11 ? d : '';
  };
  const union = (a, b, why) => {
    const ra = find(a.id);
    const rb = find(b.id);
    if (ra === rb) return;
    parent.set(rb, ra);
    // O grupo leva o vínculo mais fraco: basta um par com nomes diferentes para pedir revisão.
    const rank = { cpf: 3, telefone: 2, telefone_nomes_diferentes: 1 };
    const weakest = [reason.get(ra), reason.get(rb), why].filter(Boolean).sort((x, y) => rank[x] - rank[y])[0];
    reason.set(ra, weakest);
  };

  const byCpf = new Map();
  for (const c of clients) {
    const cpf = cpfOf(c);
    if (!cpf) continue;
    if (byCpf.has(cpf)) union(byCpf.get(cpf), c, 'cpf');
    else byCpf.set(cpf, c);
  }

  const byPhone = new Map();
  for (const c of clients) {
    const key = phoneKey(c.telefone);
    if (!key) continue;
    const k = `${key.ddd}:${key.final8}`;
    const list = byPhone.get(k) || [];
    for (const other of list) {
      const cpfA = cpfOf(c);
      const cpfB = cpfOf(other);
      if (cpfA && cpfB && cpfA !== cpfB) continue;
      const nameA = normalizeName(c.nome).split(' ')[0];
      const nameB = normalizeName(other.nome).split(' ')[0];
      union(other, c, !nameA || !nameB || nameA === nameB ? 'telefone' : 'telefone_nomes_diferentes');
    }
    list.push(c);
    byPhone.set(k, list);
  }

  const groups = new Map();
  for (const c of clients) {
    const root = find(c.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => ({ motivo: reason.get(root) || 'telefone', clientes: members }));
}

/** Escolhe o cadastro que fica: o com mais OS, depois o mais completo, depois o mais antigo. */
export function pickPrimaryClient(members, orderCounts = {}) {
  const completeness = (c) => ['cpf_cnpj', 'telefone', 'email', 'endereco'].filter((f) => String(c[f] || '').trim()).length;
  return [...members].sort((a, b) =>
    (orderCounts[b.id] || 0) - (orderCounts[a.id] || 0)
    || completeness(b) - completeness(a)
    || String(a.created_at || '').localeCompare(String(b.created_at || '')),
  )[0];
}
