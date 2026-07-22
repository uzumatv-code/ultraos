import type { OrdemServico } from '../types/database';
import { formatCurrency, formatDate } from './formatters';
import { getOrderProblemAndServiceText } from './template-service';

export type OrderDocumentBlockType =
  | 'header'
  | 'customer'
  | 'equipment'
  | 'diagnostic'
  | 'pricing'
  | 'dates'
  | 'notes'
  | 'custom_text'
  | 'signature'
  | 'footer';

export interface OrderDocumentBlock {
  id: string;
  type: OrderDocumentBlockType;
  title: string;
  content?: string;
  visible: boolean;
}

export interface OrderDocumentTemplateConfig {
  schemaVersion: 1;
  pageOrientation: 'portrait' | 'landscape';
  primaryColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  fontFamily: 'Arial' | 'Helvetica' | 'Georgia' | 'Times New Roman' | 'Verdana';
  logoPosition: 'left' | 'center' | 'right';
  borderRadius: number;
  showBorders: boolean;
  footerText: string;
  blocks: OrderDocumentBlock[];
}

export interface CompanyDocumentConfig {
  nome_empresa?: string;
  cnpj?: string;
  telefone?: string;
  telefone_empresa?: string;
  email?: string;
  endereco?: string;
}

export const ORDER_BLOCK_LABELS: Record<OrderDocumentBlockType, string> = {
  header: 'Cabeçalho da empresa',
  customer: 'Dados do cliente',
  equipment: 'Dados do equipamento',
  diagnostic: 'Problema e solução',
  pricing: 'Serviços e valores',
  dates: 'Datas',
  notes: 'Observações',
  custom_text: 'Texto personalizado',
  signature: 'Assinaturas',
  footer: 'Rodapé',
};

export const DEFAULT_ORDER_DOCUMENT_CONFIG: OrderDocumentTemplateConfig = {
  schemaVersion: 1,
  pageOrientation: 'portrait',
  primaryColor: '#4f46e5',
  accentColor: '#eef2ff',
  textColor: '#111827',
  mutedColor: '#6b7280',
  fontFamily: 'Arial',
  logoPosition: 'left',
  borderRadius: 8,
  showBorders: true,
  footerText: 'Este documento não tem valor fiscal — emitido para controle da ordem de serviço.',
  blocks: [
    { id: 'header', type: 'header', title: 'Ordem de Serviço', visible: true },
    { id: 'customer', type: 'customer', title: 'Informações do cliente', visible: true },
    { id: 'equipment', type: 'equipment', title: 'Informações do equipamento', visible: true },
    { id: 'diagnostic', type: 'diagnostic', title: 'Diagnóstico e solução', visible: true },
    { id: 'pricing', type: 'pricing', title: 'Serviços e valores', visible: true },
    { id: 'dates', type: 'dates', title: 'Datas', visible: true },
    { id: 'notes', type: 'notes', title: 'Observações', visible: true },
    { id: 'signature', type: 'signature', title: 'Assinaturas', visible: true },
    { id: 'footer', type: 'footer', title: 'Rodapé', visible: true },
  ],
};

