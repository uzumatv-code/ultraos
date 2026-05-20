import { supabase } from '../lib/supabase';
import { WhatsAppService } from './whatsapp-service';

/**
 * Serviço de Lembretes de Avaliação
 * 
 * Funciona exatamente como o workflow N8N:
 * 1. Busca ordens concluídas há mais de 7 dias onde solicita_avaliacao = false
 * 2. Para cada ordem, busca o cliente e verifica se avaliou = false
 * 3. Envia mensagem WhatsApp via Evolution API
 * 4. Atualiza solicita_avaliacao = true na ordem
 * 5. Atualiza avaliou = true no cliente
 */

export interface PendingEvaluationOrder {
  ordem_id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  instrumento_nome: string;
  marca_nome: string;
  modelo: string;
  data_conclusao: string;
  dias_desde_conclusao: number;
}

export interface EvaluationSettings {
  enabled: boolean;
  days_after_completion: number;
  trigger_hour: number;
  google_review_link: string;
  instagram_handle: string;
}

export interface EvaluationLog {
  id: string;
  ordem_id: string;
  cliente_id: string;
  cliente_nome: string;
  telefone: string;
  status: 'enviado' | 'erro';
  mensagem_erro?: string;
  created_at: string;
}

export class EvaluationReminderService {
  private static defaultSettings: EvaluationSettings = {
    enabled: true,
    days_after_completion: 7,
    trigger_hour: 11,
    google_review_link: 'https://g.page/r/Cd8CHsL7KDxCEBM/review',
    instagram_handle: '@luthieriabrasilia'
  };

  /**
   * Busca ordens elegíveis para solicitação de avaliação
   * Lógica N8N: 
   * - status = 'concluido'
   * - data_previsao < 7 dias atrás
   * - solicita_avaliacao = false
   * - cliente.avaliou = false
   */
  static async getPendingEvaluationOrders(): Promise<PendingEvaluationOrder[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const settings = await this.getSettings();
      
      // Calcular data limite (hoje - X dias)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - settings.days_after_completion);
      const cutoffISO = cutoffDate.toISOString().split('T')[0];

      console.log(`🔍 Buscando ordens concluídas antes de ${cutoffISO}...`);

      // Buscar ordens concluídas há mais de X dias, que ainda não solicitaram avaliação
      const { data: ordens, error: ordensError } = await supabase
        .from('ordens_servico')
        .select(`
          id,
          cliente_id,
          data_previsao,
          modelo,
          cliente:clientes(id, nome, telefone, avaliou),
          instrumento:instrumentos(nome),
          marca:marcas(nome)
        `)
        .eq('user_id', user.id)
        .eq('status', 'concluido')
        .eq('solicita_avaliacao', false)
        .lt('data_previsao', cutoffISO)
        .order('data_previsao', { ascending: true });

      if (ordensError) {
        console.error('Erro ao buscar ordens:', ordensError);
        throw ordensError;
      }

      if (!ordens || ordens.length === 0) {
        console.log('✅ Nenhuma ordem pendente de avaliação');
        return [];
      }

      console.log(`📋 Encontradas ${ordens.length} ordens concluídas. Filtrando clientes que não avaliaram...`);

      // Filtrar apenas clientes que ainda não avaliaram (avaliou = false ou null)
      const pendingOrders: PendingEvaluationOrder[] = [];

      for (const ordem of ordens) {
        const cliente = ordem.cliente as any;
        
        // Verificar se cliente existe, tem telefone e não avaliou ainda
        if (!cliente || !cliente.telefone) {
          console.log(`⚠️ Ordem ${ordem.id}: cliente sem telefone, pulando...`);
          continue;
        }

        if (cliente.avaliou === true) {
          console.log(`⚠️ Ordem ${ordem.id}: cliente ${cliente.nome} já avaliou, pulando...`);
          continue;
        }

        // Calcular dias desde conclusão
        const dataConclusao = new Date(ordem.data_previsao);
        const hoje = new Date();
        const diffTime = Math.abs(hoje.getTime() - dataConclusao.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        pendingOrders.push({
          ordem_id: ordem.id,
          cliente_id: cliente.id,
          cliente_nome: cliente.nome,
          cliente_telefone: cliente.telefone,
          instrumento_nome: (ordem.instrumento as any)?.nome || 'Instrumento',
          marca_nome: (ordem.marca as any)?.nome || '',
          modelo: ordem.modelo || '',
          data_conclusao: ordem.data_previsao,
          dias_desde_conclusao: diffDays
        });
      }

      console.log(`✅ ${pendingOrders.length} ordem(ns) elegíveis para solicitação de avaliação`);
      return pendingOrders;

    } catch (error) {
      console.error('❌ Erro ao buscar ordens pendentes de avaliação:', error);
      throw error;
    }
  }

