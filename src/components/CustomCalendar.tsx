import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Wrench, DollarSign, X, Play, AlertTriangle, CheckCircle, AlertCircle, ClipboardCheck, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { OrdemServico } from '../types/database';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { WhatsAppService } from '../utils/whatsapp-service';
import { alerts } from '../utils/alerts';

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
  const [draggedOrder, setDraggedOrder] = useState<OrdemServico | null>(null);

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
      const orderDate = parseScheduleDate(order.data_previsao);
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

  const parseScheduleDate = (value?: string | Date) => {
    if (!value) return new Date();
    if (value instanceof Date) return value;

    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    return new Date(value);
  };

  const dateForDatabase = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isSameDate = (first: Date, second: Date) => (
    first.getDate() === second.getDate() &&
    first.getMonth() === second.getMonth() &&
    first.getFullYear() === second.getFullYear()
  );

  const updateOrderDate = async (order: OrdemServico, newDate: Date) => {
    const originalDate = parseScheduleDate(order.data_previsao);
    if (isSameDate(originalDate, newDate)) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(newDate);
    targetDate.setHours(0, 0, 0, 0);

    if (targetDate < today) {
      toast.error('Não é possível mover uma ordem para uma data passada.');
      return;
    }

    const confirm = await alerts.confirm({
      title: 'Confirmar reagendamento',
      text: `Mover OS #${order.numero} para ${targetDate.toLocaleDateString('pt-BR')}?`,
      icon: 'question',
      confirmButtonText: 'Sim, reagendar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirm.isConfirmed) return;

    try {
      const dataAnterior = dateForDatabase(originalDate);
      const dataNova = dateForDatabase(targetDate);

      const { error: updateError } = await supabase
        .from('ordens_servico')
        .update({ data_previsao: dataNova })
        .eq('id', order.id);

      if (updateError) throw updateError;

      const { error: logError } = await supabase
        .from('agenda_logs')
        .insert({
          ordem_servico_id: order.id,
          data_anterior: dataAnterior,
          data_nova: dataNova,
          acao: 'reagendamento',
        });

      if (logError) throw logError;

      toast.success('Data de entrega atualizada com sucesso');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error('Erro ao reagendar ordem:', error);
      toast.error(error?.message || 'Erro ao atualizar a data de entrega');
      if (onUpdate) onUpdate();
    }
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
      atraso: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      concluido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    };
    return colors[status as keyof typeof colors] || colors.cancelado;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pendente: 'Pendente',
      em_andamento: 'Em Andamento',
      cancelado: 'Cancelado',
      atraso: 'Em atraso',
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
                  onDragOver={(event) => {
                    if (draggedOrder) event.preventDefault();
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    if (!draggedOrder) return;

                    const order = draggedOrder;
                    setDraggedOrder(null);
                    await updateOrderDate(order, dayInfo.date);
                  }}
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
                        draggable={!['concluido', 'cancelado'].includes(order.status)}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDraggedOrder(order);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', order.id);
                        }}
                        onDragEnd={() => setDraggedOrder(null)}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-details-title"
              className="flex max-h-[calc(100vh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14 ${getStatusBadgeColor(selectedOrder.status)}`}>
                    <CalendarIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">Ordem de serviço</p>
                    <h3 id="order-details-title" className="truncate text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                      OS #{selectedOrder.numero}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Código {selectedOrder.id.substring(0, 8)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  aria-label="Fechar detalhes da ordem"
                  className="shrink-0 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Detalhes */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/70 dark:bg-slate-800/60">
                    <User className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Cliente</p>
                      <p className="truncate font-bold text-slate-900 dark:text-white">
                      {selectedOrder.cliente?.nome || 'Não informado'}
                      </p>
                      {selectedOrder.cliente?.telefone && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                          <Phone className="h-3.5 w-3.5" />
                          {selectedOrder.cliente.telefone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/70 dark:bg-slate-800/60">
                    <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Equipamento</p>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {[selectedOrder.instrumento?.nome, selectedOrder.marca?.nome].filter(Boolean).join(' - ') || 'Não informado'}
                      </p>
                      {selectedOrder.modelo && (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Modelo: {selectedOrder.modelo}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800/30">
                    <div className="mb-2 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Clock className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      <p className="text-xs font-medium">Previsão</p>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedOrder.data_previsao
                          ? parseScheduleDate(selectedOrder.data_previsao).toLocaleDateString('pt-BR')
                          : 'Não definida'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800/30">
                    <div className="mb-2 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <DollarSign className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      <p className="text-xs font-medium">Valor</p>
                    </div>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(Number(selectedOrder.valor_total ?? (selectedOrder.valor_servicos - (selectedOrder.desconto || 0))))}
                    </p>
                  </div>

                  <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800/30 sm:col-span-1">
                    <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Status atual</p>
                    <span className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-bold ${getStatusBadgeColor(selectedOrder.status)}`}>
                      {getStatusLabel(selectedOrder.status)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Problema relatado</h4>
                    </div>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {selectedOrder.problema_descricao?.trim() || 'Não informado nesta ordem.'}
                    </p>
                  </section>

                  <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <div className="mb-2 flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Serviço a executar</h4>
                    </div>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {selectedOrder.servico_descricao?.trim() || 'Não informado nesta ordem.'}
                    </p>
                  </section>
                </div>
              </div>

              {/* Ações */}
              <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => updateOrderStatus('em_andamento')}
                    disabled={updatingStatus || selectedOrder.status === 'em_andamento'}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 p-2 text-center text-[11px] font-semibold leading-tight text-white shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:flex-row sm:gap-2 sm:text-xs"
                  >
                    <Play className="w-5 h-5" />
                    <span>Iniciar serviço</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => updateOrderStatus('atraso')}
                    disabled={updatingStatus || selectedOrder.status === 'atraso'}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-red-500 to-red-600 p-2 text-center text-[11px] font-semibold leading-tight text-white shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:flex-row sm:gap-2 sm:text-xs"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    <span>Contratempo</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => updateOrderStatus('concluido')}
                    disabled={updatingStatus || selectedOrder.status === 'concluido'}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-2 text-center text-[11px] font-semibold leading-tight text-white shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:flex-row sm:gap-2 sm:text-xs"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>Finalizar OS</span>
                  </motion.button>
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
                              Previsão: {parseScheduleDate(order.data_previsao).toLocaleDateString('pt-BR')}
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
