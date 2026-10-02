import { apiRequest } from '../lib/api-client';
import { TemplateService } from './template-service';
import { WhatsAppService } from './whatsapp-service';
import { blobToBase64, generateOrderDocumentPdf } from './order-document-pdf';
import {
  DEFAULT_ORDER_DOCUMENT_CONFIG,
  normalizeOrderDocumentConfig,
  type OrderDocumentTemplateConfig,
} from './order-document-template';
import { listDocumentTemplates, loadBrandLogoDataUrl } from './tenant-customization-service';
import type { OrdemServico } from '../types/database';

export type QuoteStatus = 'rascunho' | 'enviado' | 'convertendo' | 'convertido' | 'recusado' | 'cancelado' | 'expirado';

export interface Orcamento {
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone?: string | null;
  cliente_cpf_cnpj?: string | null;
  cliente_email?: string | null;
  instrumento_nome?: string | null;
  marca_nome?: string | null;
  status: QuoteStatus;
  status_efetivo: QuoteStatus;
  valor_servicos: number;
  desconto: number;
  valor_total: number;
  forma_pagamento?: string | null;
  validade?: string | null;
  equipamento?: string | null;
  problema_descricao?: string | null;
  servico_descricao?: string | null;
  observacoes?: string | null;
  data_previsao?: string | null;
  payload?: Record<string, unknown>;
  enviado_em?: string | null;
  aprovado_em?: string | null;
  recusado_em?: string | null;
  motivo_recusa?: string | null;
  ordem_servico_id?: string | null;
  ordem_numero?: number | null;
  created_at: string;
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  convertendo: 'Convertendo',
  convertido: 'Virou OS',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  expirado: 'Vencido',
};

const dateOnly = (value?: string | null) => String(value || '').slice(0, 10);

export function formatDateBR(value?: string | null) {
  const iso = dateOnly(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Dados do orçamento no formato que o modelo de mensagem e o PDF da OS entendem. */
function asOrderLike(quote: Orcamento, { forPdf }: { forPdf: boolean }) {
  const validity = formatDateBR(quote.validade);
  const note = `Orçamento válido até ${validity}.`;
  return {
    id: quote.id,
    numero: forPdf ? `ORC-${quote.numero}` : String(quote.numero),
    cliente: { nome: quote.cliente_nome, telefone: quote.cliente_telefone, cpf_cnpj: quote.cliente_cpf_cnpj },
    instrumento: { nome: quote.instrumento_nome || '' },
    marca: { nome: quote.marca_nome || '' },
    modelo: String(quote.payload?.modelo || ''),
    acessorios: String(quote.payload?.acessorios || ''),
    problema_descricao: quote.problema_descricao || '',
    servico_descricao: quote.servico_descricao || '',
    valor_servicos: quote.valor_servicos,
    desconto: quote.desconto,
    valor_total: quote.valor_total,
    forma_pagamento: quote.forma_pagamento || 'a_definir',
    data_entrada: quote.created_at,
    data_previsao: quote.data_previsao || '',
    validade_orcamento: quote.validade || '',
    observacoes: forPdf ? [quote.observacoes, note].filter(Boolean).join('\n') : quote.observacoes || '',
  };
}

async function documentSetup() {
  const [templates, logoDataUrl, company] = await Promise.all([
    listDocumentTemplates<OrderDocumentTemplateConfig>().catch(() => []),
    loadBrandLogoDataUrl().catch(() => ''),
    WhatsAppService.loadEmpresaConfig(),
  ]);
  const selected = templates.find((template) => template.is_default) || templates[0];
  const base = normalizeOrderDocumentConfig(selected?.config_json || DEFAULT_ORDER_DOCUMENT_CONFIG);
  // O PDF do orçamento reaproveita o layout da OS, trocando só os títulos.
  const config: OrderDocumentTemplateConfig = {
    ...base,
    blocks: base.blocks.map((block) => {
      if (block.type === 'header') return { ...block, title: 'Orçamento' };
      if (block.type === 'dates') return { ...block, title: 'Prazos' };
      return block;
    }),
  };
  return { config, logoDataUrl, company };
}

export async function generateQuotePdf(quote: Orcamento): Promise<Blob> {
  const { config, logoDataUrl, company } = await documentSetup();
  return generateOrderDocumentPdf({ ordem: asOrderLike(quote, { forPdf: true }) as unknown as OrdemServico, company, logoDataUrl, config });
}

export async function downloadQuotePdf(quote: Orcamento) {
  const blob = await generateQuotePdf(quote);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Orcamento-${quote.numero}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function loadQuote(id: string) {
  return apiRequest<Orcamento>(`/api/orcamentos/${id}`);
}

/** Envia ao cliente a mensagem + PDF do orçamento e marca como "enviado". */
export async function sendQuoteToCustomer(quoteOrId: Orcamento | string) {
  const quote = typeof quoteOrId === 'string' ? await loadQuote(quoteOrId) : quoteOrId.payload ? quoteOrId : await loadQuote(quoteOrId.id);
  if (!quote.cliente_telefone) throw new Error('Este cliente não tem telefone cadastrado.');
  const company = await WhatsAppService.loadEmpresaConfig();
  const message = await TemplateService.processTemplate('orcamento_enviado', asOrderLike(quote, { forPdf: false }), company);
  const pdf = await generateQuotePdf(quote);
  await WhatsAppService.sendMessage(quote.cliente_telefone, message, {
    template_type: 'orcamento_enviado',
    attachment: { data_base64: await blobToBase64(pdf), mime_type: 'application/pdf', file_name: `Orcamento-${quote.numero}.pdf` },
  });
  await apiRequest(`/api/orcamentos/${quote.id}/enviado`, { method: 'POST' });
}
