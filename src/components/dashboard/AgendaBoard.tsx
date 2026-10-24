/**
 * Agenda da oficina — peça central do painel.
 *
 * Duas leituras do mesmo conjunto de OS abertas:
 *   - "7 dias": planejador por dia, com o que já passou do prazo no topo;
 *   - "Mês": grade mensal para remanejar prazos com folga.
 * Arrastar uma OS para outro dia reagenda (com confirmação e registro em
 * `agenda_logs`). Em telas de toque, o reagendamento fica no detalhe da OS.
 */

import { useMemo, useState, type DragEvent } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { OrdemServico } from '../../types/database';
import { addDaysToDateOnly, parseLocalDate, toDateOnly, todayLocalDate } from '../../utils/dates';
import { effectiveOrderStatus, orderStatusLabel, orderStatusTone, type OrderStatus } from '../ui/status';
import { Segmented, Skeleton, toneBar } from '../ui';
import { equipmentLine } from './order-actions';

export type AgendaView = 'semana' | 'mes';

const WEEK_CARD_LIMIT = 4;
const MONTH_PILL_LIMIT = 3;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const severity: Record<OrderStatus, number> = { atraso: 0, em_andamento: 1, pendente: 2, concluido: 3, cancelado: 4 };
const legend: OrderStatus[] = ['pendente', 'em_andamento', 'atraso'];

function byUrgency(a: OrdemServico, b: OrdemServico) {
  return severity[effectiveOrderStatus(a)] - severity[effectiveOrderStatus(b)] || a.numero - b.numero;
}

function dayLabel(date: string, today: string) {
  if (date === today) return 'Hoje';
  if (date === addDaysToDateOnly(today, 1)) return 'Amanhã';
  return parseLocalDate(date)!.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
}

