import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { EvaluationReminderService, PendingEvaluationOrder } from '../utils/evaluation-reminder-service';
import { supabase } from '../lib/supabase';

interface ReminderContextType {
  isEnabled: boolean;
  isProcessing: boolean;
  lastProcessed: Date | null;
  pendingCount: number;
  sentToday: number;
  pendingOrders: PendingEvaluationOrder[];
  enableAutomatic: () => void;
  disableAutomatic: () => void;
  processNow: () => Promise<{ sent: number; errors: number }>;
  refreshPending: () => Promise<void>;
  sendSingle: (order: PendingEvaluationOrder) => Promise<boolean>;
}

const ReminderContext = createContext<ReminderContextType | undefined>(undefined);
const STORAGE_KEY = 'evaluation_reminder_settings';

export function ReminderProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).isEnabled ?? true;
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        isEnabled,
        lastProcessed: lastProcessed?.toISOString()
      }));
    } catch {}
  }, [isEnabled, lastProcessed]);

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

  const refreshStats = useCallback(async () => {
    try {
      const stats = await EvaluationReminderService.getStats();
      setPendingCount(stats.pendentes);
      setSentToday(stats.enviados);
    } catch (error) {
      console.error('Erro ao buscar estatisticas:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    EvaluationReminderService.getSettings()
      .then((settings) => {
        if (mounted) setIsEnabled(settings.enabled);
      })
      .catch((error) => console.error('Erro ao carregar configuracao de avaliacoes:', error));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    refreshPending();
    refreshStats();
  }, [refreshPending, refreshStats]);

  const enableAutomatic = useCallback(() => {
    setIsEnabled(true);
    void EvaluationReminderService.saveSettings({ enabled: true })
      .catch((error) => console.error('Erro ao habilitar avaliacoes automaticas:', error));
  }, []);

  const disableAutomatic = useCallback(() => {
    setIsEnabled(false);
    void EvaluationReminderService.saveSettings({ enabled: false })
      .catch((error) => console.error('Erro ao desabilitar avaliacoes automaticas:', error));
  }, []);

  const processNow = useCallback(async (): Promise<{ sent: number; errors: number }> => {
    setIsProcessing(true);

    try {
      const result = await EvaluationReminderService.sendAllPendingEvaluations();

      setLastProcessed(new Date());
      setSentToday((prev: number) => prev + result.sent);
      await refreshPending();

      return result;
    } catch (error) {
      console.error('Erro no processamento manual:', error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [refreshPending]);

  const sendSingle = useCallback(async (order: PendingEvaluationOrder): Promise<boolean> => {
    try {
      const success = await EvaluationReminderService.sendEvaluationRequest(order);

      if (success) {
        setSentToday((prev: number) => prev + 1);
        setPendingOrders((prev: PendingEvaluationOrder[]) => prev.filter((item) => item.ordem_id !== order.ordem_id));
        setPendingCount((prev: number) => Math.max(0, prev - 1));
      }

      return success;
    } catch (error) {
      console.error('Erro ao enviar avaliacao:', error);
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
