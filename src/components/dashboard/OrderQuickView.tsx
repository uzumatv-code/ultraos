/**
 * Detalhe rápido de uma OS aberto a partir da agenda e da fila de prioridades.
 * Resolve o essencial sem sair do painel: reagendar, iniciar, registrar
 * contratempo ou finalizar — e leva à OS completa quando precisar de mais.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, ClipboardCheck, Phone, Play, User, Wrench, X,
} from 'lucide-react';
import type { OrdemServico } from '../../types/database';
import { formatCurrency } from '../../utils/formatters';
import { formatLocalDate, parseLocalDate, toDateOnly, todayLocalDate } from '../../utils/dates';
import { OrderStatusBadge, effectiveOrderStatus, orderStatusTone } from '../ui/status';
import { UIButton } from '../ui';
import { changeOrderStatus, equipmentLine, rescheduleOrder, type QuickStatus } from './order-actions';

export function DashboardModal({
  open,
  onClose,
  labelledBy,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(var(--ui-overlay)/0.62)] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            onClick={(event) => event.stopPropagation()}
            className={`flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-hairline bg-surface-raised shadow-glass-lg sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-xl'}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Fechar" className="app-icon-button shrink-0">
      <X className="h-5 w-5" />
    </button>
  );
}

const statusActions: Array<{ status: QuickStatus; label: string; icon: typeof Play; variant: 'secondary' | 'success' }> = [
  { status: 'em_andamento', label: 'Iniciar serviço', icon: Play, variant: 'secondary' },
  { status: 'atraso', label: 'Contratempo', icon: AlertTriangle, variant: 'secondary' },
  { status: 'concluido', label: 'Finalizar OS', icon: CheckCircle2, variant: 'success' },
];

export function OrderQuickView({
  order,
  onClose,
  onChanged,
  onOpenFull,
}: {
  order: OrdemServico | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenFull: (order: OrdemServico) => void;
}) {
  const [busy, setBusy] = useState<QuickStatus | 'agenda' | null>(null);
  const [newDate, setNewDate] = useState('');

  useEffect(() => {
    setNewDate(order ? toDateOnly(order.data_previsao) : '');
    setBusy(null);
  }, [order]);

  async function run(action: QuickStatus | 'agenda') {
    if (!order) return;
    setBusy(action);
    const changed = action === 'agenda' ? await rescheduleOrder(order, newDate) : await changeOrderStatus(order, action);
    setBusy(null);
    if (changed) {
      onChanged();
      onClose();
    }
  }

  const total = order ? Number(order.valor_total ?? Number(order.valor_servicos || 0) - Number(order.desconto || 0)) : 0;
  const tone = order ? orderStatusTone(effectiveOrderStatus(order)) : 'neutral';

  return (
    <DashboardModal open={Boolean(order)} onClose={onClose} labelledBy="quick-order-title" size="lg">
      {order && (
        <>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">Ordem de serviço</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="quick-order-title" className="font-display text-xl font-bold tracking-tight text-ink">
                  OS #{order.numero}
                </h2>
                <OrderStatusBadge ordem={order} />
              </div>
            </div>
            <ModalClose onClose={onClose} />
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Fact icon={User} label="Cliente">
                <p className="truncate font-semibold text-ink">{order.cliente?.nome || 'Não informado'}</p>
                {order.cliente?.telefone && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <Phone className="h-3 w-3" /> {order.cliente.telefone}
                  </p>
                )}
              </Fact>
              <Fact icon={Wrench} label="Equipamento">
                <p className="font-semibold text-ink">{equipmentLine(order) || 'Não informado'}</p>
              </Fact>
            </div>

            <dl className="grid grid-cols-3 divide-x divide-hairline rounded-lg border border-hairline">
              <Stat label="Entrada" value={formatLocalDate(order.data_entrada) || '—'} />
              <Stat label="Previsão" value={formatLocalDate(order.data_previsao) || '—'} tone={tone === 'danger' ? 'text-signal-danger' : undefined} />
              <Stat label="Valor" value={formatCurrency(total)} />
            </dl>

            {(order.problema_descricao?.trim() || order.servico_descricao?.trim()) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {order.problema_descricao?.trim() && <Note icon={AlertTriangle} title="Problema relatado" text={order.problema_descricao} />}
                {order.servico_descricao?.trim() && <Note icon={ClipboardCheck} title="Serviço a executar" text={order.servico_descricao} />}
              </div>
            )}

            <form
              className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-muted/60 p-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void run('agenda');
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="ui-label flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Nova previsão de entrega
                </span>
                <input
                  type="date"
                  className="ui-field"
                  value={newDate}
                  min={todayLocalDate()}
                  onChange={(event) => setNewDate(event.target.value)}
                />
              </label>
              <UIButton
                type="submit"
                variant="secondary"
                loading={busy === 'agenda'}
                disabled={Boolean(busy) || !newDate || newDate === toDateOnly(order.data_previsao)}
              >
                Reagendar
              </UIButton>
            </form>
          </div>

          <footer className="shrink-0 space-y-3 border-t border-hairline px-5 py-4">
            <div className="grid grid-cols-3 gap-2">
              {statusActions.map(({ status, label, icon, variant }) => (
                <UIButton
                  key={status}
                  variant={variant}
                  icon={icon}
                  loading={busy === status}
                  disabled={Boolean(busy) || order.status === status}
                  onClick={() => void run(status)}
                  className="!h-auto min-h-10 whitespace-normal px-2 py-2 text-xs leading-tight sm:text-[0.8125rem]"
                >
                  {label}
                </UIButton>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xs text-ink-subtle">Mudar o status avisa o cliente pelo WhatsApp.</p>
              <UIButton variant="ghost" size="sm" iconRight={ArrowUpRight} onClick={() => onOpenFull(order)}>
                Abrir OS completa
              </UIButton>
            </div>
          </footer>
        </>
      )}
    </DashboardModal>
  );
}

export function DayOrdersModal({
  day,
  onClose,
  onOpenOrder,
}: {
  day: { date: string; orders: OrdemServico[] } | null;
  onClose: () => void;
  onOpenOrder: (order: OrdemServico) => void;
}) {
  /* `date` é um dia (AAAA-MM-DD) ou a lista de prazos vencidos. */
  const date = day ? parseLocalDate(day.date) : null;
  const title = date ? date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Prazo vencido';
  return (
    <DashboardModal open={Boolean(day)} onClose={onClose} labelledBy="day-orders-title">
      {day && (
        <>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                {day.orders.length} {day.orders.length === 1 ? 'entrega prevista' : 'entregas previstas'}
              </p>
              <h2 id="day-orders-title" className="mt-1 font-display text-lg font-bold capitalize text-ink">
                {title}
              </h2>
            </div>
            <ModalClose onClose={onClose} />
          </header>
          <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
            {day.orders.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => onOpenOrder(order)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-brand/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {order.cliente?.nome || 'Cliente não informado'}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      OS #{order.numero}
                      {equipmentLine(order) ? ` · ${equipmentLine(order)}` : ''}
                    </span>
                  </span>
                  <OrderStatusBadge ordem={order} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardModal>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof User; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-hairline p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="mb-0.5 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">{label}</p>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  );
}

function Note({ icon: Icon, title, text }: { icon: typeof User; title: string; text: string }) {
  return (
    <section className="rounded-lg border border-hairline p-3">
      <h3 className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
      </h3>
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{text.trim()}</p>
    </section>
  );
}