function shortDate(date: string) {
  return parseLocalDate(date)!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function AgendaBoard({
  orders,
  loading,
  view,
  onViewChange,
  onOpenOrder,
  onOpenDay,
  onReschedule,
}: {
  orders: OrdemServico[];
  loading: boolean;
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  onOpenOrder: (order: OrdemServico) => void;
  onOpenDay: (date: string, orders: OrdemServico[]) => void;
  onReschedule: (order: OrdemServico, date: string) => void;
}) {
  const today = todayLocalDate();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);

  const { byDate, overdue } = useMemo(() => {
    const map = new Map<string, OrdemServico[]>();
    const late: OrdemServico[] = [];
    for (const order of orders) {
      const date = toDateOnly(order.data_previsao);
      if (!date) continue;
      if (date < today) late.push(order);
      const list = map.get(date);
      if (list) list.push(order);
      else map.set(date, [order]);
    }
    map.forEach((list) => list.sort(byUrgency));
    late.sort((a, b) => toDateOnly(a.data_previsao).localeCompare(toDateOnly(b.data_previsao)) || a.numero - b.numero);
    return { byDate: map, overdue: late };
  }, [orders, today]);

  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysToDateOnly(today, index)), [today]);
  const weekTotal = week.reduce((sum, date) => sum + (byDate.get(date)?.length ?? 0), 0);

  /* ---------------------------------------------------------- arrastar e soltar */

  const dragProps = (order: OrdemServico) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', order.id);
      setDragId(order.id);
    },
    onDragEnd: () => {
      setDragId(null);
      setDropDate(null);
    },
  });

  const dropProps = (date: string) =>
    date < today
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            if (!dragId) return;
            event.preventDefault();
            if (dropDate !== date) setDropDate(date);
          },
          onDragLeave: (event: DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropDate(null);
          },
          onDrop: (event: DragEvent) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain') || dragId;
            const order = orders.find((item) => item.id === id);
            setDragId(null);
            setDropDate(null);
            if (order) onReschedule(order, date);
          },
        };

  /* ------------------------------------------------------------------ mês */

  const monthDate = parseLocalDate(`${month}-01`)!;
  const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'long' });
  const monthTitle = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${monthDate.getFullYear()}`;
  const monthCells = useMemo(() => {
    const first = parseLocalDate(`${month}-01`)!;
    const offset = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const start = addDaysToDateOnly(`${month}-01`, -offset);
    return Array.from({ length: total }, (_, index) => addDaysToDateOnly(start, index));
  }, [month]);

  function shiftMonth(delta: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1);
    setMonth(toDateOnly(next).slice(0, 7));
  }

  return (
    <section className="ui-panel ui-panel-flush flex flex-col" aria-labelledby="agenda-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="agenda-title" className="dash-section-title">
            Agenda
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {view === 'semana'
              ? `${weekTotal} ${weekTotal === 1 ? 'entrega prevista' : 'entregas previstas'} nos próximos 7 dias${overdue.length ? ` · ${overdue.length} com prazo vencido` : ''}`
              : 'Arraste uma OS para outro dia para reagendar.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'mes' && (
            <div className="flex items-center gap-1">
              <button type="button" className="app-icon-button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold text-ink">{monthTitle}</span>
              <button type="button" className="app-icon-button" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </button>
              {month !== today.slice(0, 7) && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setMonth(today.slice(0, 7))}>
                  Hoje
                </button>
              )}
            </div>
          )}
          <Segmented<AgendaView>
            value={view}
            onChange={onViewChange}
            options={[
              { value: 'semana', label: '7 dias' },
              { value: 'mes', label: 'Mês' },
            ]}
          />
        </div>
      </header>

      {loading && !orders.length ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : view === 'semana' ? (
        <ol className="divide-y divide-hairline">
          {overdue.length > 0 && (
            <DayRow
              title="Prazo vencido"
              caption={`${overdue.length} ${overdue.length === 1 ? 'ordem' : 'ordens'}`}
              tone="danger"
              orders={overdue}
              showDate
              onOpenOrder={onOpenOrder}
              onMore={() => onOpenDay('vencidas', overdue)}
              dragProps={dragProps}
            />
          )}
          {week.map((date) => (
            <DayRow
              key={date}
              title={dayLabel(date, today)}
              caption={shortDate(date)}
              today={date === today}
              orders={byDate.get(date) ?? []}
              dropping={dropDate === date}
              onOpenOrder={onOpenOrder}
              onMore={() => onOpenDay(date, byDate.get(date) ?? [])}
              dragProps={dragProps}
              dropProps={dropProps(date)}
            />
          ))}
        </ol>
      ) : (
        <div className="p-2 sm:p-3">
          <div className="grid grid-cols-7 pb-1.5">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-center text-2xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-hairline bg-hairline [gap:1px]">
            {monthCells.map((date) => {
              const list = byDate.get(date) ?? [];
              const inMonth = date.startsWith(month);
              const past = date < today;
              return (
                <div
                  key={date}
                  className="dash-cell"
                  data-outside={!inMonth || undefined}
                  data-past={past || undefined}
                  data-today={date === today || undefined}
                  data-drop={dropDate === date || undefined}
                  {...dropProps(date)}
                >
                  <button
                    type="button"
                    className="dash-cell-day"
                    onClick={() => list.length && onOpenDay(date, list)}
                    aria-label={`${parseLocalDate(date)!.toLocaleDateString('pt-BR')}: ${list.length} OS`}
                  >
                    {Number(date.slice(8))}
                  </button>
                  <div className="mt-1 space-y-1">
                    {list.slice(0, MONTH_PILL_LIMIT).map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        className="dash-pill"
                        data-tone={orderStatusTone(effectiveOrderStatus(order))}
                        title={`OS #${order.numero} · ${order.cliente?.nome || 'Sem cliente'}`}
                        onClick={() => onOpenOrder(order)}
                        {...dragProps(order)}
                      >
                        <span className="dash-pill-dot" aria-hidden />
                        <span className="truncate">{order.cliente?.nome || `OS #${order.numero}`}</span>
                      </button>
                    ))}
                    {list.length > MONTH_PILL_LIMIT && (
                      <button type="button" className="dash-more" onClick={() => onOpenDay(date, list)}>
                        +{list.length - MONTH_PILL_LIMIT} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline px-4 py-2.5 text-2xs text-ink-muted sm:px-5">
        {legend.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${toneBar[orderStatusTone(status)]}`} aria-hidden />
            {orderStatusLabel(status)}
          </span>
        ))}
        <span className="ml-auto hidden items-center gap-1 text-ink-subtle md:inline-flex">
          <GripVertical className="h-3 w-3" aria-hidden /> Arraste para reagendar · clique para agir
        </span>
      </footer>
    </section>
  );
}

function DayRow({
  title,
  caption,
  orders,
  today,
  tone,
  showDate,
  dropping,
  onOpenOrder,
  onMore,
  dragProps,
  dropProps,
}: {
  title: string;
  caption: string;
  orders: OrdemServico[];
  today?: boolean;
  tone?: 'danger';
  showDate?: boolean;
  dropping?: boolean;
  onOpenOrder: (order: OrdemServico) => void;
  onMore: () => void;
  dragProps: (order: OrdemServico) => object;
  dropProps?: object;
}) {
  const hidden = orders.length - WEEK_CARD_LIMIT;
  return (
    <li className="dash-day" data-today={today || undefined} data-tone={tone} data-drop={dropping || undefined} {...dropProps}>
      <div className="dash-day-label">
        <span className="dash-day-title">{title}</span>
        <span className="text-2xs tabular-nums text-ink-subtle">{caption}</span>
      </div>
      {orders.length ? (
        <div className="dash-day-orders">
          {orders.slice(0, WEEK_CARD_LIMIT).map((order) => (
            <OrderCard key={order.id} order={order} showDate={showDate} onOpen={onOpenOrder} dragProps={dragProps(order)} />
          ))}
          {hidden > 0 && (
            <button type="button" className="dash-order dash-order-more" onClick={onMore}>
              +{hidden} {hidden === 1 ? 'ordem' : 'ordens'}
            </button>
          )}
        </div>
      ) : (
        <p className="flex items-center text-xs text-ink-subtle">
          {today ? (
            <>
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Nenhuma entrega prevista para hoje
            </>
          ) : (
            <>
              <CalendarRange className="mr-1.5 h-3.5 w-3.5 opacity-60" aria-hidden /> Livre
            </>
          )}
        </p>
      )}
    </li>
  );
}

function OrderCard({
  order,
  showDate,
  onOpen,
  dragProps,
}: {
  order: OrdemServico;
  showDate?: boolean;
  onOpen: (order: OrdemServico) => void;
  dragProps: object;
}) {
  const status = effectiveOrderStatus(order);
  return (
    <button type="button" className="dash-order" data-tone={orderStatusTone(status)} onClick={() => onOpen(order)} {...dragProps}>
      <span className="flex items-center justify-between gap-2 text-2xs font-semibold tabular-nums text-ink-subtle">
        <span>OS #{order.numero}</span>
        <span className="dash-order-status">{showDate ? shortDate(toDateOnly(order.data_previsao)) : orderStatusLabel(status)}</span>
      </span>
      <span className="mt-0.5 block truncate text-[0.8125rem] font-semibold text-ink">{order.cliente?.nome || 'Cliente não informado'}</span>
      <span className="block truncate text-xs text-ink-muted">{equipmentLine(order) || 'Equipamento não informado'}</span>
    </button>
  );
}
