import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import type { ContaPagar } from '../types/database';
import { formatCurrency } from '../utils/formatters';

interface SimpleCalendarProps {
  contas: ContaPagar[];
  onContaClick?: (conta: ContaPagar) => void;
}

export function SimpleCalendar({ contas, onContaClick }: SimpleCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    // Adiciona espaços vazios antes do primeiro dia
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Adiciona todos os dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const getContasForDay = (date: Date) => {
    return contas.filter(conta => {
      const contaDate = new Date(conta.data_vencimento);
      return (
        contaDate.getDate() === date.getDate() &&
        contaDate.getMonth() === date.getMonth() &&
        contaDate.getFullYear() === date.getFullYear() &&
        conta.status !== 'pago'
      );
    });
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const days = getDaysInMonth(currentDate);

  return (
    <div className="w-full">
      {/* Header do Calendário */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={previousMonth}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Grid do Calendário */}
      <div className="grid grid-cols-7 gap-2">
        {/* Dias da semana */}
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center font-semibold text-sm text-gray-600 dark:text-gray-400 py-2"
          >
            {day}
          </div>
        ))}

        {/* Dias do mês */}
        {days.map((day, index) => {
          const dayContas = day ? getContasForDay(day) : [];
          const isToday = day && 
            day.getDate() === new Date().getDate() &&
            day.getMonth() === new Date().getMonth() &&
            day.getFullYear() === new Date().getFullYear();

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01 }}
              className={`
                min-h-[100px] p-2 rounded-xl border transition-all
                ${day ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-transparent border-transparent'}
                ${isToday ? 'ring-2 ring-primary-500' : ''}
                ${dayContas.length > 0 ? 'hover:shadow-lg' : ''}
              `}
            >
              {day && (
                <>
                  <div className={`
                    text-sm font-semibold mb-1 text-center
                    ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}
                  `}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayContas.map((conta) => (
                      <button
                        key={conta.id}
                        onClick={() => onContaClick?.(conta)}
                        className={`
                          w-full text-left px-2 py-1 rounded text-xs transition-all
                          ${conta.status === 'atrasado' 
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50' 
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                          }
                        `}
                      >
                        <div className="font-semibold truncate">{conta.descricao}</div>
                        <div className="text-xs">{formatCurrency(conta.valor)}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
