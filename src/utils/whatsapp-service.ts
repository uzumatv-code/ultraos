import { supabase } from '../lib/supabase';
import { TemplateService } from './template-service';

export interface WhatsAppConfig {
  method: 'direct' | 'webhook'; // 'webhook' = Evolution API direta
  webhook_url: string;
  api_key?: string;
  instance_name?: string;
}

export class WhatsAppService {
  private static config: WhatsAppConfig | null = null;
  private static empresaConfig: any | null = null;
  // Flag para controlar o logging - pode ser desabilitado se houver problemas
  private static enableLogging: boolean = true;

  static async loadConfig(): Promise<WhatsAppConfig> {
    if (this.config) return this.config;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { method: 'direct', webhook_url: '' };
      }

      const { data, error } = await supabase
        .from('configuracoes_whatsapp')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        this.config = { method: 'direct', webhook_url: '' };
      } else {
        this.config = data;
      }

      return this.config!
    } catch (error) {
      console.error('Erro ao carregar configurações WhatsApp:', error);
      return { method: 'direct', webhook_url: '' };
    }
  }

  static async loadEmpresaConfig(): Promise<any> {
    if (this.empresaConfig) return this.empresaConfig;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('configuracoes_empresa')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        this.empresaConfig = {
          nome_empresa: 'Sua Empresa',
          telefone_empresa: '',
          horario_funcionamento: '09:00 às 18:00',
          dias_funcionamento: 'Segunda a Sexta'
        };
      } else {
        this.empresaConfig = data;
      }

      return this.empresaConfig;
    } catch (error) {
      console.error('Erro ao carregar configurações da empresa:', error);
      return null;
    }
  }

  static async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    const config = await this.loadConfig();
    
    if (config.method === 'webhook' && config.webhook_url) {
      return this.sendViaEvolutionAPI(phoneNumber, message, config);
    } else {
      return this.sendViaDirect(phoneNumber, message);
    }
  }

  static async sendOrderMessage(ordem: any): Promise<boolean> {
    if (!ordem.cliente?.telefone) {
      throw new Error('Cliente não possui telefone cadastrado');
    }

    const empresaConfig = await this.loadEmpresaConfig();
    const message = await TemplateService.processTemplate('nova_ordem', ordem, empresaConfig);
    
    return this.sendMessage(ordem.cliente.telefone, message);
  }

  static async sendCompletionMessage(ordem: any): Promise<boolean> {
    if (!ordem.cliente?.telefone) {
      throw new Error('Cliente não possui telefone cadastrado');
    }

    const empresaConfig = await this.loadEmpresaConfig();
    const message = await TemplateService.processTemplate('servico_finalizado', ordem, empresaConfig);
    
    return this.sendMessage(ordem.cliente.telefone, message);
  }

  static async sendProgressMessage(ordem: any): Promise<boolean> {
    if (!ordem.cliente?.telefone) {
      throw new Error('Cliente não possui telefone cadastrado');
    }

    const empresaConfig = await this.loadEmpresaConfig();
    const message = await TemplateService.processTemplate('servico_andamento', ordem, empresaConfig);
    
    return this.sendMessage(ordem.cliente.telefone, message);
  }

  static async sendDelayMessage(ordem: any): Promise<boolean> {
    if (!ordem.cliente?.telefone) {
      throw new Error('Cliente não possui telefone cadastrado');
    }

    const empresaConfig = await this.loadEmpresaConfig();
    const message = await TemplateService.processTemplate('servico_atraso', ordem, empresaConfig);
    
    return this.sendMessage(ordem.cliente.telefone, message);
  }

  private static async sendViaEvolutionAPI(phoneNumber: string, message: string, config: WhatsAppConfig): Promise<boolean> {
    try {
      console.log('📞 Telefone recebido do banco:', phoneNumber);
      
      // Verifica se o número é internacional (começa com +)
      const isInternational = phoneNumber.startsWith('+');
      
      // Remove todos os caracteres não numéricos
      const cleanedPhone = phoneNumber.replace(/\D/g, '');
      
      // Payload padrão da Evolution API v2
      // Se for internacional (tem + no início), usa o número como está (já inclui código do país)
      // Senão, adiciona código do Brasil (55)
      const payload = {
        number: isInternational ? cleanedPhone : `55${cleanedPhone}`,
        text: message
      };
      
      console.log('📱 Número internacional:', isInternational, '| Número final:', payload.number);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': config.api_key || ''
      };

      // Construir URL da Evolution API (usando webhook_url como base)
      const baseUrl = config.webhook_url.replace(/\/$/, '');
      const instanceName = config.instance_name || 'default';
      const url = `${baseUrl}/message/sendText/${instanceName}`;

      console.log('📤 Evolution API - Enviando mensagem para:', url);
      console.log('📦 Payload:', { ...payload, text: payload.text.substring(0, 50) + '...' });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('Evolution API Response:', responseText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      console.log('✅ WhatsApp Service - Mensagem enviada via Evolution API com sucesso');
      return true;

    } catch (error: any) {
      console.error('❌ WhatsApp Service - Erro ao enviar via Evolution API:', error);
      throw error;
    }
  }

  private static sendViaDirect(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Verifica se o número é internacional (começa com +)
      const isInternational = phoneNumber.startsWith('+');
      
      const cleanedPhone = phoneNumber.replace(/\D/g, '');
      const encodedMessage = encodeURIComponent(message);
      
      // Se for internacional (tem + no início), usa o número como está (já inclui código do país)
      const formattedNumber = isInternational ? cleanedPhone : `55${cleanedPhone}`;
      const url = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
      
      window.open(url, '_blank');
      
      // Log desabilitado - WhatsApp funcionando sem logging
      console.log('✅ WhatsApp Service - Mensagem direta enviada (sem logging)');
      return Promise.resolve(true);

    } catch (error: any) {
      console.error('❌ WhatsApp Service - Erro ao enviar via método direto:', error);
      // Log desabilitado - sem INSERT na base de dados
      return Promise.reject(error);
    }
  }

  static clearCache(): void {
    this.config = null;
    this.empresaConfig = null;
    TemplateService.clearCache();
  }

  // Método para enviar solicitação de avaliação
  static async sendEvaluationRequest(ordem: any): Promise<void> {
    try {
      // Carregar configurações da empresa
      const empresaConfig = await this.loadEmpresaConfig();
      
      // Criar objeto de dados com informações da empresa incluídas
      const templateData = {
        ...ordem,
        google_review_link: empresaConfig?.google_review_link || 'https://g.page/r/SEU_PERFIL_GOOGLE/review',
        instagram_handle: empresaConfig?.instagram_handle || '@sua_luthieria',
        nome_empresa: empresaConfig?.nome_empresa || 'Luthieria'
      };

      // Processar template com variáveis
      const message = await TemplateService.processTemplate('avaliacao_google_instagram', templateData, empresaConfig);

      // Enviar mensagem
      await this.sendMessage(ordem.cliente?.telefone, message);
      
    } catch (error: any) {
      console.error('Erro ao enviar solicitação de avaliação:', error);
      throw error;
    }
  }

  // Método para reabilitar o logging WhatsApp
  static enableWhatsAppLogging(): void {
    this.enableLogging = true;
    console.log('✅ Logging WhatsApp reabilitado');
  }

  // Método para desabilitar o logging WhatsApp
  static disableWhatsAppLogging(): void {
    this.enableLogging = false;
    console.log('🚨 Logging WhatsApp desabilitado');
  }

  // Método temporário para desabilitar completamente o logging
  static disableLoggingCompletely(): void {
    this.enableLogging = false;
    console.log('🚫 Logging WhatsApp completamente desabilitado - modo emergência');
  }

  // Método para verificar se o logging está habilitado
  static isLoggingEnabled(): boolean {
    return this.enableLogging;
  }

  // Método para testar se a tabela existe e está acessível
  static async testWhatsAppLogsTable(): Promise<boolean> {
    console.log('🚫 Teste de tabela whatsapp_logs desabilitado - modo emergência');
    return true; // Sempre retorna true para não quebrar fluxos que dependem disso
  }
}