function safeColor(value: unknown, fallback: string) {
  const color = String(value || '');
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export function normalizeOrderDocumentConfig(value: unknown): OrderDocumentTemplateConfig {
  const source = value && typeof value === 'object' ? value as Partial<OrderDocumentTemplateConfig> : {};
  const allowedTypes = new Set(Object.keys(ORDER_BLOCK_LABELS));
  const blocks = Array.isArray(source.blocks)
    ? source.blocks
        .filter((block): block is OrderDocumentBlock => Boolean(block && allowedTypes.has(block.type)))
        .slice(0, 30)
        .map((block, index) => ({
          id: String(block.id || `${block.type}-${index}`),
          type: block.type,
          title: String(block.title || ORDER_BLOCK_LABELS[block.type]).slice(0, 100),
          content: block.type === 'custom_text' ? String(block.content || '').slice(0, 3000) : '',
          visible: block.visible !== false,
        }))
    : DEFAULT_ORDER_DOCUMENT_CONFIG.blocks.map((block) => ({ ...block }));

  return {
    schemaVersion: 1,
    pageOrientation: source.pageOrientation === 'landscape' ? 'landscape' : 'portrait',
    primaryColor: safeColor(source.primaryColor, DEFAULT_ORDER_DOCUMENT_CONFIG.primaryColor),
    accentColor: safeColor(source.accentColor, DEFAULT_ORDER_DOCUMENT_CONFIG.accentColor),
    textColor: safeColor(source.textColor, DEFAULT_ORDER_DOCUMENT_CONFIG.textColor),
    mutedColor: safeColor(source.mutedColor, DEFAULT_ORDER_DOCUMENT_CONFIG.mutedColor),
    fontFamily: ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana'].includes(String(source.fontFamily))
      ? source.fontFamily as OrderDocumentTemplateConfig['fontFamily']
      : 'Arial',
    logoPosition: ['left', 'center', 'right'].includes(String(source.logoPosition))
      ? source.logoPosition as OrderDocumentTemplateConfig['logoPosition']
      : 'left',
    borderRadius: Math.min(16, Math.max(0, Number(source.borderRadius) || 0)),
    showBorders: source.showBorders !== false,
    footerText: String(source.footerText ?? DEFAULT_ORDER_DOCUMENT_CONFIG.footerText).slice(0, 500),
    blocks: blocks.length ? blocks : DEFAULT_ORDER_DOCUMENT_CONFIG.blocks.map((block) => ({ ...block })),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function row(label: string, value: unknown) {
  return `<div class="field"><span class="label">${escapeHtml(label)}</span><span>${escapeHtml(value || '—')}</span></div>`;
}

function customText(content: string, ordem: OrdemServico, company: CompanyDocumentConfig, problemas: string, servicos: string) {
  const values: Record<string, string> = {
    '{empresa.nome}': company.nome_empresa || 'Sua Empresa',
    '{empresa.cnpj}': company.cnpj || '',
    '{empresa.telefone}': company.telefone_empresa || company.telefone || '',
    '{empresa.email}': company.email || '',
    '{empresa.endereco}': company.endereco || '',
    '{os.numero}': String(ordem.numero || ''),
    '{os.problemas}': problemas,
    '{os.servicos}': servicos,
    '{os.valor_total}': formatCurrency(Number(ordem.valor_total ?? (Number(ordem.valor_servicos || 0) - Number(ordem.desconto || 0)))),
    '{cliente.nome}': ordem.cliente?.nome || '',
    '{cliente.telefone}': ordem.cliente?.telefone || '',
    '{equipamento.modelo}': ordem.modelo || '',
  };
  let rendered = escapeHtml(content);
  for (const [variable, value] of Object.entries(values)) rendered = rendered.split(variable).join(escapeHtml(value));
  return rendered;
}

function renderBlock(
  block: OrderDocumentBlock,
  ordem: OrdemServico,
  company: CompanyDocumentConfig,
  logoDataUrl: string,
  config: OrderDocumentTemplateConfig,
) {
  const { problemas, servicos } = getOrderProblemAndServiceText(ordem as unknown as Record<string, unknown>);
  const section = (content: string) => `<section class="section"><h2>${escapeHtml(block.title)}</h2>${content}</section>`;
  switch (block.type) {
    case 'header': {
      const logo = logoDataUrl ? `<img class="logo" src="${escapeHtml(logoDataUrl)}" alt="Logo da empresa">` : '';
      const details = [company.cnpj && `CNPJ: ${company.cnpj}`, company.telefone_empresa || company.telefone, company.email, company.endereco]
        .filter(Boolean).map(escapeHtml).join(' • ');
      return `<header class="document-header logo-${config.logoPosition}">${logo}<div class="company"><strong>${escapeHtml(company.nome_empresa || 'Sua Empresa')}</strong><span>${details}</span></div><div class="order-title"><b>${escapeHtml(block.title || 'Ordem de Serviço')}</b><span>Nº ${escapeHtml(ordem.numero)}</span></div></header>`;
    }
    case 'customer':
      return section(`${row('Nome', ordem.cliente?.nome)}${row('Telefone', ordem.cliente?.telefone)}${row('CPF/CNPJ', ordem.cliente?.cpf_cnpj)}`);
    case 'equipment':
      return section(`${row('Equipamento', ordem.instrumento?.nome)}${row('Marca', ordem.marca?.nome)}${row('Modelo', ordem.modelo)}${row('Acessórios', ordem.acessorios || 'Nenhum')}`);
    case 'diagnostic':
      return section(`<div class="stack"><b>Problema</b><span>${escapeHtml(problemas)}</span></div><div class="stack"><b>Solução / serviços</b><span>${escapeHtml(servicos)}</span></div>`);
    case 'pricing': {
      const total = Number(ordem.valor_total ?? (Number(ordem.valor_servicos || 0) - Number(ordem.desconto || 0)));
      return section(`${row('Valor dos serviços', formatCurrency(Number(ordem.valor_servicos || 0)))}${row('Desconto', formatCurrency(Number(ordem.desconto || 0)))}${row('Valor total', formatCurrency(total))}${row('Forma de pagamento', String(ordem.forma_pagamento || '').toUpperCase())}`);
    }
    case 'dates':
      return section(`${row('Data de entrada', formatDate(ordem.data_entrada))}${row('Previsão de entrega', formatDate(ordem.data_previsao))}`);
    case 'notes':
      return section(`<div class="pre-wrap">${escapeHtml(ordem.observacoes || 'Sem observações.')}</div>`);
    case 'custom_text':
      return section(`<div class="pre-wrap">${customText(block.content || '', ordem, company, problemas, servicos)}</div>`);
    case 'signature':
      return `<section class="signatures"><div><span></span>Assinatura do cliente</div><div><span></span>${escapeHtml(company.nome_empresa || 'Responsável')}</div></section>`;
    case 'footer':
      return `<footer>${escapeHtml(config.footerText)}</footer>`;
    default:
      return '';
  }
}

export function buildOrderDocumentHtml(options: {
  ordem: OrdemServico;
  company?: CompanyDocumentConfig | null;
  logoDataUrl?: string;
  config?: OrderDocumentTemplateConfig | null;
  autoPrint?: boolean;
}) {
  const company = options.company || {};
  const config = normalizeOrderDocumentConfig(options.config);
  const content = config.blocks
    .filter((block) => block.visible)
    .map((block) => renderBlock(block, options.ordem, company, options.logoDataUrl || '', config))
    .join('');
  const width = config.pageOrientation === 'landscape' ? '297mm' : '210mm';
  const height = config.pageOrientation === 'landscape' ? '210mm' : '297mm';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ordem de Serviço #${escapeHtml(options.ordem.numero)}</title><style>
    @page { size: A4 ${config.pageOrientation}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e5e7eb; color: ${config.textColor}; font-family: ${config.fontFamily}, sans-serif; font-size: 12px; line-height: 1.45; }
    .page { width: ${width}; min-height: ${height}; margin: 0 auto; padding: 12mm; background: white; }
    .document-header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 3px solid ${config.primaryColor}; }
    .document-header.logo-center { grid-template-columns: 1fr; text-align: center; }
    .document-header.logo-right { grid-template-columns: auto 1fr auto; }
    .document-header.logo-right .logo { order: 3; }
    .document-header.logo-right .company { order: 2; text-align: right; }
    .document-header.logo-right .order-title { order: 1; text-align: left; }
    .logo { width: 74px; height: 58px; object-fit: contain; }
    .company { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .company strong { color: ${config.primaryColor}; font-size: 20px; }
    .company span { color: ${config.mutedColor}; font-size: 10px; }
    .order-title { display: flex; flex-direction: column; text-align: right; text-transform: uppercase; }
    .order-title b { font-size: 16px; color: ${config.primaryColor}; }
    .order-title span { font-size: 13px; font-weight: 700; }
    .section { margin: 0 0 12px; padding: 11px; border: ${config.showBorders ? `1px solid ${config.primaryColor}33` : '0'}; border-radius: ${config.borderRadius}px; break-inside: avoid; }
    .section h2 { margin: -11px -11px 10px; padding: 7px 11px; border-radius: ${config.borderRadius}px ${config.borderRadius}px 0 0; background: ${config.accentColor}; color: ${config.primaryColor}; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .field { display: grid; grid-template-columns: minmax(110px, 32%) 1fr; gap: 8px; padding: 3px 0; }
    .label, .stack b { font-weight: 700; }
    .stack { display: flex; flex-direction: column; gap: 3px; margin-bottom: 9px; }
    .stack:last-child { margin-bottom: 0; }
    .pre-wrap { white-space: pre-wrap; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin: 48px 20px 20px; text-align: center; break-inside: avoid; }
    .signatures div { color: ${config.mutedColor}; }
    .signatures span { display: block; border-top: 1px solid ${config.textColor}; margin-bottom: 5px; }
    footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid ${config.primaryColor}33; color: ${config.mutedColor}; text-align: center; font-size: 9px; white-space: pre-wrap; }
    @media print { body { background: white; print-color-adjust: exact; -webkit-print-color-adjust: exact; } .page { margin: 0; padding: 0; width: auto; min-height: auto; } }
  </style></head><body><main class="page">${content}</main>${options.autoPrint ? '<script>window.onload=()=>window.print();</script>' : ''}</body></html>`;
}

export const SAMPLE_ORDER_DOCUMENT = {
  id: 'preview', numero: 123, cliente_id: '', instrumento_id: '', marca_id: '', modelo: 'Modelo demonstrativo',
  acessorios: 'Capa e correia', problemas_ids: [], problema_descricao: 'Ruído e trastejamento nas primeiras casas.',
  servicos_ids: [], servico_descricao: 'Regulagem completa, limpeza e ajuste de tensor.', valor_servicos: 350,
  desconto: 25, valor_total: 325, forma_pagamento: 'pix', observacoes: 'Entrar em contato antes de realizar serviços adicionais.',
  data_entrada: '2026-07-22', data_previsao: '2026-07-29', status: 'pendente', created_at: '2026-07-22', user_id: '',
  cliente: { id: '', nome: 'Cliente de exemplo', telefone: '(61) 99999-9999', cpf_cnpj: '000.000.000-00', email: '', endereco: '', created_at: '', user_id: '' },
  instrumento: { id: '', nome: 'Guitarra', descricao: '', created_at: '', user_id: '' },
  marca: { id: '', nome: 'Marca demonstrativa', created_at: '', user_id: '' },
} as OrdemServico;
