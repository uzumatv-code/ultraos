import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Wrench, DollarSign, X, Play, AlertTriangle, CheckCircle, List } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { OrdemServico } from '../types/database';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { WhatsAppService } from '../utils/whatsapp-service';

interface CustomCalendarProps {
  orders: OrdemServico[];
  onEventClick: (order: OrdemServico) => void;
  loading?: boolean;
  onUpdate?: () => void;
}

export function CustomCalendar({ orders, onEventClick, loading = false, onUpdate }: CustomCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedOrder, setSelectedOrder] = useState<OrdemServico | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showDayOrders, setShowDayOrders] = useState<{date: Date, orders: OrdemServico[]} | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Funções de navegação
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Gerar dias do mês
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Dias do mês anterior
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDays - i),
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i),
      });
    }

    // Dias do próximo mês
    const remainingDays = 42 - days.length; // 6 semanas x 7 dias
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i),
      });
    }

    return days;
  };

  // Pegar ordens para um dia específico
  const getOrdersForDate = (date: Date) => {
    return orders.filter((order) => {
      if (!order.data_previsao) return false;
      const orderDate = new Date(order.data_previsao);
      return (
        orderDate.getDate() === date.getDate() &&
        orderDate.getMonth() === date.getMonth() &&
        orderDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const days = getDaysInMonth();

  const getStatusColor = (status: string) => {
    const colors = {
      pendente: 'from-indigo-500 to-indigo-600',
      em_andamento: 'from-amber-500 to-amber-600',
      cancelado: 'from-red-500 to-red-600',
      concluido: 'from-green-500 to-green-600',
    };
    return colors[status as keyof typeof colors] || colors.cancelado;
  };

  const getStatusBadgeColor = (status: string) => {
    const colors = {
      pendente: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      concluido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    };
    return colors[status as keyof typeof colors] || colors.cancelado;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pendente: 'Pendente',
      em_andamento: 'Em Andamento',
      cancelado: 'Cancelado/Atrasado',
      concluido: 'Concluído',
    };
    return labels[status as keyof typeof labels] || 'Desconhecido';
  };

  // Função para atualizar o status da ordem
  const updateOrderStatus = async (newStatus: string) => {
    if (!selectedOrder) return;

    setUpdatingStatus(true);
    try {
      // Atualizar status no banco de dados
      const { error } = await supabase
        .from('ordens_servico')
        .update({ status: newStatus })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      // Enviar mensagem de WhatsApp correspondente ao status
      try {
        switch (newStatus) {
          case 'em_andamento':
            await WhatsAppService.sendProgressMessage(selectedOrder);
            toast.success('Status alterado para "Em Andamento" e mensagem enviada via WhatsApp! ✅');
            break;
          case 'atraso':
            await WhatsAppService.sendDelayMessage(selectedOrder);
            toast.success('Status alterado para "Em Atraso" e mensagem enviada via WhatsApp! ⏰');
            break;
          case 'concluido':
            await WhatsAppService.sendCompletionMessage(selectedOrder);
            toast.success('Ordem finalizada e cliente notificado via WhatsApp! 🎉');
            break;
          default:
            toast.success(`Status alterado para: ${getStatusLabel(newStatus)}`);
        }
      } catch (whatsappError: any) {
        console.error('Erro ao enviar mensagem WhatsApp:', whatsappError);
        toast.success(`Status alterado, mas houve erro ao enviar WhatsApp: ${whatsappError.message}`);
      }

      setSelectedOrder(null);
      
      // Chamar callback para atualizar a lista
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status da ordem');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Função para extrair e formatar os serviços
  const getServicesDescription = (order: OrdemServico) => {
    if (!order.observacoes) return null;
    
    // Extrair apenas o trecho entre "Serviços:" e "Horário de"
    const obs = order.observacoes;
    
    // Verificar se contém "Serviços:"
    if (!obs.includes('Serviços:')) return null;
    
    // Pegar a partir de "Serviços:"
    let servicosText = obs.substring(obs.indexOf('Serviços:'));
    
    // Remover tudo a partir de "Horário de" (case insensitive)
    const horarioIndex = servicosText.search(/Hor[aá]rio de/i);
    if (horarioIndex !== -1) {
      servicosText = servicosText.substring(0, horarioIndex);
    }
    
    // Limpar espaços em branco extras
    servicosText = servicosText.trim();
    
    return servicosText;
  };

  return (
    <div className="custom-calendar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={previousMonth}
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all shadow-md"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={goToToday}
            className="px-4 py-2.5 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-semibold hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all shadow-md"
          >
            Hoje
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={nextMonth}
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all shadow-md"
          >
            <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-gradient">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>

        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600"></div>
            <span>Pendente</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-amber-500 to-amber-600"></div>
            <span>Em Andamento</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-green-500 to-green-600"></div>
            <span>Concluído</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full"
          />
        </div>
      ) : (
        <>
          {/* Dias da semana */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400 py-3"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grade de dias */}
          <div className="grid grid-cols-7 gap-2">
            {days.map((dayInfo, index) => {
              const dayOrders = getOrdersForDate(dayInfo.date);
              const isTodayDate = isToday(dayInfo.date);

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.01 }}
                  className={`
                    relative min-h-[100px] p-2 rounded-xl border-2 transition-all
                    ${dayInfo.isCurrentMonth
                      ? 'glass dark:glass-dark border-gray-200 dark:border-gray-700'
                      : 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800 opacity-50'
                    }
                    ${isTodayDate ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900' : ''}
                    hover:shadow-glass-lg hover:scale-105 cursor-pointer
                  `}
                >
                  {/* Número do dia */}
                  <div
                    className={`
                      text-sm font-semibold mb-1
                      ${isTodayDate
                        ? 'w-7 h-7 rounded-full gradient-primary text-white flex items-center justify-center'
                        : dayInfo.isCurrentMonth
                        ? 'text-gray-800 dark:text-white'
                        : 'text-gray-400 dark:text-gray-600'
                      }
                    `}
                  >
                    {dayInfo.day}
                  </div>

                  {/* Ordens do dia */}
                  <div className="space-y-1">
                    {dayOrders.slice(0, 2).map((order) => (
                      <motion.div
                        key={order.id}
                        whileHover={{ scale: 1.05, zIndex: 10 }}
                        onClick={() => setSelectedOrder(order)}
                        className={`
                          px-2 py-1 rounded-lg text-xs font-medium text-white truncate
                          bg-gradient-to-r ${getStatusColor(order.status)}
                          shadow-md cursor-pointer
                        `}
                      >
                        {order.cliente?.nome || 'Sem cliente'}
                      </motion.div>
                    ))}
                    {dayOrders.length > 2 && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDayOrders({ date: dayInfo.date, orders: dayOrders });
                        }}
                        className="w-full text-xs text-center text-primary-600 dark:text-primary-400 font-semibold hover:text-primary-700 dark:hover:text-primary-300 transition-colors py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
                      >
                        +{dayOrders.length - 2} mais
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal de detalhes */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass dark:glass-dark rounded-3xl p-8 max-w-lg w-full shadow-glass-lg"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${getStatusBadgeColor(selectedOrder.status).split(' ')[0]} bg-opacity-20`}>
                    <CalendarIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                      Ordem de Serviço
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ID: {selectedOrder.id.substring(0, 8)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Detalhes */}
              <div className="space-y-5">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <User className="w-6 h-6 text-primary-600 dark:text-primary-400 mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cliente</p>
                    <p className="font-bold text-lg text-gray-800 dark:text-white">
                      {selectedOrder.cliente?.nome || 'Não informado'}
                    </p>
                    {selectedOrder.cliente?.telefone && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        📱 {selectedOrder.cliente.telefone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <Wrench className="w-6 h-6 text-primary-600 dark:text-primary-400 mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Instrumento</p>
                    <p className="font-bold text-lg text-gray-800 dark:text-white">
                      {selectedOrder.instrumento?.nome} - {selectedOrder.marca?.nome}
                    </p>
                    {selectedOrder.modelo && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Modelo: {selectedOrder.modelo}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400 mt-1" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Previsão</p>
                      <p className="font-semibold text-gray-800 dark:text-white">
                        {selectedOrder.data_previsao
                          ? new Date(selectedOrder.data_previsao).toLocaleDateString('pt-BR')
                          : 'Não definida'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <DollarSign className="w-5 h-5 text-primary-600 dark:text-primary-400 mt-1" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Valor</p>
                      <p className="font-bold text-lg text-green-600 dark:text-green-400">
                        {formatCurrency(selectedOrder.valor_servicos - (selectedOrder.desconto || 0))}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Status</p>
                  <span className={`inline-flex px-4 py-2 rounded-xl text-sm font-bold ${getStatusBadgeColor(selectedOrder.status)}`}>
                    {getStatusLabel(selectedOrder.status)}
                  </span>
                </div>

                {/* Serviços */}
                {getServicesDescription(selectedOrder) && (
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-start gap-2 mb-2">
                      <List className="w-5 h-5 text-primary-600 dark:text-primary-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                          {getServicesDescription(selectedOrder)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Botões de ação */}
                <div className="grid grid-cols-3 gap-2 mt-6">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => updateOrderStatus('em_andamento')}
                    disabled={updatingStatus || selectedOrder.status === 'em_andamento'}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white font-semibold text-xs shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-5 h-5" />
                    <span>Em Andamento</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => updateOrderStatus('atraso')}
                    disabled={updatingStatus || selectedOrder.status === 'atraso'}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white font-semibold text-xs shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    <span>Contratempo</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => updateOrderStatus('concluido')}
                    disabled={updatingStatus || selectedOrder.status === 'concluido'}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white font-semibold text-xs shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>Finalização</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Ordens do Dia */}
      <AnimatePresence>
        {showDayOrders && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDayOrders(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass dark:glass-dark rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            >
              {/* Header */}
              <div className="gradient-primary p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Ordens do Dia</h2>
                    <p className="text-white/90 text-sm mt-1">
                      {format(showDayOrders.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowDayOrders(null)}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>

              {/* Lista de Ordens */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
                <div className="space-y-3">
                  {showDayOrders.orders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => {
                        setShowDayOrders(null);
                        setSelectedOrder(order);
                      }}
                      className="glass dark:glass-dark p-4 rounded-xl cursor-pointer hover:shadow-glass-lg transition-all"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`
                              px-3 py-1 rounded-full text-xs font-semibold text-white
                              bg-gradient-to-r ${getStatusColor(order.status)}
                            `}>
                              {order.status?.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              OS #{order.numero}
                            </span>
                          </div>
                          <p className="font-semibold text-gray-800 dark:text-white truncate">
                            {order.cliente?.nome || 'Cliente não informado'}
                          </p>
                          {order.instrumento && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                              {order.instrumento.nome}
                              {order.marca && ` - ${order.marca.nome}`}
                              {order.modelo && ` ${order.modelo}`}
                            </p>
                          )}
                          {order.problema_descricao && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                              {order.problema_descricao}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {order.valor_total && (
                            <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                              {formatCurrency(order.valor_total)}
                            </p>
                          )}
                          {order.data_previsao && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Previsão: {new Date(order.data_previsao).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
