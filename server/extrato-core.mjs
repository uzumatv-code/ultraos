/**
 * Importação de extrato bancário (OFX e CSV).
 *
 * Funções puras: leem o arquivo, entendem cada linha e decidem o que fazer com
 * ela antes de qualquer gravação. As decisões que evitam números errados:
 *
 *   • ja_importado  — o banco dá um identificador único por movimento (FITID no
 *                     OFX, "Identificador" no CSV do Nubank). Se ele já está no
 *                     caixa, a linha não entra de novo.
 *   • ja_lancado    — o mesmo valor, no mesmo sentido, até 3 dias de diferença,
 *                     já existe no caixa (pagamento de OS, conta paga, lançamento
 *                     manual). O Pix do cliente que você já registrou na OS não
 *                     pode contar duas vezes.
 *   • conta_propria — transferência entre contas do próprio dono: não é receita
 *                     nem despesa da oficina.
 *   • aplicacao     — caixinha/RDB/investimento: dinheiro que só mudou de lugar.
 *
 * Só as linhas "novo" vêm marcadas para importar; o resto aparece na prévia
 * com o motivo, e a pessoa pode mudar qualquer decisão.
 */

import { createHash } from 'node:crypto';

const MATCH_WINDOW_DAYS = 3;

/* ------------------------------------------------------------------ leitura */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1.234,56", "-1234.56", "R$ 12,00", "(30,00)" → número com sinal. */
export function parseAmount(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /-$/.test(text) || /\bD$/i.test(text);
  text = text.replace(/[^\d.,]/g, '');
  if (!text) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round((negative ? -value : value) * 100) / 100;
}

/** "27/07/2026", "27/07/26", "2026-07-27", "20260727000000[-3:BRT]" → "2026-07-27". */
export function parseDate(raw) {
  const text = String(raw || '').trim();
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return valid(`${year}-${match[2]}-${match[1]}`);
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return valid(`${match[1]}-${match[2]}-${match[3]}`);
  match = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) return valid(`${match[1]}-${match[2]}-${match[3]}`);
  return null;
}

