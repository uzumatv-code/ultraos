import { supabase } from '../lib/supabase';
import { formatLocalDate } from './dates';

export interface MessageTemplate {
  id?: string;
  template_type: string;
  template_name: string;
  template_content: string;
  variables: string[];
  is_active: boolean;
}

export class TemplateService {
  private static templates: Map<string, MessageTemplate> = new Map();

  static async loadTemplate(templateType: string): Promise<MessageTemplate | null> {
    // Verificar cache primeiro
    if (this.templates.has(templateType)) {
      return this.templates.get(templateType)!;
    }

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

      if (error || !data) {
        // Retornar template padrão se não encontrar
        return this.getDefaultTemplate(templateType);
      }

      // Cachear o template
      this.templates.set(templateType, data);
      return data;

    } catch (error) {
      console.error('Erro ao carregar template:', error);
      return this.getDefaultTemplate(templateType);
    }
  }

  static getDefaultTemplate(templateType: string): MessageTemplate | null {
    const defaults: Record<string, MessageTemplate> = {
      nova_ordem: {
        template_type: 'nova_ordem',
        template_name: 'Nova Ordem Criada',
        template_content: `Olá {cliente}! 😊

Recebemos seu {instrumento} para reparo/manutenção.

📋 *ORDEM DE SERVIÇO #{numero}*
� Data de Entrada: {data_criacao}
🎸 Instrumento: {instrumento} {marca} {modelo}
📦 Acessórios: {acessorios}
⚙️ Serviços: {servicos}
� Problemas Reportados: {problemas}
�💰 Valor: {valor}
📅 Previsão de Entrega: {previsao_entrega}

{observacoes}

Manteremos você informado sobre o andamento!

📍 {nome_empresa}
📞 {telefone_empresa}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}`,
        variables: ['{cliente}', '{instrumento}', '{marca}', '{modelo}', '{numero}', '{acessorios}', '{servicos}', '{problemas}', '{valor}', '{forma_pagamento}', '{data_criacao}', '{previsao_entrega}', '{observacoes}', '{nome_empresa}', '{telefone_empresa}', '{endereco_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
        is_active: true
      },
      servico_finalizado: {
        template_type: 'servico_finalizado',
        template_name: 'Serviço Finalizado',
        template_content: `Olá {cliente}, seu {instrumento} ficou pronto! 🎸

Pode retirar entre:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

📍 {nome_empresa}
CNPJ: {cnpj}

Ordem de Serviço: #{numero}`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{cnpj}', '{horario_funcionamento}', '{dias_funcionamento}'],
        is_active: true
      },
      servico_andamento: {
        template_type: 'servico_andamento',
        template_name: 'Serviço em Andamento',
        template_content: `Olá {cliente}, informamos que seu {instrumento} está em andamento! 🔧

📋 Ordem de Serviço: #{numero}
⚙️ Nossos técnicos estão trabalhando no seu instrumento

📍 {nome_empresa}
📞 Entre em contato se tiver dúvidas

Horário de atendimento:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
        is_active: true
      },
      servico_atraso: {
        template_type: 'servico_atraso',
        template_name: 'Contratempo/Atraso',
        template_content: `Olá {cliente}, informamos sobre um contratempo no seu {instrumento} ⏰

📋 Ordem de Serviço: #{numero}
⚠️ Houve um pequeno atraso no cronograma

Entraremos em contato em breve com nova previsão de entrega.

📍 {nome_empresa}
📞 Entre em contato se tiver dúvidas

Horário de atendimento:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

Pedimos desculpas pelo inconveniente.`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
        is_active: true
      },
      lembrete_manutencao: {
        template_type: 'lembrete_manutencao',
        template_name: 'Lembrete Manutenção Preventiva',
        template_content: `Olá {cliente}! 👋

Esperamos que você e seu {instrumento} estejam bem! 🎸

Notamos que já faz {meses_sem_manutencao} meses desde sua última manutenção ({ultimo_servico}).

🔧 Que tal agendar uma revisão preventiva?
- Troca de cordas
- Regulagem
- Limpeza e hidratação
- Verificação geral

Uma manutenção regular mantém seu instrumento sempre em perfeito estado! 

📍 {nome_empresa}
📞 {telefone_empresa}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

Entre em contato para agendar! 😊`,
        variables: ['{cliente}', '{instrumento}', '{ultimo_servico}', '{meses_sem_manutencao}', '{nome_empresa}', '{telefone_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
        is_active: true
      },
      orcamento_aprovado: {
        template_type: 'orcamento_aprovado',
        template_name: 'Orçamento Aprovado',
        template_content: `Olá {cliente}! ✅

Orçamento aprovado para seu {instrumento}!

📋 Ordem de Serviço: #{numero}
⚙️ Serviços autorizados: {servicos}
💰 Valor aprovado: {valor}
📅 Nova previsão: {previsao_entrega}

Iniciaremos os trabalhos imediatamente!

📍 {nome_empresa}
📞 {telefone_empresa}`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{servicos}', '{valor}', '{previsao_entrega}', '{nome_empresa}', '{telefone_empresa}'],
        is_active: true
      },
      diagnostico_concluido: {
        template_type: 'diagnostico_concluido',
        template_name: 'Diagnóstico Concluído',
        template_content: `Olá {cliente}! 🔍

Diagnóstico concluído para seu {instrumento}:

📋 Ordem de Serviço: #{numero}
🔧 Problemas encontrados: {problemas_encontrados}
⚙️ Serviços necessários: {servicos_necessarios}
💰 Orçamento: {valor_orcamento}

Aguardamos sua aprovação para prosseguir!

📍 {nome_empresa}
📞 {telefone_empresa}`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{problemas_encontrados}', '{servicos_necessarios}', '{valor_orcamento}', '{nome_empresa}', '{telefone_empresa}'],
        is_active: true
      },
      lembrete_retirada: {
        template_type: 'lembrete_retirada',
        template_name: 'Lembrete de Retirada',
        template_content: `Olá {cliente}! 👋

Lembramos que seu {instrumento} está pronto há {dias_prontos} dias para retirada.

📋 Ordem de Serviço: #{numero}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

📍 {nome_empresa}

Aguardamos você! 😊`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}', '{dias_prontos}'],
        is_active: true
      },
      cobranca_pagamento: {
        template_type: 'cobranca_pagamento',
        template_name: 'Cobrança/Pagamento',
        template_content: `Olá {cliente}! 💳

Referente ao seu {instrumento}:

📋 Ordem de Serviço: #{numero}
💰 Valor total: {valor}
💵 Pendente: {valor_pendente}

Para finalizar, precisamos acertar o pagamento.

📍 {nome_empresa}
📞 Entre em contato para mais detalhes

Obrigado! 😊`,
        variables: ['{cliente}', '{instrumento}', '{numero}', '{valor}', '{valor_pendente}', '{forma_pagamento}', '{nome_empresa}'],
        is_active: true
      },
      avaliacao_google_instagram: {
        template_type: 'avaliacao_google_instagram',
        template_name: 'Solicitação de Avaliação e Instagram',
        template_content: `Olá {cliente}! 😊

Esperamos que esteja satisfeito(a) com o reparo do seu {instrumento} {marca} {modelo}!

🌟 *SUA OPINIÃO É MUITO IMPORTANTE*

Poderia nos ajudar avaliando nosso trabalho no Google? Sua avaliação ajuda outros músicos a nos conhecerem!

👍 Link para avaliar: {google_review_link}

📱 *SIGA-NOS NO INSTAGRAM*
Acompanhe dicas de manutenção, novos projetos e promoções: {instagram_handle}

Muito obrigado pela confiança! 🎸

📍 {nome_empresa}
📞 {telefone_empresa}

#Luthieria #ReparoInstrumentos #MúsicaBrasília`,
        variables: ['{cliente}', '{instrumento}', '{marca}', '{modelo}', '{numero}', '{nome_empresa}', '{telefone_empresa}', '{google_review_link}', '{instagram_handle}'],
        is_active: true
      }
    };

    return defaults[templateType] || null;
  }

  static async processTemplate(templateType: string, data: any, empresaConfig?: any): Promise<string> {
    const template = await this.loadTemplate(templateType);
    if (!template) {
      throw new Error(`Template ${templateType} não encontrado`);
    }

    let message = template.template_content || (template as any).content;
    if (typeof message !== 'string' || !message.trim()) {
      const defaultTemplate = this.getDefaultTemplate(templateType);
      message = defaultTemplate?.template_content;
    }
    if (typeof message !== 'string' || !message.trim()) {
      throw new Error(`Template ${templateType} está sem conteúdo`);
    }

    // Substituir variáveis básicas da ordem
    if (data.cliente) {
      const clienteNome = typeof data.cliente === 'string' ? data.cliente : data.cliente.nome || 'Cliente';
      message = message.replace(/{cliente}/g, clienteNome);
    }
    if (data.instrumento) {
      const instrumentoNome = typeof data.instrumento === 'string' ? data.instrumento : data.instrumento.nome || 'Instrumento';
      message = message.replace(/{instrumento}/g, instrumentoNome);
    }
    if (data.marca) {
      const marcaNome = typeof data.marca === 'string' ? data.marca : data.marca.nome || '';
      message = message.replace(/{marca}/g, marcaNome);
    }
    
    message = message.replace(/{numero}/g, data.numero || '');
    message = message.replace(/{modelo}/g, data.modelo || '');
    message = message.replace(/{acessorios}/g, data.acessorios || 'Nenhum acessório reportado');
    message = message.replace(/{valor}/g, data.valor_total ? `R$ ${data.valor_total.toFixed(2).replace('.', ',')}` : 'A definir');
    
    // Processar forma de pagamento
    const formasPagamento = {
      'credito': 'Cartão de Crédito',
      'debito': 'Cartão de Débito', 
      'pix': 'PIX',
      'dinheiro': 'Dinheiro',
      'transferencia': 'Transferência Bancária'
    };
    const formaPagamentoFormatada = data.forma_pagamento ? 
      formasPagamento[data.forma_pagamento as keyof typeof formasPagamento] || data.forma_pagamento : 
      'A definir';
    message = message.replace(/{forma_pagamento}/g, formaPagamentoFormatada);

    // Processar valores financeiros
    message = message.replace(/{valor_servicos}/g, data.valor_servicos ? `R$ ${data.valor_servicos.toFixed(2).replace('.', ',')}` : 'R$ 0,00');
    message = message.replace(/{desconto}/g, data.desconto ? `R$ ${data.desconto.toFixed(2).replace('.', ',')}` : 'R$ 0,00');
    message = message.replace(/{valor_pendente}/g, data.valor_pendente ? `R$ ${data.valor_pendente.toFixed(2).replace('.', ',')}` : 'R$ 0,00');
    message = message.replace(/{valor_orcamento}/g, data.valor_orcamento ? `R$ ${data.valor_orcamento.toFixed(2).replace('.', ',')}` : 'A definir');

    // Substituir variáveis da empresa (se disponível)
    if (empresaConfig) {
      message = message.replace(/{nome_empresa}/g, empresaConfig.nome_empresa || '');
      message = message.replace(/{cnpj}/g, empresaConfig.cnpj || '');
      message = message.replace(/{horario_funcionamento}/g, empresaConfig.horario_funcionamento || '');
      message = message.replace(/{dias_funcionamento}/g, empresaConfig.dias_funcionamento || '');
      message = message.replace(/{telefone_empresa}/g, empresaConfig.telefone || '');
      message = message.replace(/{endereco_empresa}/g, empresaConfig.endereco || '');
    }

    // Substituir outras variáveis específicas
    if (data.servicos && Array.isArray(data.servicos)) {
      const servicosText = data.servicos.map((s: any) => s.nome || s).join(', ');
      message = message.replace(/{servicos}/g, servicosText || 'Diagnóstico e orçamento');
    } else {
      message = message.replace(/{servicos}/g, 'Diagnóstico e orçamento');
    }

    // Processar problemas reportados
    message = message.replace(/{problemas}/g, data.problema_descricao || 'Não informado');

    // Processar observações
    if (data.observacoes && data.observacoes.trim()) {
      message = message.replace(/{observacoes}/g, `📝 Observações: ${data.observacoes}`);
    } else {
      message = message.replace(/{observacoes}/g, '');
    }

    if (data.data_criacao || data.data_entrada) {
      const dataFormatada = formatLocalDate(data.data_criacao || data.data_entrada);
      message = message.replace(/{data_criacao}/g, dataFormatada);
    }

    if (data.previsao_entrega || data.data_previsao) {
      const previsaoFormatada = formatLocalDate(data.previsao_entrega || data.data_previsao);
      message = message.replace(/{previsao_entrega}/g, previsaoFormatada);
    }

    // Processar variáveis específicas do template de avaliação
    message = message.replace(/{google_review_link}/g, data.google_review_link || 'https://g.page/r/SEU_PERFIL_GOOGLE/review');
    message = message.replace(/{instagram_handle}/g, data.instagram_handle || '@luthieriabrasilia');

    return message;
  }

  static clearCache(): void {
    this.templates.clear();
  }
}
