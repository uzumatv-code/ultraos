import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, User, Wrench, DollarSign, ChevronLeft, ChevronRight, X, Play, AlertTriangle, CheckCircle, List } from 'lucide-react';
import { useMemo, useState } from 'react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import type { OrdemServico } from '../types/database';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { WhatsAppService } from '../utils/whatsapp-service';
import { alerts } from '../utils/alerts';

const locales = {
  'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent extends Event {
  id: string;
  ordem: OrdemServico;
  status: string;
  resourceId?: string;
}

interface CalendarResource {
  id: string;
  title: string;
}

const DragAndDropCalendar = withDragAndDrop<CalendarEvent, CalendarResource>(Calendar);

interface ModernCalendarProps {
  orders: OrdemServico[];
  onEventClick: (order: OrdemServico) => void;
  loading?: boolean;
  onUpdate?: () => void;
}

export function ModernCalendar({ orders, onEventClick, loading = false, onUpdate }: ModernCalendarProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [dragRefreshKey, setDragRefreshKey] = useState(0);

  const getOrderResourceId = (ordem: OrdemServico) => {
    const record = ordem as any;
    return record.profissional_id || record.responsavel_id || record.profissional?.id || record.responsavel?.id;
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

  const startOfLocalDay = (date: Date) => {
    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
  };

  const dateForDatabase = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Converter ordens para eventos
  const events: CalendarEvent[] = orders.map((ordem) => {
    const startDate = startOfLocalDay(parseScheduleDate(ordem.data_previsao));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    // Determinar cor baseado no status
    let statusColor = '#ef4444'; // red - default (atraso)
    if (ordem.status === 'concluido') {
      statusColor = '#10b981'; // green
    } else if (ordem.status === 'em_andamento') {
      statusColor = '#f59e0b'; // amber
    } else if (ordem.status === 'pendente') {
      statusColor = '#6366f1'; // indigo
    }

    return {
      id: ordem.id,
      title: ordem.cliente?.nome || 'Sem cliente',
      start: startDate,
      end: endDate,
      allDay: true,
      ordem,
      status: ordem.status,
      resourceId: getOrderResourceId(ordem),
      resource: {
        color: statusColor,
        cliente: ordem.cliente?.nome,
        instrumento: ordem.instrumento?.nome,
        marca: ordem.marca?.nome,
      },
    };
  });

  const resources = useMemo(() => {
    const professionals = new Map<string, { id: string; title: string }>();

    orders.forEach((ordem) => {
      const record = ordem as any;
      const id = getOrderResourceId(ordem);
      if (!id) return;

      const title =
        record.profissional?.nome ||
        record.responsavel?.nome ||
        record.profissional_nome ||
        record.responsavel_nome ||
        'Profissional';

      professionals.set(String(id), { id: String(id), title });
    });

    return Array.from(professionals.values());
  }, [orders]);

  const eventStyleGetter = (event: CalendarEvent) => {
    const statusColors = {
      pendente: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      em_andamento: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
      atraso: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      concluido: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    };

    return {
      style: {
        background: statusColors[event.status as keyof typeof statusColors] || statusColors.atraso,
        border: 'none',
        borderRadius: '8px',
        padding: '4px 8px',
        color: 'white',
        fontWeight: '500',
        fontSize: '0.875rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        cursor: 'pointer',
        transition: 'all 0.2s',
      },
    };
  };

  const CustomToolbar = (toolbar: any) => {
    const goToBack = () => toolbar.onNavigate('PREV');
    const goToNext = () => toolbar.onNavigate('NEXT');
    const goToToday = () => toolbar.onNavigate('TODAY');

    const viewNamesGroup = (messages: any) => {
      const views = ['month', 'week', 'day'];
      return views.map((name) => (
        <motion.button
          key={name}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => toolbar.onView(name)}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            view === name
              ? 'gradient-primary text-white shadow-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {messages[name]}
        </motion.button>
      ));
    };

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        {/* Navegação */}
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={goToBack}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={goToToday}
            className="px-4 py-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-semibold hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all"
          >
            Hoje
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={goToNext}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          >
            <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
        </div>

        {/* Título */}
        <h2 className="text-xl sm:text-2xl font-bold text-gradient">
          {toolbar.label}
        </h2>

        {/* Visualizações */}
        <div className="flex gap-2">
          {viewNamesGroup({ month: 'Mês', week: 'Semana', day: 'Dia' })}
        </div>
      </div>
    );
  };

  const formatSchedule = (date: Date) => {
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  const getScheduleValidationError = (newStart: Date) => {
    const today = startOfLocalDay(new Date());
    if (newStart < today) {
      return 'Não é possível mover um agendamento para uma data passada.';
    }

    return null;
  };

  const updateOrderSchedule = async ({ event, start, resourceId }: EventInteractionArgs<CalendarEvent>) => {
    const originalDate = startOfLocalDay(parseScheduleDate(event.ordem.data_previsao || (event.start as Date)));
    const droppedStart = start instanceof Date ? start : new Date(start);
    const newStart = startOfLocalDay(droppedStart);
    const currentResourceId = event.resourceId;
    const nextResourceId = resourceId ? String(resourceId) : currentResourceId;
    const validationError = getScheduleValidationError(newStart);

    if (validationError) {
      toast.error(validationError);
      setDragRefreshKey((value) => value + 1);
      return;
    }

    const confirm = await alerts.confirm({
      title: 'Confirmar reagendamento',
      text: `Mover OS #${event.ordem.numero} de ${formatSchedule(originalDate)} para ${formatSchedule(newStart)}?`,
      icon: 'question',
      confirmButtonText: 'Sim, reagendar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirm.isConfirmed) {
      setDragRefreshKey((value) => value + 1);
      return;
    }

    try {
      const updatePayload: Record<string, any> = {
        data_previsao: dateForDatabase(newStart),
      };

      const orderRecord = event.ordem as any;
      if (nextResourceId && nextResourceId !== currentResourceId) {
        if ('profissional_id' in orderRecord) updatePayload.profissional_id = nextResourceId;
        if ('responsavel_id' in orderRecord) updatePayload.responsavel_id = nextResourceId;
      }

      const { error: updateError } = await supabase
        .from('ordens_servico')
        .update(updatePayload)
        .eq('id', event.id);

      if (updateError) throw updateError;

      const { error: logError } = await supabase
        .from('agenda_logs')
        .insert({
          ordem_servico_id: event.id,
          data_anterior: dateForDatabase(originalDate),
          data_nova: dateForDatabase(newStart),
          profissional_anterior: currentResourceId || null,
          profissional_novo: nextResourceId || null,
          acao: 'reagendamento',
        });

      if (logError) throw logError;

      toast.success('Agendamento reagendado com sucesso!');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error('Erro ao reagendar ordem:', error);
      toast.error(error?.message || 'Erro ao reagendar. A alteração foi revertida.');
      setDragRefreshKey((value) => value + 1);
      if (onUpdate) onUpdate();
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Função para atualizar o status da ordem
  const updateOrderStatus = async (newStatus: string) => {
    if (!selectedEvent) return;

    setUpdatingStatus(true);
    try {
      // Atualizar status no banco de dados
      const { error } = await supabase
        .from('ordens_servico')
        .update({ status: newStatus })
        .eq('id', selectedEvent.ordem.id);

      if (error) throw error;

      // Enviar mensagem de WhatsApp correspondente ao status
      try {
        switch (newStatus) {
          case 'em_andamento':
            await WhatsAppService.sendProgressMessage(selectedEvent.ordem);
            toast.success('Status alterado para "Em Andamento" e mensagem enviada via WhatsApp! ✅');
            break;
          case 'atraso':
            await WhatsAppService.sendDelayMessage(selectedEvent.ordem);
            toast.success('Status alterado para "Em Atraso" e mensagem enviada via WhatsApp! ⏰');
            break;
          case 'concluido':
            await WhatsAppService.sendCompletionMessage(selectedEvent.ordem);
            toast.success('Ordem finalizada e cliente notificado via WhatsApp! 🎉');
            break;
          default: {
            const statusLabels: Record<string, string> = {
              em_andamento: 'Em Andamento',
              cancelado: 'Cancelado/Atrasado',
              concluido: 'Concluído',
              atraso: 'Em Atraso',
            };
            toast.success(`Status alterado para: ${statusLabels[newStatus] || newStatus}`);
          }
        }
      } catch (whatsappError: any) {
        console.error('Erro ao enviar mensagem WhatsApp:', whatsappError);
        toast.success(`Status alterado, mas houve erro ao enviar WhatsApp: ${whatsappError.message}`);
      }

      setSelectedEvent(null);
      
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

  // Função para extrair serviços
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
    <div className="modern-calendar-wrapper">
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
          <DragAndDropCalendar
            key={dragRefreshKey}
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            resourceAccessor="resourceId"
            resourceIdAccessor="id"
            resourceTitleAccessor="title"
            resources={resources.length ? resources : undefined}
            style={{ height: 600 }}
            culture="pt-BR"
            view={view}
            step={30}
            timeslots={2}
            resizable={false}
            draggableAccessor={(event) => !['concluido', 'cancelado'].includes(event.status)}
            onEventDrop={updateOrderSchedule}
            onView={(newView: any) => setView(newView as 'month' | 'week' | 'day')}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(event: any) => setSelectedEvent(event as CalendarEvent)}
            popup
            onShowMore={() => {
              // Quando clicar em "ver mais", muda para visualização de dia
              setView('day');
            }}
            components={{
              toolbar: CustomToolbar,
            }}
            messages={{
              today: 'Hoje',
              previous: 'Anterior',
              next: 'Próximo',
              month: 'Mês',
              week: 'Semana',
              day: 'Dia',
              agenda: 'Agenda',
              date: 'Data',
              time: 'Hora',
              event: 'Evento',
              noEventsInRange: 'Não há eventos neste período.',
              showMore: (total: number) => `+ Ver mais (${total})`,
            }}
          />

          {/* Modal de detalhes do evento */}
          <AnimatePresence>
            {selectedEvent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={() => setSelectedEvent(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="glass dark:glass-dark rounded-2xl p-6 max-w-md w-full shadow-glass-lg"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        selectedEvent.status === 'concluido' ? 'bg-green-100 dark:bg-green-900/30' :
                        selectedEvent.status === 'em_andamento' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        selectedEvent.status === 'pendente' ? 'bg-indigo-100 dark:bg-indigo-900/30' :
                        'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        <CalendarIcon className={`w-6 h-6 ${
                          selectedEvent.status === 'concluido' ? 'text-green-600 dark:text-green-400' :
                          selectedEvent.status === 'em_andamento' ? 'text-amber-600 dark:text-amber-400' :
                          selectedEvent.status === 'pendente' ? 'text-indigo-600 dark:text-indigo-400' :
                          'text-red-600 dark:text-red-400'
                        }`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                          Ordem de Serviço
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          OS #{selectedEvent.id.substring(0, 8)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>

                  {/* Detalhes */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Cliente</p>
                        <p className="font-semibold text-gray-800 dark:text-white">
                          {selectedEvent.ordem.cliente?.nome || 'Não informado'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Wrench className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Instrumento</p>
                        <p className="font-semibold text-gray-800 dark:text-white">
                          {selectedEvent.ordem.instrumento?.nome} - {selectedEvent.ordem.marca?.nome}
                        </p>
                        {selectedEvent.ordem.modelo && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Modelo: {selectedEvent.ordem.modelo}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Previsão de Entrega</p>
                        <p className="font-semibold text-gray-800 dark:text-white">
                          {selectedEvent.ordem.data_previsao 
                            ? format(parseScheduleDate(selectedEvent.ordem.data_previsao), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Não definida'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Valor Total</p>
                        <p className="font-semibold text-green-600 dark:text-green-400 text-lg">
                          {formatCurrency(selectedEvent.ordem.valor_servicos - (selectedEvent.ordem.desconto || 0))}
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Status</p>
                      <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                        selectedEvent.status === 'concluido' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        selectedEvent.status === 'em_andamento' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        selectedEvent.status === 'pendente' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {selectedEvent.status === 'concluido' ? 'Concluído' :
                         selectedEvent.status === 'em_andamento' ? 'Em Andamento' :
                         selectedEvent.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                      </span>
                    </div>

                    {/* Serviços */}
                    {getServicesDescription(selectedEvent.ordem) && (
                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-start gap-2 mb-2">
                          <List className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                              {getServicesDescription(selectedEvent.ordem)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Botões de ação */}
                    <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateOrderStatus('em_andamento')}
                        disabled={updatingStatus || selectedEvent.status === 'em_andamento'}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white font-semibold text-[10px] shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="w-4 h-4" />
                        <span>Andamento</span>
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateOrderStatus('atraso')}
                        disabled={updatingStatus || selectedEvent.status === 'atraso'}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-semibold text-[10px] shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Contratempo</span>
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateOrderStatus('concluido')}
                        disabled={updatingStatus || selectedEvent.status === 'concluido'}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-lg bg-gradient-to-br from-green-500 to-green-600 text-white font-semibold text-[10px] shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Finalização</span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <style>{`
        .modern-calendar-wrapper .rbc-calendar {
          font-family: inherit;
        }

        .modern-calendar-wrapper .rbc-header {
          padding: 12px 8px;
          font-weight: 600;
          font-size: 0.875rem;
          color: #6b7280;
          background: transparent;
          border: none;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .dark .modern-calendar-wrapper .rbc-header {
          color: #9ca3af;
        }

        .modern-calendar-wrapper .rbc-month-view {
          border: none;
          border-radius: 12px;
          overflow: hidden;
          background: transparent;
        }

        .modern-calendar-wrapper .rbc-day-bg {
          border-color: #e5e7eb;
          transition: background-color 0.2s;
        }

        .dark .modern-calendar-wrapper .rbc-day-bg {
          border-color: #374151;
        }

        .modern-calendar-wrapper .rbc-day-bg:hover {
          background-color: rgba(139, 92, 246, 0.05);
        }

        .modern-calendar-wrapper .rbc-today {
          background-color: rgba(139, 92, 246, 0.1);
        }

        .modern-calendar-wrapper .rbc-off-range-bg {
          background-color: rgba(0, 0, 0, 0.02);
        }

        .dark .modern-calendar-wrapper .rbc-off-range-bg {
          background-color: rgba(255, 255, 255, 0.02);
        }

        .modern-calendar-wrapper .rbc-date-cell {
          padding: 8px;
          font-weight: 500;
          color: #374151;
        }

        .dark .modern-calendar-wrapper .rbc-date-cell {
          color: #e5e7eb;
        }

        .modern-calendar-wrapper .rbc-off-range .rbc-date-cell {
          color: #9ca3af;
        }

        .modern-calendar-wrapper .rbc-event {
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .modern-calendar-wrapper .rbc-event:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          z-index: 10;
        }

        .modern-calendar-wrapper .rbc-show-more {
          background-color: transparent;
          color: #8b5cf6;
          font-weight: 600;
          padding: 4px;
          margin-top: 4px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .modern-calendar-wrapper .rbc-show-more:hover {
          background-color: rgba(139, 92, 246, 0.1);
        }

        .modern-calendar-wrapper .rbc-month-row {
          border: none;
        }

        .modern-calendar-wrapper .rbc-row-segment {
          padding: 2px 4px;
        }
      `}</style>
    </div>
  );
}
