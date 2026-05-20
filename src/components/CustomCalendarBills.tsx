import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, DollarSign, X, Check, CalendarDays, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ContaPagar } from '../types/database';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';

interface CustomCalendarBillsProps {
  bills: ContaPagar[];
  onEventClick: (bill: ContaPagar) => void;
  loading?: boolean;
  onUpdate?: () => void;
  onMonthChange?: (date: Date) => void;
}

export function CustomCalendarBills({ bills, onEventClick, loading = false, onUpdate, onMonthChange }: CustomCalendarBillsProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBill, setSelectedBill] = useState<ContaPagar | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDate, setNewDate] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
    setCurrentDate(newDate);
    onMonthChange?.(newDate);
  };

  const nextMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
    setCurrentDate(newDate);
    onMonthChange?.(newDate);
  };

  const getBillsForDay = (day: number) => {
    return bills.filter(bill => {
      const billDate = new Date(bill.data_vencimento);
      return billDate.getDate() === day &&
             billDate.getMonth() === month &&
             billDate.getFullYear() === year;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pago': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700';
      case 'atrasado': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700';
      case 'pendente': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700';
      default: return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pago': return 'Pago';
      case 'atrasado': return 'Atrasado';
      case 'pendente': return 'Pendente';
      default: return status;
    }
  };

  const handleMarkAsPaid = async (bill: ContaPagar) => {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('contas_pagar')
        .update({ status: 'pago' })
        .eq('id', bill.id);

      if (error) throw error;

      toast.success('Conta marcada como paga!');
      onUpdate?.();
      setSelectedBill(null);
    } catch (error) {
      console.error('Erro ao marcar conta como paga:', error);
      toast.error('Erro ao atualizar conta');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePostpone = async () => {
    if (!selectedBill || !newDate) {
      toast.error('Selecione uma nova data');
      return;
    }

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('contas_pagar')
        .update({ data_vencimento: newDate })
        .eq('id', selectedBill.id);

      if (error) throw error;

      toast.success('Data de vencimento atualizada!');
      onUpdate?.();
      setSelectedBill(null);
      setShowDatePicker(false);
      setNewDate('');
    } catch (error) {
      console.error('Erro ao adiar conta:', error);
      toast.error('Erro ao atualizar data');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async (bill: ContaPagar) => {
    if (!confirm(`Deseja realmente excluir a conta "${bill.descricao}"?`)) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('contas_pagar')
        .delete()
        .eq('id', bill.id);

      if (error) throw error;

      toast.success('Conta excluída com sucesso!');
      onUpdate?.();
      setSelectedBill(null);
    } catch (error) {
      console.error('Erro ao excluir conta:', error);
      toast.error('Erro ao excluir conta');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const renderCalendarDays = () => {
    const days = [];
    const totalCells = Math.ceil((daysInMonth + startingDayOfWeek) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - startingDayOfWeek + 1;
      const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;
      const dayBills = isCurrentMonth ? getBillsForDay(dayNumber) : [];
      const isToday = isCurrentMonth && 
        dayNumber === new Date().getDate() &&
        month === new Date().getMonth() &&
        year === new Date().getFullYear();

      days.push(
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.01 }}
          className={`min-h-[100px] p-2 border border-gray-200 dark:border-gray-700 ${
            isCurrentMonth 
              ? 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750' 
              : 'bg-gray-50 dark:bg-gray-900'
          } ${isToday ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
        >
          {isCurrentMonth && (
            <>
              <div className={`text-sm font-semibold mb-1 ${
                isToday 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-700 dark:text-gray-300'
              }`}>
                {dayNumber}
              </div>
              <div className="space-y-1">
                {dayBills.slice(0, 3).map((bill) => (
                  <motion.div
                    key={bill.id}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setSelectedBill(bill)}
                    className={`text-xs p-1.5 rounded cursor-pointer border ${getStatusColor(bill.status)} transition-all`}
                  >
                    <div className="font-medium truncate">{bill.descricao}</div>
                    <div className="text-xs opacity-75">{formatCurrency(bill.valor)}</div>
                  </motion.div>
                ))}
                {dayBills.length > 3 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 pl-1.5">
                    +{dayBills.length - 3} mais
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {monthNames[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={previousMonth}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const today = new Date();
              setCurrentDate(today);
              onMonthChange?.(today);
            }}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            Hoje
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={nextMonth}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
          <div key={day} className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {renderCalendarDays()}
      </div>

      {/* Bill Details Modal */}
      <AnimatePresence>
        {selectedBill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => {
              setSelectedBill(null);
              setShowDatePicker(false);
              setNewDate('');
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="sticky top-0 bg-gradient-to-br from-red-500 to-pink-600 p-6 rounded-t-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-lg rounded-xl flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">
                        Detalhes da Conta
                      </h3>
                      <p className="text-white/80 text-sm">
                        Gerenciar pagamento
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setSelectedBill(null);
                      setShowDatePicker(false);
                      setNewDate('');
                    }}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {/* Descrição */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                    Descrição
                  </h4>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedBill.descricao}
                  </p>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                      <DollarSign className="w-4 h-4" />
                      <span className="text-sm font-medium">Valor</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {formatCurrency(selectedBill.valor)}
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-medium">Vencimento</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {new Date(selectedBill.data_vencimento).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {/* Categoria */}
                {selectedBill.categoria && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Categoria
                    </h4>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: `${selectedBill.categoria.cor}20`,
                        color: selectedBill.categoria.cor
                      }}
                    >
                      {selectedBill.categoria.nome}
                    </span>
                  </div>
                )}

                {/* Status */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                    Status Atual
                  </h4>
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(selectedBill.status)}`}>
                    {selectedBill.status === 'pago' && <CheckCircle className="w-4 h-4" />}
                    {selectedBill.status === 'atrasado' && <AlertTriangle className="w-4 h-4" />}
                    {getStatusLabel(selectedBill.status)}
                  </span>
                </div>

                {/* Date Picker for Postpone */}
                {showDatePicker && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border-2 border-blue-200 dark:border-blue-700"
                  >
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Nova Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  {selectedBill.status !== 'pago' && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleMarkAsPaid(selectedBill)}
                      disabled={updatingStatus}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-5 h-5" />
                      {updatingStatus ? 'Processando...' : 'Marcar como Paga'}
                    </motion.button>
                  )}

                  {!showDatePicker ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowDatePicker(true);
                        setNewDate(selectedBill.data_vencimento.split('T')[0]);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg"
                    >
                      <CalendarDays className="w-5 h-5" />
                      Adiar Conta
                    </motion.button>
                  ) : (
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handlePostpone}
                        disabled={updatingStatus || !newDate}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="w-5 h-5" />
                        {updatingStatus ? 'Salvando...' : 'Confirmar'}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowDatePicker(false);
                          setNewDate('');
                        }}
                        className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-all"
                      >
                        <X className="w-5 h-5" />
                      </motion.button>
                    </div>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDelete(selectedBill)}
                    disabled={updatingStatus}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-5 h-5" />
                    {updatingStatus ? 'Excluindo...' : 'Excluir Conta'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