function valid(dateOnly) {
  const time = Date.parse(`${dateOnly}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === dateOnly ? dateOnly : null;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  return Math.round(Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

/** Linhas sem identificador do banco ganham uma chave estável derivada do conteúdo. */
function contentKey(line, ordinal) {
  return `h:${createHash('sha1').update(`${line.data}|${line.valor}|${line.descricaoOriginal}|${ordinal}`).digest('hex').slice(0, 32)}`;
}

function withKeys(lines) {
  const seen = new Map();
  return lines.map((line) => {
    if (line.idExterno) return line;
    const base = `${line.data}|${line.valor}|${line.descricaoOriginal}`;
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    return { ...line, idExterno: contentKey(line, ordinal) };
  });
}

export function parseOfx(text) {
  const tag = (chunk, name) => chunk.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
  const bank = tag(text, 'ORG') || null;
  const lines = [];
  const warnings = [];
  for (const chunk of text.split(/<STMTTRN>/i).slice(1)) {
    const body = chunk.split(/<\/STMTTRN>/i)[0];
    const data = parseDate(tag(body, 'DTPOSTED'));
    const valor = parseAmount(tag(body, 'TRNAMT'));
    const descricaoOriginal = tag(body, 'MEMO') || tag(body, 'NAME');
    if (!data || valor === null || valor === 0) {
      warnings.push(`Movimento ignorado: ${descricaoOriginal || 'sem descrição'}`);
      continue;
    }
    lines.push({ idExterno: tag(body, 'FITID').slice(0, 100) || null, data, valor, descricaoOriginal });
  }
  return { banco: bank, formato: 'OFX', linhas: withKeys(lines), avisos: warnings };
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsv(text) {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
  if (rows.length < 2) return { banco: null, formato: 'CSV', linhas: [], avisos: ['O arquivo não tem movimentos.'] };

  // O cabeçalho é a primeira linha que nomeia a coluna de data.
  const headerIndex = Math.max(0, rows.findIndex((line) => /data|date/i.test(line)));
  const headerLine = rows[headerIndex];
  const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : headerLine.includes('\t') ? '\t' : ',';
  const header = splitCsvLine(headerLine, delimiter).map(normalizeText);
  const find = (re) => header.findIndex((name) => re.test(name));
  const col = {
    data: find(/^data|date/),
    valor: find(/^valor|amount|quantia|^montante/),
    credito: find(/credito|entrada/),
    debito: find(/debito|saida/),
    descricao: find(/descri|historico|memo|lancamento|detalhe|title/),
    id: find(/identificador|^id$|fitid|^documento|^n(umero)? doc/),
  };
  if (col.data < 0 || (col.valor < 0 && col.credito < 0 && col.debito < 0)) {
    return { banco: null, formato: 'CSV', linhas: [], avisos: ['Não encontrei as colunas de data e valor no cabeçalho do CSV.'] };
  }

  const lines = [];
  const warnings = [];
  for (const raw of rows.slice(headerIndex + 1)) {
    const cells = splitCsvLine(raw, delimiter);
    const data = parseDate(cells[col.data]);
    let valor = col.valor >= 0 ? parseAmount(cells[col.valor]) : null;
    if (valor === null && (col.credito >= 0 || col.debito >= 0)) {
      const credit = col.credito >= 0 ? parseAmount(cells[col.credito]) : null;
      const debit = col.debito >= 0 ? parseAmount(cells[col.debito]) : null;
      if (credit) valor = Math.abs(credit);
      else if (debit) valor = -Math.abs(debit);
    }
    const descricaoOriginal = col.descricao >= 0 ? cells[col.descricao] || '' : '';
    if (!data || valor === null || valor === 0) {
      if (data || valor !== null) warnings.push(`Linha ignorada: ${raw.slice(0, 60)}`);
      continue;
    }
    lines.push({ idExterno: col.id >= 0 ? (cells[col.id] || '').slice(0, 100) || null : null, data, valor, descricaoOriginal });
  }
  return { banco: null, formato: 'CSV', linhas: withKeys(lines), avisos: warnings };
}

export function parseStatement(name, content) {
  const text = String(content || '');
  const isOfx = /\.ofx$/i.test(String(name || '')) || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000));
  return isOfx ? parseOfx(text) : parseCsv(text);
}

/* -------------------------------------------------------------- interpretação */

const OPERATIONS = [
  { re: /^transfer[eê]ncia recebida pelo pix/i, op: 'pix_recebido', label: 'Pix recebido' },
  { re: /^transfer[eê]ncia enviada pelo pix/i, op: 'pix_enviado', label: 'Pix enviado' },
  { re: /^transfer[eê]ncia recebida/i, op: 'transferencia_recebida', label: 'Transferência recebida' },
  { re: /^transfer[eê]ncia enviada/i, op: 'transferencia_enviada', label: 'Transferência enviada' },
  { re: /^compra no d[eé]bito/i, op: 'debito', label: 'Débito' },
  { re: /^compra no cr[eé]dito/i, op: 'credito_cartao', label: 'Crédito' },
  { re: /^pagamento de fatura/i, op: 'fatura', label: 'Pagamento de fatura do cartão' },
  { re: /^pagamento de boleto/i, op: 'boleto', label: 'Boleto' },
  { re: /^(aplica[cç][aã]o|resgate)\b|\brdb\b|caixinha|cdb|poupan[cç]a/i, op: 'aplicacao', label: null },
  { re: /^(estorno|reembolso)/i, op: 'estorno', label: null },
  { re: /^cr[eé]dito em conta/i, op: 'credito_conta', label: 'Crédito em conta' },
];

/** Separa operação e contraparte da descrição do banco e monta um texto curto e estável. */
export function describeLine(raw) {
  const original = String(raw || '').replace(/\s+/g, ' ').trim();
  const parts = original.split(' - ').map((part) => part.trim());
  const found = OPERATIONS.find((item) => item.re.test(original));
  const op = found?.op ?? 'outro';
  const counterpart = parts.length > 1 && op !== 'fatura' && op !== 'aplicacao' ? parts[1] : '';
  // Documento mascarado (•••.319.111-••) ajuda a distinguir homônimos.
  const document = parts.find((part, index) => index > 1 && /[•*]{2,}|\d{2,3}\.\d{3}\.\d{3}|\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(part)) || '';
  const label = found?.label ?? parts[0];
  const descricao = (counterpart ? `${label} · ${counterpart}` : label || original).slice(0, 255);
  return { op, descricao, contraparte: counterpart, documento: document };
}

function nameTokens(name) {
  return normalizeText(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !['das', 'dos', 'ltda', 'eireli', 'me'].includes(token));
}

/**
 * Contas do próprio dono: a contraparte tem o nome de quem usa o sistema (ou da
 * empresa), ou recebe e manda dinheiro para a conta várias vezes nos dois sentidos.
 */
export function findOwnCounterparts(lines, ownerNames = []) {
  const owners = ownerNames.map(nameTokens).filter((tokens) => tokens.length >= 2);
  const stats = new Map();
  for (const line of lines) {
    if (!line.contraparte || !/pix|transferencia/.test(line.op)) continue;
    const key = `${normalizeText(line.contraparte)}|${line.documento}`;
    const entry = stats.get(key) ?? { name: line.contraparte, in: 0, out: 0 };
    if (line.valor > 0) entry.in += 1;
    else entry.out += 1;
    stats.set(key, entry);
  }
  const own = new Set();
  for (const [key, entry] of stats) {
    const tokens = new Set(nameTokens(entry.name));
    const byName = owners.some((ownerTokens) => ownerTokens.every((token) => tokens.has(token)));
    const byPattern = entry.in >= 3 && entry.out >= 3;
    if (byName || byPattern) own.add(key);
  }
  return own;
}

export function counterpartKey(line) {
  return `${normalizeText(line.contraparte)}|${line.documento}`;
}

/** Nome de categoria → categoria existente (ignora acento e aceita um nome contido no outro). */
export function resolveCategory(name, tipo, categorias) {
  const wanted = normalizeText(name);
  const sameType = categorias.filter((item) => item.tipo === tipo);
  const exact = sameType.find((item) => normalizeText(item.nome) === wanted);
  if (exact) return { categoria_id: exact.id };
  if (wanted.length >= 5) {
    const near = sameType.find((item) => {
      const key = normalizeText(item.nome);
      const [shorter, longer] = key.length < wanted.length ? [key, wanted] : [wanted, key];
      return shorter.length >= 5 && ` ${longer} `.includes(` ${shorter} `);
    });
    if (near) return { categoria_id: near.id };
  }
  return { categoria_nome: name };
}

function suggestCategoryName(line, own, inferExpense) {
  if (own) return line.valor < 0 ? 'Retiradas do sócio' : 'Aporte do sócio';
  if (line.op === 'estorno') return line.valor > 0 ? 'Estornos e reembolsos' : inferExpense(line.contraparte || line.descricao).nome;
  if (line.valor > 0) return 'Servicos';
  if (line.op === 'fatura') return 'Fatura do cartão';
  return inferExpense(line.contraparte || line.descricao).nome;
}

/**
 * Decide o destino de cada linha.
 *
 * existentes: lançamentos do caixa perto das datas do extrato ({ id, descricao, valor, tipo, dia, id_externo }).
 * historico:  Map descrição → categoria_id mais usada (aprende com importações e correções anteriores).
 */
export function analyzeStatement({ linhas, existentes = [], historico = new Map(), categorias = [], donos = [], inferExpense }) {
  const described = linhas.map((line) => ({ ...line, ...describeLine(line.descricaoOriginal) }));
  const own = findOwnCounterparts(described, donos);
  const imported = new Set(existentes.filter((row) => row.id_externo).map((row) => row.id_externo));
  const candidates = existentes.filter((row) => !row.id_externo).map((row) => ({ ...row, valor: Math.round(Number(row.valor) * 100) / 100 }));
  const used = new Set();

  return described.map((line) => {
    const tipo = line.valor > 0 ? 'receita' : 'despesa';
    const valor = Math.abs(line.valor);
    const isOwn = Boolean(line.contraparte) && own.has(counterpartKey(line));
    let situacao = 'novo';
    let correspondencia = null;

    if (imported.has(line.idExterno)) situacao = 'ja_importado';
    else if (line.op === 'aplicacao') situacao = 'aplicacao';
    else if (isOwn) situacao = 'conta_propria';
    else {
      // Mesmo valor e sentido, data mais próxima dentro da janela; cada lançamento casa uma vez só.
      let best = null;
      for (const row of candidates) {
        if (used.has(row.id) || row.tipo !== tipo || row.valor !== valor) continue;
        const diff = dayDiff(row.dia, line.data);
        if (diff <= MATCH_WINDOW_DAYS && (!best || diff < best.diff)) best = { row, diff };
      }
      if (best) {
        used.add(best.row.id);
        situacao = 'ja_lancado';
        correspondencia = { id: best.row.id, descricao: best.row.descricao, data: best.row.dia };
      }
    }

    const learned = historico.get(line.descricao);
    const learnedValid = learned && categorias.some((item) => item.id === learned && item.tipo === tipo);
    const category = learnedValid ? { categoria_id: learned } : resolveCategory(suggestCategoryName(line, isOwn, inferExpense), tipo, categorias);

    return {
      chave: line.idExterno,
      data: line.data,
      valor,
      tipo,
      descricao: line.descricao,
      original: line.descricaoOriginal,
      contraparte: line.contraparte,
      operacao: line.op,
      situacao,
      correspondencia,
      ...category,
      importar: situacao === 'novo',
    };
  });
}

export function statementRange(lines) {
  const dates = lines.map((line) => line.data).filter((value) => DATE_ONLY.test(value)).sort();
  if (!dates.length) return null;
  return { inicio: dates[0], fim: dates[dates.length - 1], busca: { de: addDays(dates[0], -MATCH_WINDOW_DAYS - 1), ate: addDays(dates[dates.length - 1], MATCH_WINDOW_DAYS + 1) } };
}
