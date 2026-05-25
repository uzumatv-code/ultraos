import { supabase } from '../lib/supabase';
import { WhatsAppService } from './whatsapp-service';

export interface PendingEvaluationOrder {
  ordem_id: string;
  ordem_numero?: number;
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
  daily_limit: number;
  min_interval_seconds: number;
  google_review_link: string;
  instagram_handle: string;
}

export interface EvaluationLog {
  id: string;
  ordem_servico_id: string;
  cliente_id: string;
  telefone?: string;
  status: 'pendente' | 'processando' | 'enviado' | 'erro' | 'respondido' | 'cancelado';
  mensagem_erro?: string;
  data_envio?: string;
  created_at: string;
}

const FINAL_STATUSES = ['enviado', 'respondido', 'cancelado', 'processando'];

export class EvaluationReminderService {
  private static defaultSettings: EvaluationSettings = {
    enabled: true,
    days_after_completion: 7,
    trigger_hour: 11,
    daily_limit: 20,
    min_interval_seconds: 20,
    google_review_link: 'https://g.page/r/Cd8CHsL7KDxCEBM/review',
    instagram_handle: '@luthieriabrasilia'
  };

  static async getPendingEvaluationOrders(): Promise<PendingEvaluationOrder[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const settings = await this.getSettings();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.days_after_completion);
    cutoffDate.setHours(23, 59, 59, 999);

    const { data: ordens, error: ordensError } = await supabase
      .from('ordens_servico')
      .select(`
        id,
        numero,
        cliente_id,
        data_previsao,
        data_entrega,
        modelo,
        solicita_avaliacao,
        cliente:clientes(id, nome, telefone, avaliou),
        instrumento:instrumentos(nome),
        marca:marcas(nome)
      `)
      .eq('user_id', user.id)
      .eq('status', 'concluido')
      .order('data_entrega', { ascending: true });

    if (ordensError) throw ordensError;
    if (!ordens?.length) return [];

    const orderIds = ordens.map((ordem: any) => ordem.id);
    const { data: reminders, error: remindersError } = await supabase
      .from('avaliacoes_lembretes')
      .select('ordem_servico_id, status')
      .in('ordem_servico_id', orderIds);

    if (remindersError) throw remindersError;

    const reminderByOrder = new Map<string, string>();
    (reminders || []).forEach((reminder: any) => {
      reminderByOrder.set(reminder.ordem_servico_id, reminder.status);
    });

    const pendingOrders: PendingEvaluationOrder[] = [];

    for (const ordem of ordens as any[]) {
      const cliente = ordem.cliente as any;
      const completionDateRaw = ordem.data_entrega || ordem.data_previsao;
      const reminderStatus = reminderByOrder.get(ordem.id);

      if (!completionDateRaw) continue;
      if (!cliente?.telefone) continue;
      if (cliente.avaliou === true) continue;
      if (ordem.solicita_avaliacao === true && !reminderStatus) continue;
      if (reminderStatus && FINAL_STATUSES.includes(reminderStatus)) continue;

      const completionDate = new Date(completionDateRaw);
      if (Number.isNaN(completionDate.getTime())) continue;
      if (completionDate > cutoffDate) continue;

      const diffTime = new Date().getTime() - completionDate.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      pendingOrders.push({
        ordem_id: ordem.id,
        ordem_numero: ordem.numero,
        cliente_id: cliente.id,
        cliente_nome: cliente.nome,
        cliente_telefone: cliente.telefone,
        instrumento_nome: (ordem.instrumento as any)?.nome || 'Instrumento',
        marca_nome: (ordem.marca as any)?.nome || '',
        modelo: ordem.modelo || '',
        data_conclusao: completionDateRaw,
        dias_desde_conclusao: diffDays
      });
    }

