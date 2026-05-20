import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, 
  Send, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  Users, 
  MessageSquare,
  Play,
  Pause,
  Settings,
  ExternalLink,
  Phone,
  Calendar,
  AlertCircle,
  Zap,
  TrendingUp
} from 'lucide-react';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useReminders } from '../contexts/ReminderContext';
import { EvaluationReminderService, PendingEvaluationOrder, EvaluationSettings } from '../utils/evaluation-reminder-service';
import { toast } from '../components/ToastCustom';

interface Stats {
  pendentes: number;
  enviados: number;
  total_clientes: number;
  clientes_avaliaram: number;
}

export function AvaliacoesLembretes() {
  const {
    isEnabled,
    isProcessing,
    lastProcessed,
    pendingOrders,
    enableAutomatic,
    disableAutomatic,
    processNow,
    refreshPending,
    sendSingle
  } = useReminders();

  const [stats, setStats] = useState<Stats>({
    pendentes: 0,
    enviados: 0,
    total_clientes: 0,
    clientes_avaliaram: 0
  });
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<EvaluationSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, settingsData, historyData] = await Promise.all([
        EvaluationReminderService.getStats(),
        EvaluationReminderService.getSettings(),
        EvaluationReminderService.getEvaluationHistory()
      ]);
      
      setStats(statsData);
      setSettings(settingsData);
      setHistory(historyData);
      await refreshPending();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de avaliações');
    } finally {
      setLoading(false);
    }
  }, [refreshPending]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Enviar avaliação individual
  const handleSendSingle = async (order: PendingEvaluationOrder) => {
    setSendingId(order.ordem_id);
    try {
      const success = await sendSingle(order);
      if (success) {
        toast.success(`Avaliação enviada para ${order.cliente_nome}`);
        // Atualizar stats
        setStats((prev: Stats) => ({
          ...prev,
          pendentes: Math.max(0, prev.pendentes - 1),
          enviados: prev.enviados + 1,
          clientes_avaliaram: prev.clientes_avaliaram + 1
        }));
      } else {
        toast.error(`Erro ao enviar para ${order.cliente_nome}`);
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setSendingId(null);
    }
  };

  // Processar todos
  const handleProcessAll = async () => {
    try {
      const result = await processNow();
      toast.success(`${result.sent} avaliação(ões) enviada(s)${result.errors > 0 ? `, ${result.errors} erro(s)` : ''}`);
      await loadData();
    } catch (error: any) {
      toast.error(`Erro ao processar: ${error.message}`);
    }
  };

  // Toggle automático
  const handleToggleAutomatic = () => {
    if (isEnabled) {
      disableAutomatic();
      toast.info('Sistema automático desabilitado');
    } else {
      enableAutomatic();
      toast.success('Sistema automático habilitado - Envios às 11h');
    }
  };

  // Formatar data
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Formatar telefone
  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  return (
    <PageContainer title="Avaliações & Lembretes" icon={Star}>
      {/* Header com Status */}
      <div className="mb-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl border ${
            isEnabled 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${
                isEnabled 
                  ? 'bg-green-100 dark:bg-green-800/30 text-green-600 dark:text-green-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {isEnabled ? <Zap className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Sistema Automático de Avaliações
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isEnabled 
                    ? 'Ativo - Envia solicitações automaticamente às 11h'
                    : 'Desativado - Apenas envio manual'
                  }
                </p>
                {lastProcessed && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Último processamento: {lastProcessed.toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={isEnabled ? "secondary" : "primary"}
                size="sm"
                onClick={handleToggleAutomatic}
              >
                {isEnabled ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {isEnabled ? 'Desativar' : 'Ativar'}
              </Button>
              
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Configurações expandidas */}
          <AnimatePresence>
            {showSettings && settings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Link do Google Review
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={settings.google_review_link}
                        readOnly
                        className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                      <a
                        href={settings.google_review_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Instagram
                    </label>
                    <input
                      type="text"
                      value={settings.instagram_handle}
                      readOnly
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Configurações podem ser alteradas em Configurações &gt; Empresa
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats.pendentes}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pendentes</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats.enviados}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Enviados</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats.total_clientes}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Clientes</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : `${stats.total_clientes > 0 ? Math.round((stats.clientes_avaliaram / stats.total_clientes) * 100) : 0}%`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Taxa</p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          variant="primary"
          onClick={handleProcessAll}
          disabled={isProcessing || pendingOrders.length === 0}
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Enviar Todos ({pendingOrders.length})
            </>
          )}
        </Button>

        <Button
          variant="secondary"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'pending'
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Clock className="w-4 h-4 inline mr-2" />
          Pendentes ({pendingOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 inline mr-2" />
          Histórico ({history.length})
        </button>
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        {activeTab === 'pending' ? (
          /* Lista de Pendentes */
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 mx-auto text-gray-400 animate-spin mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
              </div>
            ) : pendingOrders.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-3" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                  Tudo em dia!
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Não há avaliações pendentes para enviar
                </p>
              </div>
            ) : (
              pendingOrders.map((order, index) => (
                <motion.div
                  key={order.ordem_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-white truncate">
                          {order.cliente_nome}
                        </h4>
                        <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">
                          {order.dias_desde_conclusao} dias
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5" />
                          {order.instrumento_nome} {order.marca_nome} {order.modelo}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {formatPhone(order.cliente_telefone)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(order.data_conclusao)}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSendSingle(order)}
                      disabled={sendingId === order.ordem_id}
                    >
                      {sendingId === order.ordem_id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1" />
                          Enviar
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        ) : (
          /* Histórico */
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                  Nenhum histórico
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  As avaliações enviadas aparecerão aqui
                </p>
              </div>
            ) : (
              history.map((item, index) => {
                const cliente = item.cliente as any;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900 dark:text-white truncate">
                            {cliente?.nome || 'Cliente'}
                          </h4>
                          <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Enviado
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5" />
                            {(item.instrumento as any)?.nome} {(item.marca as any)?.nome} {item.modelo}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {cliente?.telefone ? formatPhone(cliente.telefone) : '-'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(item.data_previsao)}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          OS #{item.numero}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}
      </Card>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800"
      >
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Como funciona o sistema automático
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• <strong>Busca ordens concluídas</strong> há mais de 7 dias que ainda não solicitaram avaliação</li>
              <li>• <strong>Verifica clientes</strong> que ainda não receberam solicitação de avaliação</li>
              <li>• <strong>Envia automaticamente</strong> às 11h via WhatsApp (Evolution API)</li>
              <li>• <strong>Marca como enviado</strong> para não enviar duplicado</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </PageContainer>
  );
}