  /**
   * Envia solicitação de avaliação para um cliente
   * Lógica N8N:
   * 1. Envia mensagem WhatsApp via Evolution API
   * 2. Atualiza solicita_avaliacao = true na ordem
   * 3. Atualiza avaliou = true no cliente
   */
  static async sendEvaluationRequest(order: PendingEvaluationOrder): Promise<boolean> {
    try {
      const settings = await this.getSettings();

      // Montar mensagem (igual ao N8N)
      const message = this.buildEvaluationMessage(order, settings);

      console.log(`📤 Enviando solicitação de avaliação para ${order.cliente_nome}...`);

      // Enviar via WhatsApp (Evolution API)
      const success = await WhatsAppService.sendMessage(order.cliente_telefone, message);

      if (!success) {
        console.error(`❌ Falha ao enviar WhatsApp para ${order.cliente_nome}`);
        return false;
      }

      console.log(`✅ Mensagem enviada para ${order.cliente_nome}`);

      // Atualizar solicita_avaliacao = true na ordem
      const { error: ordemError } = await supabase
        .from('ordens_servico')
        .update({ solicita_avaliacao: true })
        .eq('id', order.ordem_id);

      if (ordemError) {
        console.error('Erro ao atualizar ordem:', ordemError);
        // Não falhar se a mensagem foi enviada
      }

      // Atualizar avaliou = true no cliente
      const { error: clienteError } = await supabase
        .from('clientes')
        .update({ avaliou: true })
        .eq('id', order.cliente_id);

      if (clienteError) {
        console.error('Erro ao atualizar cliente:', clienteError);
        // Não falhar se a mensagem foi enviada
      }

      console.log(`✅ Avaliação solicitada e registrada para ${order.cliente_nome}`);
      return true;

    } catch (error) {
      console.error(`❌ Erro ao enviar solicitação de avaliação para ${order.cliente_nome}:`, error);
      throw error;
    }
  }

  /**
   * Monta a mensagem de solicitação de avaliação
   * Template igual ao do N8N
   */
  private static buildEvaluationMessage(order: PendingEvaluationOrder, settings: EvaluationSettings): string {
    return `E ai ${order.cliente_nome}! Beleza? 😊

Espero que esteja feliz com o reparo do seu instrumento!

Poderia nos ajudar avaliando nosso trabalho no Google? 
Sua avaliação ajuda outros músicos a me conhecerem!
👍 Link para avaliar: ${settings.google_review_link}

Muito obrigado pela confiança! 
Forte abraço 🎸`;
  }

  /**
   * Processa todas as avaliações pendentes automaticamente
   * Esta é a função principal chamada pelo agendador
   */
  static async processAutomaticEvaluations(): Promise<{ sent: number; errors: number; skipped: number }> {
    const result = { sent: 0, errors: 0, skipped: 0 };

    try {
      const settings = await this.getSettings();

      if (!settings.enabled) {
        console.log('⏸️ Sistema de avaliações automáticas está desabilitado');
        return result;
      }

      // Verificar se é a hora configurada (com tolerância de 1 hora)
      const now = new Date();
      const currentHour = now.getHours();

      if (Math.abs(currentHour - settings.trigger_hour) > 1) {
        console.log(`⏰ Fora do horário de envio (configurado: ${settings.trigger_hour}h, atual: ${currentHour}h)`);
        return result;
      }

      console.log('🚀 Iniciando processamento automático de avaliações...');

      // Buscar ordens pendentes
      const pendingOrders = await this.getPendingEvaluationOrders();

      if (pendingOrders.length === 0) {
        console.log('✅ Nenhuma avaliação pendente para enviar');
        return result;
      }

      console.log(`📋 ${pendingOrders.length} avaliação(ões) para processar`);

      // Processar cada ordem com intervalo de 3 segundos entre envios
      for (let i = 0; i < pendingOrders.length; i++) {
        const order = pendingOrders[i];

        try {
          // Aguardar 3 segundos entre envios (evitar rate limit)
          if (i > 0) {
            console.log('⏳ Aguardando 3 segundos antes do próximo envio...');
            await this.delay(3000);
          }

          const success = await this.sendEvaluationRequest(order);

          if (success) {
            result.sent++;
            console.log(`✅ [${i + 1}/${pendingOrders.length}] Enviado para ${order.cliente_nome}`);
          } else {
            result.errors++;
            console.log(`❌ [${i + 1}/${pendingOrders.length}] Falha para ${order.cliente_nome}`);
          }

        } catch (error) {
          result.errors++;
          console.error(`❌ [${i + 1}/${pendingOrders.length}] Erro para ${order.cliente_nome}:`, error);
        }
      }

      console.log(`🎉 Processamento concluído: ${result.sent} enviados, ${result.errors} erros`);
      return result;

    } catch (error) {
      console.error('❌ Erro no processamento automático de avaliações:', error);
      throw error;
    }
  }

