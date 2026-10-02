/**
 * Renderização das mensagens automáticas no servidor (espelha src/utils/template-service.ts).
 * Os modelos padrão vêm de message-template-data.json (gerado por `npm run sync:templates`);
 * se o usuário personalizou um modelo, vale o texto salvo em templates_mensagem.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS = JSON.parse(fs.readFileSync(path.join(here, 'message-template-data.json'), 'utf8'));
export const DEFAULT_TEMPLATES = Object.fromEntries(DEFINITIONS.map((definition) => [definition.type, definition]));

const HORARIO_PADRAO = '10h às 13h | 14h às 18h';
const DIAS_PADRAO = 'Segunda a Sábado';

const text = (value) => String(value ?? '').trim();

function currency(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : fallback;
}

function dateBr(value, fallback = 'Não informada') {
  const iso = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : fallback;
}

const PAYMENT_LABELS = {
  credito: 'Cartão de Crédito', debito: 'Cartão de Débito', pix: 'PIX', dinheiro: 'Dinheiro', boleto: 'Boleto',
  misto: 'Pagamento misto', a_definir: 'A definir', transferencia: 'Transferência Bancária',
};

const name = (value, fallback) => (typeof value === 'string' ? value.trim() || fallback : text(value?.nome) || fallback);

function observations(value) {
  const cleaned = text(value).replace(/(?:^|\r?\n)[\t ]*Problemas(?:\s+Reportados)?:[^\r\n]*(?:\r?\n[\s\S]*)?$/i, '').trim();
  return cleaned ? `📝 Observações: ${cleaned}` : '';
}

export function templateValues(data, company = {}) {
  const services = Array.isArray(data.servicos) && data.servicos.length
    ? data.servicos.map((service) => name(service, '')).filter(Boolean).join(', ')
    : text(data.servico_descricao || data.servicos_necessarios) || 'Diagnóstico e orçamento';
  const problems = text(data.problema_descricao || data.problemas_encontrados) || 'Não informado';
  return {
    cliente: name(data.cliente, 'Cliente'),
    instrumento: name(data.instrumento, 'Instrumento'),
    marca: name(data.marca, ''),
    modelo: text(data.modelo),
    numero: text(data.numero),
    acessorios: text(data.acessorios) || 'Nenhum acessório reportado',
    servicos: services,
    problemas: problems,
    valor: currency(data.valor_total, 'A definir'),
    forma_pagamento: PAYMENT_LABELS[text(data.forma_pagamento)] || text(data.forma_pagamento) || 'A definir',
    valor_servicos: currency(data.valor_servicos, 'R$ 0,00'),
    desconto: currency(data.desconto, 'R$ 0,00'),
    valor_pendente: currency(data.valor_pendente, 'R$ 0,00'),
    valor_orcamento: currency(data.valor_orcamento ?? data.valor_total, 'A definir'),
    data_criacao: dateBr(data.data_criacao || data.data_entrada || data.created_at),
    previsao_entrega: dateBr(data.previsao_entrega || data.data_previsao),
    validade_orcamento: dateBr(data.validade_orcamento, 'a combinar'),
    observacoes: observations(data.observacoes),
    nome_empresa: text(company.nome_empresa) || 'Sua Empresa',
    cnpj: text(company.cnpj),
    telefone_empresa: text(company.telefone_empresa || company.telefone),
    endereco_empresa: text(company.endereco),
    horario_funcionamento: text(company.horario_funcionamento) || HORARIO_PADRAO,
    dias_funcionamento: text(company.dias_funcionamento) || DIAS_PADRAO,
    termos_de_uso: text(company.termos_de_uso),
    google_review_link: text(data.google_review_link || company.google_review_link) || 'https://g.page/r/SEU_PERFIL_GOOGLE/review',
    instagram_handle: text(data.instagram_handle || company.instagram_handle) || '@sua_empresa',
    ultimo_servico: text(data.ultimo_servico || data.servico_descricao) || services,
    meses_sem_manutencao: text(data.meses_sem_manutencao) || '6',
    dias_prontos: text(data.dias_prontos) || '0',
    problemas_encontrados: text(data.problemas_encontrados || data.problema_descricao) || problems,
    servicos_necessarios: text(data.servicos_necessarios || data.servico_descricao) || services,
  };
}

export function renderTemplate(content, data, company) {
  const values = templateValues(data, company);
  const unknown = new Set();
  const rendered = String(content).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!(key in values)) {
      unknown.add(match);
      return match;
    }
    return values[key];
  });
  if (unknown.size) throw new Error(`Variáveis não reconhecidas no template: ${[...unknown].join(', ')}`);
  return rendered.replace(/^[ \t]+$/gm, '').trim();
}

/** Texto final de um modelo (personalizado pelo usuário ou o padrão) para uma OS. */
export async function renderForOrder(pool, userId, type, order, company) {
  const [rows] = await pool.query('SELECT conteudo FROM templates_mensagem WHERE user_id = ? AND tipo = ? AND COALESCE(ativo, 1) = 1 LIMIT 1', [userId, type]);
  const content = rows[0]?.conteudo || DEFAULT_TEMPLATES[type]?.defaultContent;
  if (!content) throw new Error(`Modelo de mensagem "${type}" não encontrado`);
  return renderTemplate(content, order, company);
}