    return pendingOrders;
  }

  static async sendEvaluationForOrder(ordem: any): Promise<boolean> {
    if (!ordem?.cliente) throw new Error('Cliente não encontrado');
    if (!ordem.cliente.telefone) throw new Error('Cliente não possui telefone cadastrado');

    const completionDate = ordem.data_entrega || ordem.data_previsao || new Date().toISOString();
    const dataConclusao = new Date(completionDate);
    const diffTime = new Date().getTime() - dataConclusao.getTime();

    return this.sendEvaluationRequest({
      ordem_id: ordem.id,
      ordem_numero: ordem.numero,
      cliente_id: ordem.cliente.id || ordem.cliente_id,
      cliente_nome: ordem.cliente.nome,
      cliente_telefone: ordem.cliente.telefone,
      instrumento_nome: ordem.instrumento?.nome || 'Instrumento',
      marca_nome: ordem.marca?.nome || '',
      modelo: ordem.modelo || '',
      data_conclusao: completionDate,
      dias_desde_conclusao: Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
    });
  }

  static async sendEvaluationRequest(order: PendingEvaluationOrder): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const phoneValidation = this.validatePhone(order.cliente_telefone);
    if (!phoneValidation.valid) {
      await this.saveLog(order, 'erro', {
        mensagem_erro: phoneValidation.message,
        telefone: order.cliente_telefone
      });
      return false;
    }

    const existing = await this.getExistingReminder(order.ordem_id);
    if (existing && FINAL_STATUSES.includes(existing.status)) {
      return false;
    }

    const settings = await this.getSettings();
    const message = this.buildEvaluationMessage(order, settings);

    await this.saveLog(order, 'processando', {
      telefone: order.cliente_telefone,
      mensagem: message,
      tentativas: Number(existing?.tentativas || 0) + 1
    });

    try {
      const success = await WhatsAppService.sendMessage(order.cliente_telefone, message);
      if (!success) throw new Error('Provider retornou falha no envio');

      await this.saveLog(order, 'enviado', {
        telefone: order.cliente_telefone,
        mensagem: message,
        mensagem_erro: null,
        data_envio: new Date().toISOString()
      });

      const { error: ordemError } = await supabase
        .from('ordens_servico')
        .update({ solicita_avaliacao: true })
        .eq('id', order.ordem_id);

      if (ordemError) throw ordemError;

      return true;
    } catch (error: any) {
      await this.saveLog(order, 'erro', {
        telefone: order.cliente_telefone,
        mensagem,
        mensagem_erro: error?.message || String(error)
      });
      return false;
    }
  }

  private static buildEvaluationMessage(order: PendingEvaluationOrder, settings: EvaluationSettings): string {
    return `E ai ${order.cliente_nome}! Beleza? 😊

Espero que esteja feliz com o reparo do seu instrumento!

Poderia nos ajudar avaliando nosso trabalho no Google?
Sua avaliação ajuda outros músicos a me conhecerem!
👍 Link para avaliar: ${settings.google_review_link}

Muito obrigado pela confiança!
Forte abraço 🎸`;
  }

  static async processAutomaticEvaluations(): Promise<{ sent: number; errors: number; skipped: number }> {
    const result = { sent: 0, errors: 0, skipped: 0 };
    const settings = await this.getSettings();

    if (!settings.enabled) return result;

    const currentHour = new Date().getHours();
    if (Math.abs(currentHour - settings.trigger_hour) > 1) return result;

    const pendingOrders = (await this.getPendingEvaluationOrders()).slice(0, settings.daily_limit);
    for (let i = 0; i < pendingOrders.length; i++) {
      if (i > 0) await this.delay(settings.min_interval_seconds * 1000);
      const success = await this.sendEvaluationRequest(pendingOrders[i]);
      if (success) result.sent++;
      else result.errors++;
    }

    return result;
  }

  static async sendAllPendingEvaluations(): Promise<{ sent: number; errors: number }> {
    const result = { sent: 0, errors: 0 };
    const settings = await this.getSettings();
    const pendingOrders = (await this.getPendingEvaluationOrders()).slice(0, settings.daily_limit);

    for (let i = 0; i < pendingOrders.length; i++) {
      if (i > 0) await this.delay(settings.min_interval_seconds * 1000);
      const success = await this.sendEvaluationRequest(pendingOrders[i]);
      if (success) result.sent++;
      else result.errors++;
    }

    return result;
  }

  static async getSettings(): Promise<EvaluationSettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return this.defaultSettings;

      const { data, error } = await supabase
        .from('configuracoes_empresa')
        .select('google_review_link, instagram_handle, avaliacoes_enabled, avaliacoes_days_after_completion, avaliacoes_trigger_hour, avaliacoes_daily_limit, avaliacoes_min_interval_seconds')
        .eq('user_id', user.id)
        .single();

      if (error || !data) return this.defaultSettings;

      return {
        ...this.defaultSettings,
        enabled: data.avaliacoes_enabled ?? this.defaultSettings.enabled,
        days_after_completion: Number(data.avaliacoes_days_after_completion ?? this.defaultSettings.days_after_completion),
        trigger_hour: Number(data.avaliacoes_trigger_hour ?? this.defaultSettings.trigger_hour),
        daily_limit: Number(data.avaliacoes_daily_limit ?? this.defaultSettings.daily_limit),
        min_interval_seconds: Number(data.avaliacoes_min_interval_seconds ?? this.defaultSettings.min_interval_seconds),
        google_review_link: data.google_review_link || this.defaultSettings.google_review_link,
        instagram_handle: data.instagram_handle || this.defaultSettings.instagram_handle
      };
    } catch {
      return this.defaultSettings;
    }
  }

  static async saveSettings(settings: Partial<EvaluationSettings>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const payload: Record<string, any> = {
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    if (settings.google_review_link !== undefined) payload.google_review_link = settings.google_review_link;
    if (settings.instagram_handle !== undefined) payload.instagram_handle = settings.instagram_handle;
    if (settings.enabled !== undefined) payload.avaliacoes_enabled = settings.enabled;
    if (settings.days_after_completion !== undefined) payload.avaliacoes_days_after_completion = settings.days_after_completion;
    if (settings.trigger_hour !== undefined) payload.avaliacoes_trigger_hour = settings.trigger_hour;
    if (settings.daily_limit !== undefined) payload.avaliacoes_daily_limit = settings.daily_limit;
    if (settings.min_interval_seconds !== undefined) payload.avaliacoes_min_interval_seconds = settings.min_interval_seconds;

    const { error } = await supabase
      .from('configuracoes_empresa')
      .upsert(payload, {
        onConflict: 'user_id'
      });

    if (error) throw error;
  }

  static async resetClientEvaluationFlag(clienteId: string): Promise<void> {
    const { error } = await supabase
      .from('clientes')
      .update({ avaliou: false })
      .eq('id', clienteId);

    if (error) throw error;
  }

  static async getEvaluationHistory(limit: number = 50): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('avaliacoes_lembretes')
      .select(`
        *,
        cliente:clientes(id, nome, telefone, avaliou),
        ordem_servico:ordens_servico(id, numero, data_entrega, data_previsao, modelo)
      `)
      .in('status', ['enviado', 'erro', 'respondido'])
      .order('data_envio', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async getStats(): Promise<{
    pendentes: number;
    enviados: number;
    total_clientes: number;
    clientes_avaliaram: number;
    erros: number;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { pendentes: 0, enviados: 0, total_clientes: 0, clientes_avaliaram: 0, erros: 0 };

    const pendingOrders = await this.getPendingEvaluationOrders();

    const { count: enviados } = await supabase
      .from('avaliacoes_lembretes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['enviado', 'respondido']);

    const { count: erros } = await supabase
      .from('avaliacoes_lembretes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'erro');

    const { count: total_clientes } = await supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: clientes_avaliaram } = await supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('avaliou', true);

    return {
      pendentes: pendingOrders.length,
      enviados: enviados || 0,
      total_clientes: total_clientes || 0,
      clientes_avaliaram: clientes_avaliaram || 0,
      erros: erros || 0
    };
  }

  private static async getExistingReminder(ordemId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('avaliacoes_lembretes')
      .select('*')
      .eq('ordem_servico_id', ordemId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  private static async saveLog(
    order: PendingEvaluationOrder,
    status: EvaluationLog['status'],
    extra: Record<string, any> = {}
  ): Promise<void> {
    const { error } = await supabase
      .from('avaliacoes_lembretes')
      .upsert({
        ordem_servico_id: order.ordem_id,
        cliente_id: order.cliente_id,
        status,
        updated_at: new Date().toISOString(),
        ...extra
      }, {
        onConflict: 'user_id,ordem_servico_id'
      });

    if (error) throw error;
  }

  private static validatePhone(phone: string): { valid: boolean; message?: string } {
    const cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 13) {
      return { valid: false, message: 'Telefone inválido para envio de WhatsApp' };
    }
    return { valid: true };
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
