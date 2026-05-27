import React from 'react';
import { motion } from 'framer-motion';
import { Users, PenTool as Tool, CheckCircle, DollarSign, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { CustomCalendar } from '../components/CustomCalendar';
import { ModernCalendar } from '../components/ModernCalendar';

export function Dashboard() {
  const navigate = useNavigate();
  const [showCalendar, setShowCalendar] = React.useState(true);
  const [calendarType, setCalendarType] = React.useState<'custom' | 'modern'>('modern');
  const [loading, setLoading] = useState(true);
  const [showRevenue, setShowRevenue] = useState(false);
  const [revenue, setRevenue] = useState(0);
  const [stats, setStats] = useState({
    totalClientes: 0,
    ordensAbertas: 0,
    ordensConcluidas: 0
  });
  const [ordensAgendadas, setOrdensAgendadas] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRevenue();
    fetchOrdensAgendadas();
  }, []);

  async function fetchOrdensAgendadas() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) {
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('ordens_servico')
        .select(`
          *,
          cliente:clientes(*),
          instrumento:instrumentos(*),
          marca:marcas(*)
        `)
        .eq('user_id', user.id)
        .in('status', ['pendente', 'em_andamento', 'atraso']); // Incluir ordens em andamento e atraso

      if (error) throw error;

      setOrdensAgendadas(data || []);
    } catch (error: any) {
      if (error?.message && !error.message.includes('Failed to fetch')) {
        console.error('Erro ao buscar ordens agendadas:', error);
        toast.error('Erro ao carregar agenda');
      }
    }
  }

  async function fetchStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) {
        navigate('/login');
        return;
      }

      // Buscar total de clientes
      const { count: clientesCount } = await supabase
        .from('clientes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Buscar ordens abertas
      const { count: ordensAbertasCount } = await supabase
        .from('ordens_servico')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pendente', 'em_andamento']);

      // Buscar ordens concluídas
      const { count: ordensConcluidasCount } = await supabase
        .from('ordens_servico')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'concluido');

      setStats({
        totalClientes: clientesCount || 0,
        ordensAbertas: ordensAbertasCount || 0,
        ordensConcluidas: ordensConcluidasCount || 0
      });
    } catch (error: any) {
      if (error?.message && !error.message.includes('Failed to fetch')) {
        console.error('Erro ao buscar estatísticas:', error);
        toast.error('Erro ao carregar estatísticas');
      }
    }
  }

  async function fetchRevenue() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) {
        navigate('/login');
        return;
      }

      const { data } = await supabase
        .from('transacoes_financeiras')
        .select('valor')
        .eq('tipo', 'receita')
        .eq('user_id', user.id);

      const total = data?.reduce((acc, order) => 
        acc + Number(order.valor || 0), 0) || 0;
      setRevenue(total);
    } catch (error: any) {
      if (error?.message && !error.message.includes('Failed to fetch')) {
        console.error('Erro ao buscar faturamento:', error);
        toast.error('Erro ao carregar faturamento');
      }
    } finally {
      setLoading(false);
    }
  }

  const handleEventDrop = async (dropInfo: any) => {
    try {
      const { event } = dropInfo;
      const newDate = event.start;

      const { error } = await supabase
        .from('ordens_servico')
        .update({ data_previsao: newDate.toISOString() })
        .eq('id', event.id);

      if (error) {
        toast.error('Erro ao atualizar a data de entrega');
        dropInfo.revert();
        throw error;
      }

      toast.success('Data de entrega atualizada com sucesso');
      await fetchOrdensAgendadas(); // Recarrega as ordens para atualizar a view
    } catch (error) {
      console.error('Erro ao atualizar data:', error);
      dropInfo.revert();
    }
  };

  return (
      <main className="responsive-page overflow-x-hidden">
        {/* Cards de Estatísticas com design aprimorado */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6 mb-6 sm:mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass dark:glass-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-glass card-hover group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Clientes</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mt-1 break-words">
                  {loading ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      {stats.totalClientes}
                    </motion.span>
                  )}
                </p>
              </div>
              <motion.div 
                className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-neon transition-all"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                <Users className="w-7 h-7 text-purple-600 dark:text-purple-400" />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass dark:glass-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-glass card-hover group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ordens Abertas</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mt-1 break-words">
                  {loading ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                    >
                      {stats.ordensAbertas}
                    </motion.span>
                  )}
                </p>
              </div>
              <motion.div 
                className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-neon transition-all"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                <Tool className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass dark:glass-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-glass card-hover group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Concluídas</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mt-1 break-words">
                  {loading ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    >
                      {stats.ordensConcluidas}
                    </motion.span>
                  )}
                </p>
              </div>
              <motion.div 
                className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/40 dark:to-green-800/40 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-neon transition-all"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass dark:glass-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-glass card-hover group cursor-pointer"
            onClick={() => setShowRevenue(!showRevenue)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Faturamento</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mt-1 break-words">
                  {loading ? (
                    <span className="animate-pulse">...</span>
                  ) : showRevenue ? (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
                    >
                      {formatCurrency(revenue)}
                    </motion.span>
                  ) : (
                    <span className="text-2xl">R$ ••••</span>
                  )}
                </p>
              </div>
              <motion.button
                className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900/40 dark:to-yellow-800/40 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg hover:shadow-neon transition-all"
                whileHover={{ rotate: 360, scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.5 }}
              >
                <DollarSign className="w-7 h-7 text-yellow-600 dark:text-yellow-400" />
              </motion.button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {showRevenue ? 'Clique para ocultar' : 'Clique para visualizar'}
            </p>
          </motion.div>
        </div>

        {/* Calendário Moderno */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <div className="glass dark:glass-dark rounded-xl sm:rounded-3xl p-4 sm:p-6 shadow-glass">
            <div className="flex flex-col items-stretch justify-between gap-4 mb-6 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-md">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Agenda de Ordens</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {ordensAgendadas.length} ordem(ns) agendada(s)
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Toggle de tipo de calendário */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <button
                    onClick={() => setCalendarType('custom')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      calendarType === 'custom'
                        ? 'gradient-primary text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Grade
                  </button>
                  <button
                    onClick={() => setCalendarType('modern')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      calendarType === 'modern'
                        ? 'gradient-primary text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Lista
                  </button>
                </div>

                <motion.button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="w-full sm:w-auto text-sm gradient-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {showCalendar ? 'Ocultar' : 'Mostrar'}
                </motion.button>
              </div>
            </div>
            
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                {calendarType === 'custom' ? (
                  <CustomCalendar
                    orders={ordensAgendadas}
                    onEventClick={(ordem) => {
                      alerts.orderDetails(ordem, () => {
                        fetchOrdensAgendadas();
                      });
                    }}
                    onUpdate={() => {
                      fetchOrdensAgendadas();
                    }}
                    loading={loading}
                  />
                ) : (
                  <ModernCalendar
                    orders={ordensAgendadas}
                    onEventClick={(ordem) => {
                      alerts.orderDetails(ordem, () => {
                        fetchOrdensAgendadas();
                      });
                    }}
                    onUpdate={() => {
                      fetchOrdensAgendadas();
                    }}
                    loading={loading}
                  />
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </main>
  );
}