  /**
   * Envia todas as avaliações pendentes manualmente (sem verificar horário)
   */
  static async sendAllPendingEvaluations(): Promise<{ sent: number; errors: number }> {
    const result = { sent: 0, errors: 0 };

    try {
      console.log('🚀 Enviando todas as avaliações pendentes...');

      const pendingOrders = await this.getPendingEvaluationOrders();

      if (pendingOrders.length === 0) {
        console.log('✅ Nenhuma avaliação pendente para enviar');
        return result;
      }

      console.log(`📋 ${pendingOrders.length} avaliação(ões) para enviar`);

      for (let i = 0; i < pendingOrders.length; i++) {
        const order = pendingOrders[i];

        try {
          // Aguardar 2 segundos entre envios
          if (i > 0) {
            await this.delay(2000);
          }

          const success = await this.sendEvaluationRequest(order);

          if (success) {
            result.sent++;
          } else {
            result.errors++;
          }

        } catch (error) {
          result.errors++;
          console.error(`Erro ao enviar para ${order.cliente_nome}:`, error);
        }
      }

      console.log(`🎉 Envio concluído: ${result.sent} enviados, ${result.errors} erros`);
      return result;

    } catch (error) {
      console.error('❌ Erro ao enviar avaliações pendentes:', error);
      throw error;
    }
  }

  /**
   * Busca configurações de avaliação
   */
  static async getSettings(): Promise<EvaluationSettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return this.defaultSettings;

      const { data, error } = await supabase
        .from('configuracoes_empresa')
        .select('google_review_link, instagram_handle')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        return this.defaultSettings;
      }

      return {
        ...this.defaultSettings,
        google_review_link: data.google_review_link || this.defaultSettings.google_review_link,
        instagram_handle: data.instagram_handle || this.defaultSettings.instagram_handle
      };

    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Salva configurações de avaliação
   */
  static async saveSettings(settings: Partial<EvaluationSettings>): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('configuracoes_empresa')
        .upsert({
          user_id: user.id,
          google_review_link: settings.google_review_link,
          instagram_handle: settings.instagram_handle,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      throw error;
    }
  }

  /**
   * Resetar flag de avaliação de um cliente (para permitir nova solicitação)
   */
  static async resetClientEvaluationFlag(clienteId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ avaliou: false })
        .eq('id', clienteId);

      if (error) throw error;

      console.log(`✅ Flag de avaliação resetada para cliente ${clienteId}`);

    } catch (error) {
      console.error('Erro ao resetar flag de avaliação:', error);
      throw error;
    }
  }

  /**
   * Busca histórico de avaliações enviadas
   */
  static async getEvaluationHistory(limit: number = 50): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Buscar ordens onde solicita_avaliacao = true (avaliações já enviadas)
      const { data, error } = await supabase
        .from('ordens_servico')
        .select(`
          id,
          numero,
          data_previsao,
          modelo,
          solicita_avaliacao,
          cliente:clientes(id, nome, telefone, avaliou),
          instrumento:instrumentos(nome),
          marca:marcas(nome)
        `)
        .eq('user_id', user.id)
        .eq('status', 'concluido')
        .eq('solicita_avaliacao', true)
        .order('data_previsao', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('Erro ao buscar histórico de avaliações:', error);
      return [];
    }
  }

  /**
   * Busca estatísticas de avaliação
   */
  static async getStats(): Promise<{
    pendentes: number;
    enviados: number;
    total_clientes: number;
    clientes_avaliaram: number;
  }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { pendentes: 0, enviados: 0, total_clientes: 0, clientes_avaliaram: 0 };

      // Contar pendentes
      const pendingOrders = await this.getPendingEvaluationOrders();
      
      // Contar enviados
      const { count: enviados } = await supabase
        .from('ordens_servico')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'concluido')
        .eq('solicita_avaliacao', true);

      // Contar total de clientes
      const { count: total_clientes } = await supabase
        .from('clientes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Contar clientes que avaliaram
      const { count: clientes_avaliaram } = await supabase
        .from('clientes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('avaliou', true);

      return {
        pendentes: pendingOrders.length,
        enviados: enviados || 0,
        total_clientes: total_clientes || 0,
        clientes_avaliaram: clientes_avaliaram || 0
      };

    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return { pendentes: 0, enviados: 0, total_clientes: 0, clientes_avaliaram: 0 };
    }
  }

  /**
   * Utility: delay
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
