import { supabase } from '../lib/supabase';
import { formatLocalDate } from './dates';
import { MESSAGE_TEMPLATE_BY_TYPE } from './message-template-definitions';

const HORARIO_FUNCIONAMENTO_PADRAO = '10h às 13h | 14h às 18h';
const DIAS_FUNCIONAMENTO_PADRAO = 'Segunda a Sábado';

export interface MessageTemplate {
  id?: string;
  template_type: string;
  template_name: string;
  template_content: string;
  variables: string[];
  is_active: boolean;
  updated_at?: string;
}

function entityName(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (value && typeof value === 'object' && 'nome' in value) {
    const name = String((value as { nome?: unknown }).nome || '').trim();
    return name || fallback;
  }
  return fallback;
}

function formatCurrency(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === '') return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTemplateDate(value: unknown, fallback = 'Não informada'): string {
  if (!value) return fallback;
  try {
    return formatLocalDate(String(value));
  } catch {
    return fallback;
  }
}

function formatPaymentMethod(value: unknown): string {
  const methods: Record<string, string> = {
    credito: 'Cartão de Crédito',
    debito: 'Cartão de Débito',
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    transferencia: 'Transferência Bancária',
  };
  const key = String(value || '').trim();
  return methods[key] || key || 'A definir';
}

function serviceDescription(data: Record<string, unknown>): string {
  if (Array.isArray(data.servicos)) {
    const names = data.servicos.map((service) => entityName(service, '')).filter(Boolean);
    if (names.length) return names.join(', ');
  }
  return String(data.servico_descricao || data.servicos_necessarios || '').trim() || 'Diagnóstico e orçamento';
}

function cleanObservations(content: string, data: Record<string, unknown>): string {
  let observations = String(data.observacoes || '').trim();
  if (!observations) return '';

  // NovaOrdem persiste problemas/serviços também dentro de observações. Quando o
  // template já possui essas variáveis, manter somente a observação escrita pelo usuário.
  if (content.includes('{problemas}') || content.includes('{servicos}')) {
    observations = observations.replace(/(?:^|\n\n)Problemas:\s*[\s\S]*$/i, '').trim();
  }
  return observations ? `📝 Observações: ${observations}` : '';
}

function templateValues(content: string, data: Record<string, unknown>, companyConfig?: Record<string, unknown> | null) {
  const company = companyConfig || {};
  const services = serviceDescription(data);
  const problems = String(data.problema_descricao || data.problemas_encontrados || '').trim() || 'Não informado';

  return {
    cliente: entityName(data.cliente, 'Cliente'),
    instrumento: entityName(data.instrumento, 'Instrumento'),
    marca: entityName(data.marca, ''),
    modelo: String(data.modelo || '').trim(),
    numero: String(data.numero ?? '').trim(),
    acessorios: String(data.acessorios || '').trim() || 'Nenhum acessório reportado',
    servicos: services,
    problemas: problems,
    valor: formatCurrency(data.valor_total, 'A definir'),
    forma_pagamento: formatPaymentMethod(data.forma_pagamento),
    valor_servicos: formatCurrency(data.valor_servicos, 'R$ 0,00'),
    desconto: formatCurrency(data.desconto, 'R$ 0,00'),
    valor_pendente: formatCurrency(data.valor_pendente, 'R$ 0,00'),
    valor_orcamento: formatCurrency(data.valor_orcamento ?? data.valor_total, 'A definir'),
    data_criacao: formatTemplateDate(data.data_criacao || data.data_entrada || data.created_at),
    previsao_entrega: formatTemplateDate(data.previsao_entrega || data.data_previsao),
    observacoes: cleanObservations(content, data),
    nome_empresa: String(company.nome_empresa || data.nome_empresa || '').trim() || 'Sua Empresa',
    cnpj: String(company.cnpj || data.cnpj || '').trim(),
    telefone_empresa: String(company.telefone_empresa || company.telefone || data.telefone_empresa || data.telefone || '').trim(),
    endereco_empresa: String(company.endereco || data.endereco || '').trim(),
    horario_funcionamento: String(company.horario_funcionamento || data.horario_funcionamento || '').trim() || HORARIO_FUNCIONAMENTO_PADRAO,
    dias_funcionamento: String(company.dias_funcionamento || data.dias_funcionamento || '').trim() || DIAS_FUNCIONAMENTO_PADRAO,
    termos_de_uso: String(company.termos_de_uso || data.termos_de_uso || '').trim(),
    google_review_link: String(data.google_review_link || company.google_review_link || '').trim() || 'https://g.page/r/SEU_PERFIL_GOOGLE/review',
    instagram_handle: String(data.instagram_handle || company.instagram_handle || '').trim() || '@sua_empresa',
    ultimo_servico: String(data.ultimo_servico || data.servico_descricao || '').trim() || services,
    meses_sem_manutencao: String(data.meses_sem_manutencao ?? '').trim() || '6',
    dias_prontos: String(data.dias_prontos ?? '').trim() || '0',
    problemas_encontrados: String(data.problemas_encontrados || data.problema_descricao || '').trim() || problems,
    servicos_necessarios: String(data.servicos_necessarios || data.servico_descricao || '').trim() || services,
  };
}

export function renderTemplateContent(
  content: string,
  data: Record<string, unknown>,
  companyConfig?: Record<string, unknown> | null,
): string {
  const values = templateValues(content, data, companyConfig);
  const unknownVariables = new Set<string>();
  const rendered = content.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: keyof typeof values) => {
    if (!(key in values)) {
      unknownVariables.add(match);
      return match;
    }
    return values[key];
  });

  if (unknownVariables.size) {
    throw new Error(`Variáveis não reconhecidas no template: ${[...unknownVariables].join(', ')}`);
  }

  return rendered.replace(/^[ \t]+$/gm, '').trim();
}

export class TemplateService {
  private static templates: Map<string, MessageTemplate> = new Map();

  static async loadTemplate(templateType: string): Promise<MessageTemplate | null> {
    if (this.templates.has(templateType)) return this.templates.get(templateType)!;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('template_type', templateType)
        .eq('is_active', true)
        .single();

      const template = error || !data ? this.getDefaultTemplate(templateType) : data as MessageTemplate;
      if (template) this.templates.set(templateType, template);
      return template;
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      return this.getDefaultTemplate(templateType);
    }
  }

  static getDefaultTemplate(templateType: string): MessageTemplate | null {
    const definition = MESSAGE_TEMPLATE_BY_TYPE[templateType];
    if (!definition) return null;
    return {
      template_type: definition.type,
      template_name: definition.name,
      template_content: definition.defaultContent,
      variables: definition.variables,
      is_active: true,
    };
  }

  static async processTemplate(
    templateType: string,
    data: Record<string, unknown>,
    companyConfig?: Record<string, unknown> | null,
  ): Promise<string> {
    const template = await this.loadTemplate(templateType);
    if (!template) throw new Error(`Template ${templateType} não encontrado`);

    const content = template.template_content || (template as MessageTemplate & { content?: string }).content;
    if (typeof content !== 'string' || !content.trim()) throw new Error(`Template ${templateType} está sem conteúdo`);
    return renderTemplateContent(content, data, companyConfig);
  }

  static clearCache(templateType?: string): void {
    if (templateType) this.templates.delete(templateType);
    else this.templates.clear();
  }
}
