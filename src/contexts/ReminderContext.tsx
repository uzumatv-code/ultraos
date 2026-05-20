import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { EvaluationReminderService, PendingEvaluationOrder } from '../utils/evaluation-reminder-service';
import { supabase } from '../lib/supabase';

/**
 * ReminderContext - Sistema Automático de Avaliações
 * 
 * Funciona como o Schedule Trigger do N8N:
 * - Verifica a cada hora se é hora de enviar (11h)
 * - Processa automaticamente as avaliações pendentes
 * - Permite controle manual e visualização de estatísticas
 */

interface ReminderContextType {
  // Estado
  isEnabled: boolean;
  isProcessing: boolean;
  lastProcessed: Date | null;
  pendingCount: number;
  sentToday: number;
  
  // Dados
  pendingOrders: PendingEvaluationOrder[];
  
  // Ações
  enableAutomatic: () => void;
  disableAutomatic: () => void;
  processNow: () => Promise<{ sent: number; errors: number }>;
  refreshPending: () => Promise<void>;
  sendSingle: (order: PendingEvaluationOrder) => Promise<boolean>;
}

const ReminderContext = createContext<ReminderContextType | undefined>(undefined);

// Intervalo de verificação: 1 hora (em ms)
const CHECK_INTERVAL = 60 * 60 * 1000;

// Chave para persistir o estado no localStorage
const STORAGE_KEY = 'evaluation_reminder_settings';

export function ReminderProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.isEnabled ?? true;
      }
    } catch {}
    return true;
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastProcessed, setLastProcessed] = useState<Date | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.lastProcessed ? new Date(parsed.lastProcessed) : null;
      }
    } catch {}
    return null;
  });
  
  const [pendingOrders, setPendingOrders] = useState<PendingEvaluationOrder[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [sentToday, setSentToday] = useState<number>(0);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasCheckedToday = useRef<string | null>(null);

  // Salvar estado no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        isEnabled,
        lastProcessed: lastProcessed?.toISOString()
      }));
    } catch {}
  }, [isEnabled, lastProcessed]);

  // Buscar ordens pendentes
  const refreshPending = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const orders = await EvaluationReminderService.getPendingEvaluationOrders();
      setPendingOrders(orders);
      setPendingCount(orders.length);
    } catch (error) {
      console.error('Erro ao buscar ordens pendentes:', error);
    }
  }, []);

  // Buscar estatísticas
  const refreshStats = useCallback(async () => {
    try {
      const stats = await EvaluationReminderService.getStats();
      setPendingCount(stats.pendentes);
      setSentToday(stats.enviados);
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
    }
  }, []);

  // Verificação automática (dispara às 11h como o N8N)
  const checkAndProcess = useCallback(async () => {
    // Verificar se usuário está autenticado
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!isEnabled) {
      console.log('🔕 Sistema automático de avaliações desabilitado');
      return;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split('T')[0];

    // Só processa às 11h e apenas uma vez por dia
    if (currentHour !== 11) {
      console.log(`⏰ Hora atual: ${currentHour}h. Processamento automático configurado para 11h.`);
      return;
    }

    // Verificar se já processou hoje
    if (hasCheckedToday.current === today) {
      console.log('✅ Já processado hoje, aguardando próximo dia...');
      return;
    }

    console.log('🚀 Iniciando processamento automático de avaliações (11h)...');
    
    setIsProcessing(true);
    hasCheckedToday.current = today;

    try {
      const result = await EvaluationReminderService.sendAllPendingEvaluations();
      
      setLastProcessed(new Date());
      setSentToday((prev: number) => prev + result.sent);
      
      console.log(`✅ Processamento automático concluído: ${result.sent} enviados, ${result.errors} erros`);
      
      // Atualizar lista de pendentes
      await refreshPending();
      
    } catch (error) {
      console.error('❌ Erro no processamento automático:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [isEnabled, refreshPending]);

  // Configurar intervalo de verificação
  useEffect(() => {
    if (!isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Verificar imediatamente ao habilitar
    checkAndProcess();

    // Configurar intervalo para verificar a cada hora
    intervalRef.current = setInterval(checkAndProcess, CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isEnabled, checkAndProcess]);

  // Carregar dados iniciais
  useEffect(() => {
    refreshPending();
    refreshStats();
  }, [refreshPending, refreshStats]);

  // Habilitar automático
  const enableAutomatic = useCallback(() => {
    setIsEnabled(true);
    console.log('✅ Sistema automático de avaliações habilitado');
  }, []);

  // Desabilitar automático
  const disableAutomatic = useCallback(() => {
    setIsEnabled(false);
    console.log('🔕 Sistema automático de avaliações desabilitado');
  }, []);

  // Processar agora (manual)
  const processNow = useCallback(async (): Promise<{ sent: number; errors: number }> => {
    setIsProcessing(true);
    
    try {
      console.log('🚀 Processamento manual iniciado...');
      
      const result = await EvaluationReminderService.sendAllPendingEvaluations();
      
      setLastProcessed(new Date());
      setSentToday((prev: number) => prev + result.sent);
      
      // Atualizar lista
      await refreshPending();
      
      console.log(`✅ Processamento manual concluído: ${result.sent} enviados, ${result.errors} erros`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro no processamento manual:', error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [refreshPending]);

  // Enviar único
  const sendSingle = useCallback(async (order: PendingEvaluationOrder): Promise<boolean> => {
    try {
      const success = await EvaluationReminderService.sendEvaluationRequest(order);
      
      if (success) {
        setSentToday((prev: number) => prev + 1);
        // Remover da lista de pendentes
        setPendingOrders((prev: PendingEvaluationOrder[]) => prev.filter((o: PendingEvaluationOrder) => o.ordem_id !== order.ordem_id));
        setPendingCount((prev: number) => Math.max(0, prev - 1));
      }
      
      return success;
    } catch (error) {
      console.error('Erro ao enviar avaliação:', error);
      return false;
    }
  }, []);

  const value: ReminderContextType = {
    isEnabled,
    isProcessing,
    lastProcessed,
    pendingCount,
    sentToday,
    pendingOrders,
    enableAutomatic,
    disableAutomatic,
    processNow,
    refreshPending,
    sendSingle
  };

  return (
    <ReminderContext.Provider value={value}>
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const context = useContext(ReminderContext);
  if (!context) {
    throw new Error('useReminders must be used within a ReminderProvider');
  }
  return context;
}

// Hook para estatísticas em tempo real
export function useReminderStats() {
  const context = useContext(ReminderContext);
  
  if (!context) {
    return {
      pendingEvaluation: 0,
      totalSentToday: 0,
      isLoading: false,
      lastCheck: null
    };
  }

  return {
    pendingEvaluation: context.pendingCount,
    totalSentToday: context.sentToday,
    isLoading: context.isProcessing,
    lastCheck: context.lastProcessed
  };
}
