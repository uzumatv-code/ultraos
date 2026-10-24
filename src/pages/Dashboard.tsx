/**
 * Painel operacional.
 *
 * Responde, nesta ordem, às perguntas de quem abre o sistema:
 *   1. existe algum problema? → faixa de status no topo;
 *   2. o que preciso fazer agora? → "Precisa de você", no trilho da direita;
 *   3. o que tenho agendado? → agenda (7 dias ou mês), a peça central;
 *   4. como resolvo rápido? → Ultra IA, sempre à mão no trilho;
 * e, abaixo, a leitura da operação: bancada, caixa e atividade.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Hourglass,
  MessageCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  TimerReset,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useLiveRefresh } from '../lib/live-events';
import { apiRequest } from '../lib/api-client';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatters';
import { parseLocalDate, toDateOnly, todayLocalDate } from '../utils/dates';
import { toast } from '../components/ToastCustom';
import { AssistantChat } from '../components/AssistantChat';
import { LiveBadge } from '../components/LiveBadge';
import { AgendaBoard, type AgendaView } from '../components/dashboard/AgendaBoard';
import { DayOrdersModal, OrderQuickView } from '../components/dashboard/OrderQuickView';
import { rescheduleOrder } from '../components/dashboard/order-actions';
import { orderStatusLabel, orderStatusTone } from '../components/ui/status';
import { Skeleton, UIButton, type Tone } from '../components/ui';
import type { OrdemServico } from '../types/database';

type Priority = {
  id: string;
  type: string;
  severity: 'danger' | 'warning' | 'info';
  title: string;
  description: string;
  href: string;
};
type Activity = {
  id: string;
  tipo: string;
  descricao: string;
  created_at: string;
  ordem_numero?: number;
};

type DashboardSummary = {
  generated_at: string;
  period: { today: string; month_start: string; month_end_exclusive: string };
  metrics: {
    entregas_hoje: number;
    atrasadas: number;
    em_andamento: number;
    concluidas_mes: number;
  };
  pipeline: {
    pendente: number;
    em_andamento: number;
    atraso: number;
    concluido_mes: number;
  };
  financial: {
    recebido_mes: number;
    a_receber: number;
    a_receber_mes: number;
    vencido: number;
  } | null;
  agenda: Array<{
    id: string;
    numero: number;
    status: string;
    data_previsao: string;
    modelo?: string;
    cliente_nome: string;
    instrumento_nome: string;
    marca_nome?: string;
  }>;
  priorities: Priority[];
  activity: Activity[];
};

const AGENDA_VIEW_KEY = 'ultra.dashboard.agenda';
/** Com a IA no trilho, a fila cede espaço a ela; sem a IA, mostra mais itens. */
const QUEUE_LIMIT = { withAssistant: 3, alone: 6 };
const ACTIVITY_LIMIT = 6;
const ACTIVE_STATUSES = ['pendente', 'em_andamento', 'atraso'] as const;

const priorityIcon: Record<string, LucideIcon> = {
  ordem_atrasada: TimerReset,
  aditivos: FileText,
  mensagens: MessageCircle,
  financeiro_vencido: Wallet,
  avaliacoes: Star,
};

const statusHint: Record<(typeof ACTIVE_STATUSES)[number], string> = {
  pendente: 'aguardando início',
  em_andamento: 'na bancada',
  atraso: 'contratempo',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function headline(metrics?: DashboardSummary['metrics']) {
  if (!metrics) return '';
  const late = metrics.atrasadas ? plural(metrics.atrasadas, 'ordem fora do prazo', 'ordens fora do prazo') : '';
  const today = metrics.entregas_hoje ? plural(metrics.entregas_hoje, 'entrega prevista para hoje', 'entregas previstas para hoje') : '';
  if (late && today) return `Você tem ${late} e ${today}.`;
  if (late) return `Você tem ${late}. Resolva antes de puxar serviço novo.`;
  if (today) return `${today[0].toUpperCase()}${today.slice(1)} e nada fora do prazo.`;
  return 'Nada fora do prazo e nenhuma entrega para hoje. Bom momento para adiantar a fila.';
}

/** O servidor manda datas ISO no texto das pendências; na tela elas viram dd/mm. */
function readableDates(text: string) {
  return text.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, _year, month, day) => `${day}/${month}`);
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 12) return `há ${Math.round(minutes / 60)} h`;
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (toDateOnly(date) === todayLocalDate()) return `hoje, ${time}`;
  if (toDateOnly(date) === toDateOnly(yesterday)) return `ontem, ${time}`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysSince(dateOnly: string) {
  const start = parseLocalDate(dateOnly);
  const today = parseLocalDate(todayLocalDate());
  if (!start || !today) return 0;
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86_400_000));
}

function activityMeta(item: Activity): {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  text: string;
  href: string;
} {
  const os = item.ordem_numero ? ` · OS #${item.ordem_numero}` : '';
  const orderHref = item.ordem_numero ? `/ordens?q=${item.ordem_numero}` : '/ordens';
  if (item.tipo.includes('mensagem'))
    return {
      icon: MessageCircle,
      tone: 'info',
      label: 'Mensagem',
      text: `${item.descricao}${os}`,
      href: '/conversas',
    };
  if (item.tipo.includes('pagamento')) {
    const amount = Number(item.descricao.match(/R\$\s*([\d.]+)/)?.[1]);
    const text = Number.isFinite(amount) ? `Pagamento recebido · ${formatCurrency(amount)}` : item.descricao;
    return {
      icon: Wallet,
      tone: 'success',
      label: 'Financeiro',
      text: `${text}${os}`,
      href: '/financeiro',
    };
  }
  if (item.tipo.includes('aditivo'))
    return {
      icon: FileText,
      tone: 'brand',
      label: 'Aditivo',
      text: `${item.descricao}${os}`,
      href: orderHref,
    };
  if (item.tipo.includes('ocorrencia'))
    return {
      icon: AlertTriangle,
      tone: 'warning',
      label: 'Ocorrência',
      text: `${item.descricao}${os}`,
      href: orderHref,
    };
  return {
    icon: ClipboardList,
    tone: 'neutral',
    label: 'Ordem',
    text: `${item.descricao}${os}`,
    href: orderHref,
  };
}

function readAgendaView(): AgendaView {
  try {
    return localStorage.getItem(AGENDA_VIEW_KEY) === 'mes' ? 'mes' : 'semana';
  } catch {
    return 'semana';
  }
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, can, role } = useAuth();
  const isAdmin = role === 'admin';

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrdemServico[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [agendaView, setAgendaView] = useState<AgendaView>(readAgendaView);
  const [quickOrder, setQuickOrder] = useState<OrdemServico | null>(null);
  const [day, setDay] = useState<{
    date: string;
    orders: OrdemServico[];
  } | null>(null);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);

  const loadSummary = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      setSummary(await apiRequest<DashboardSummary>('/api/dashboard/resumo'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o painel');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /** OS abertas com cliente e equipamento — alimentam a agenda e a bancada. */
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*,cliente:clientes(*),instrumento:instrumentos(*),marca:marcas(*)')
        .in('status', [...ACTIVE_STATUSES]);
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a agenda');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    void loadSummary(true);
    void loadOrders();
  }, [loadSummary, loadOrders]);

  useEffect(() => {
    void loadSummary();
    void loadOrders();
  }, [loadSummary, loadOrders]);

  useLiveRefresh(['ordens'], reload);
  useLiveRefresh(['financeiro'], () => void loadSummary(true));

  function changeAgendaView(view: AgendaView) {
    setAgendaView(view);
    try {
      localStorage.setItem(AGENDA_VIEW_KEY, view);
    } catch {
      /* preferência é só conveniência */
    }
  }

  async function handleReschedule(order: OrdemServico, date: string) {
    if (await rescheduleOrder(order, date)) reload();
  }

  function askAssistant(text: string) {
    setSeed({ text, nonce: Date.now() });
    document.getElementById('ultra-ia')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const metrics = summary?.metrics;
  const financial = can('financeiro.read') ? (summary?.financial ?? null) : null;
  const priorities = summary?.priorities ?? [];
  const firstName = user?.user_metadata?.nome?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'por aqui';

  /* Bancada: contagem por status real (sem sobreposição) e quanto disso já venceu. */
  const bench = useMemo(() => {
    const today = todayLocalDate();
    const rows = ACTIVE_STATUSES.map((status) => {
      const list = orders.filter((order) => order.status === status);
      return {
        status,
        count: list.length,
        late: list.filter((order) => {
          const due = toDateOnly(order.data_previsao);
          return due && due < today;
        }).length,
      };
    });
    const waiting = orders
      .filter((order) => order.status === 'pendente' && toDateOnly(order.data_entrada))
      .sort((a, b) => toDateOnly(a.data_entrada).localeCompare(toDateOnly(b.data_entrada)))[0];
    return { rows, total: orders.length, oldest: waiting ?? null };
  }, [orders]);

  /* Atalhos da IA ligados ao que está pendente agora. */
  const suggestions = useMemo(() => {
    const list: string[] = [];
    if (metrics?.atrasadas) list.push('Quais ordens estão atrasadas?');
    if (metrics?.entregas_hoje) list.push('Quais ordens saem hoje?');
    list.push('Quanto entrou hoje?', 'Quais contas vencem esta semana?', 'Resumo do mês', 'Quais ordens estão abertas?');
    return list.slice(0, 4);
  }, [metrics?.atrasadas, metrics?.entregas_hoje]);

  if (loading && !summary) return <DashboardSkeleton withAssistant={isAdmin} />;

  const queueLimit = isAdmin ? QUEUE_LIMIT.withAssistant : QUEUE_LIMIT.alone;
  const visibleQueue = queueExpanded ? priorities : priorities.slice(0, queueLimit);
  const activity = (summary?.activity ?? []).slice(0, ACTIVITY_LIMIT);
  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  return (
    <main className="ui-page">
      <div className="dash-layout">
        <div className="dash-main">
          <div className="dash-head">
            <header>
              <div className="min-w-0">
                <p className="dash-eyebrow first-letter:uppercase">
                  {new Date().toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                  })}
                </p>
                <h1 className="mt-1 font-display text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[1.85rem]">
                  {greeting()}, {firstName}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-ink-muted">{headline(metrics)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <LiveBadge />
                <UIButton
                  variant="ghost"
                  size="sm"
                  icon={RefreshCw}
                  loading={refreshing}
                  onClick={reload}
                  aria-label="Atualizar painel"
                  title="Atualizar painel"
                />
                <UIButton variant="primary" size="sm" icon={Plus} onClick={() => navigate('/ordens/nova')}>
                  Nova ordem
                </UIButton>
              </div>
            </header>
          </div>

          {/* 1 · Existe algum problema? */}
          <div className="dash-pulse-wrap order-1 xl:order-none">
            <section className="dash-pulse" aria-label="Status da operação">
              <PulseItem
                label="Fora do prazo"
                value={metrics?.atrasadas ?? 0}
                context={metrics?.atrasadas ? 'Vencido ou contratempo' : 'Tudo dentro do prazo'}
                tone="danger"
                alert={Boolean(metrics?.atrasadas)}
                onClick={() => navigate('/ordens?prazo=atraso')}
              />
              <PulseItem
                label="Entregas hoje"
                value={metrics?.entregas_hoje ?? 0}
                context="Previstas para hoje"
                tone="info"
                onClick={() => navigate('/ordens?prazo=hoje')}
              />
              <PulseItem
                label="Na bancada"
                value={metrics?.em_andamento ?? 0}
                context="Em andamento agora"
                tone="info"
                onClick={() => navigate('/ordens?status=em_andamento')}
              />
              {financial ? (
                <PulseItem
                  label="A receber"
                  value={formatCurrency(financial.a_receber)}
                  context={financial.vencido ? `${formatCurrency(financial.vencido)} vencido` : 'Nada vencido'}
                  tone="warning"
                  alert={financial.vencido > 0}
                  onClick={() => navigate('/financeiro')}
                />
              ) : (
                <PulseItem
                  label="Concluídas no mês"
                  value={metrics?.concluidas_mes ?? 0}
                  context="Serviços entregues"
                  tone="success"
                  onClick={() => navigate('/ordens?status=concluido')}
                />
              )}
            </section>
          </div>

          {/* 3 · O que tenho agendado? */}
          <div className="order-3 xl:order-none">
            <AgendaBoard
              orders={orders}
              loading={ordersLoading}
              view={agendaView}
              onViewChange={changeAgendaView}
              onOpenOrder={setQuickOrder}
              onOpenDay={(date, list) => setDay({ date, orders: list })}
              onReschedule={(order, date) => void handleReschedule(order, date)}
            />
          </div>

          {/* Leitura da operação */}
          <div className="order-5 grid gap-4 md:grid-cols-2 xl:order-none 2xl:grid-cols-3">
            <section className="ui-panel ui-panel-flush flex flex-col" aria-labelledby="bench-title">
              <SectionHeader
                id="bench-title"
                title="Bancada"
                subtitle={`${plural(bench.total, 'ordem aberta', 'ordens abertas')}`}
                action={{
                  label: 'Quadro',
                  onClick: () => navigate('/ordens?view=bancada'),
                }}
              />
              <div className="px-4 pt-4 sm:px-5">
                <div className="dash-stack" role="img" aria-label="Distribuição das ordens abertas por status">
                  {bench.rows.map((row) =>
                    row.count ? <span key={row.status} data-tone={orderStatusTone(row.status)} style={{ flexGrow: row.count }} /> : null,
                  )}
                </div>
              </div>
              <ul className="py-2">
                {bench.rows.map((row) => (
                  <li key={row.status}>
                    <button type="button" className="dash-row py-2" onClick={() => navigate(`/ordens?status=${row.status}`)}>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--tone))]" data-tone={orderStatusTone(row.status)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-ink">{orderStatusLabel(row.status)}</span>
                        <span className="text-xs text-ink-subtle"> · {statusHint[row.status]}</span>
                        {row.late > 0 && (
                          <span className="block text-xs text-signal-danger">{plural(row.late, 'com prazo vencido', 'com prazo vencido')}</span>
                        )}
                      </span>
                      <strong className="font-display text-base font-semibold tabular-nums text-ink">{row.count}</strong>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-auto space-y-2 border-t border-hairline px-4 py-3 text-xs sm:px-5">
                {bench.oldest && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left text-ink-muted transition hover:text-ink"
                    onClick={() => setQuickOrder(bench.oldest)}
                  >
                    <Hourglass className="h-3.5 w-3.5 shrink-0 text-signal-warning" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      Esperando há mais tempo: <strong className="font-semibold text-ink">OS #{bench.oldest.numero}</strong>
                      {bench.oldest.cliente?.nome ? ` · ${bench.oldest.cliente.nome}` : ''}
                    </span>
                    <span className="shrink-0 tabular-nums">{plural(daysSince(toDateOnly(bench.oldest.data_entrada)), 'dia', 'dias')}</span>
                  </button>
                )}
                <p className="flex items-center gap-2 text-ink-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-signal-success" aria-hidden />
                  <span className="flex-1">Concluídas em {monthName}</span>
                  <strong className="tabular-nums text-ink">{metrics?.concluidas_mes ?? 0}</strong>
                </p>
              </div>
            </section>

            {financial && <CashPanel financial={financial} monthName={monthName} onOpen={() => navigate('/financeiro')} />}

            <section
              className={`ui-panel ui-panel-flush flex flex-col ${financial ? 'md:col-span-2 2xl:col-span-1' : ''}`}
              aria-labelledby="activity-title"
            >
              <SectionHeader id="activity-title" title="Atividade recente" subtitle="Pagamentos, mensagens e alterações em OS" />
              {activity.length ? (
                <ul className="py-1.5">
                  {activity.map((item) => {
                    const meta = activityMeta(item);
                    const Icon = meta.icon;
                    return (
                      <li key={`${item.tipo}-${item.id}`}>
                        <button type="button" className="dash-row" onClick={() => navigate(meta.href)}>
                          <span className="dash-sev" data-tone={meta.tone} aria-hidden>
                            <Icon />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{meta.text}</span>
                            <span className="block text-2xs text-ink-subtle">{meta.label}</span>
                          </span>
                          <time className="shrink-0 text-2xs tabular-nums text-ink-subtle" dateTime={item.created_at}>
                            {relativeTime(item.created_at)}
                          </time>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-ink-subtle">As movimentações do dia aparecem aqui.</p>
              )}
            </section>
          </div>
        </div>

        <aside className="dash-rail" data-compact={!isAdmin || undefined} aria-label="Ações">
          {/* 2 · O que preciso fazer agora? */}
          <section
            className="ui-panel ui-panel-flush order-2 flex min-h-0 flex-col xl:order-none xl:max-h-[40%] xl:shrink-0"
            aria-labelledby="queue-title"
          >
            <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <h2 id="queue-title" className="dash-section-title">
                  Precisa de você
                </h2>
                {priorities.length > 0 && (
                  <span className="rounded-full bg-signal-danger/15 px-2 py-0.5 text-2xs font-bold tabular-nums text-signal-danger">
                    {priorities.length}
                  </span>
                )}
              </div>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm -mr-2" onClick={() => navigate('/ordens')}>
                Todas as OS
              </button>
            </header>
            {priorities.length ? (
              <>
                <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
                  {visibleQueue.map((item) => (
                    <PriorityRow
                      key={item.id}
                      item={item}
                      onOpen={() => {
                        const order = item.type === 'ordem_atrasada' ? orders.find((entry) => `ordem-${entry.id}` === item.id) : undefined;
                        if (order) setQuickOrder(order);
                        else navigate(item.href);
                      }}
                      onAsk={
                        isAdmin && item.type === 'ordem_atrasada'
                          ? () => askAssistant(`Me mostre a ${item.title.split(' em atraso')[0]} e o que falta para entregar`)
                          : undefined
                      }
                    />
                  ))}
                </ul>
                {priorities.length > queueLimit && (
                  <button
                    type="button"
                    className="shrink-0 border-t border-hairline px-5 py-2.5 text-left text-xs font-semibold text-ink-muted transition hover:text-ink"
                    onClick={() => setQueueExpanded((value) => !value)}
                  >
                    {queueExpanded ? 'Mostrar menos' : `Mostrar mais ${priorities.length - queueLimit}`}
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <span className="dash-sev" data-tone="success" aria-hidden>
                  <CheckCircle2 />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">Tudo em dia</p>
                  <p className="text-xs text-ink-muted">Nada vencido e nenhum cliente esperando resposta.</p>
                </div>
              </div>
            )}
          </section>

          {/* 4 · Como resolvo rápido? */}
          {isAdmin && (
            <div id="ultra-ia" className="order-4 flex min-h-0 flex-col xl:order-none xl:flex-1">
              <AssistantChat suggestions={suggestions} seed={seed} className="xl:flex-1" />
            </div>
          )}
        </aside>
      </div>

      <OrderQuickView
        order={quickOrder}
        onClose={() => setQuickOrder(null)}
        onChanged={reload}
        onOpenFull={(order) => navigate(`/ordens/${order.id}/historico`)}
      />
      <DayOrdersModal
        day={day}
        onClose={() => setDay(null)}
        onOpenOrder={(order) => {
          setDay(null);
          setQuickOrder(order);
        }}
      />
    </main>
  );
}

function PulseItem({
  label,
  value,
  context,
  tone,
  alert,
  onClick,
}: {
  label: string;
  value: ReactNode;
  context: string;
  tone: Tone;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="dash-pulse-item" data-tone={tone} data-alert={alert || undefined} onClick={onClick}>
      <span className="dash-eyebrow">{label}</span>
      <strong className="dash-pulse-value truncate">{value}</strong>
      <span className="truncate text-xs text-ink-muted">{context}</span>
    </button>
  );
}

function SectionHeader({
  id,
  title,
  subtitle,
  action,
}: {
  id: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 id={id} className="dash-section-title">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {action && (
        <UIButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={action.onClick} className="-mr-2">
          {action.label}
        </UIButton>
      )}
    </header>
  );
}

function PriorityRow({ item, onOpen, onAsk }: { item: Priority; onOpen: () => void; onAsk?: () => void }) {
  const Icon = priorityIcon[item.type] ?? AlertTriangle;
  return (
    <li className="dash-row py-0 pr-2 sm:pr-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
        <span className="dash-sev" data-tone={item.severity} aria-hidden>
          <Icon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
          <span className="block truncate text-xs text-ink-muted">{readableDates(item.description)}</span>
        </span>
      </button>
      {onAsk && (
        <button
          type="button"
          onClick={onAsk}
          className="app-icon-button h-8 w-8 hover:!text-brand-soft"
          aria-label="Perguntar à IA sobre esta OS"
          title="Perguntar à IA"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function CashPanel({
  financial,
  monthName,
  onOpen,
}: {
  financial: NonNullable<DashboardSummary['financial']>;
  monthName: string;
  onOpen: () => void;
}) {
  const expected = financial.recebido_mes + financial.a_receber_mes;
  const pct = expected > 0 ? Math.round((financial.recebido_mes / expected) * 100) : 0;
  return (
    <section className="ui-panel ui-panel-flush flex flex-col" aria-labelledby="cash-title">
      <SectionHeader id="cash-title" title="Caixa do mês" subtitle="Recebido, previsto e vencido" action={{ label: 'Financeiro', onClick: onOpen }} />
      <div className="px-4 pt-4 sm:px-5">
        <p className="dash-eyebrow">Recebido em {monthName}</p>
        <p className="mt-1 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {formatCurrency(financial.recebido_mes)}
        </p>
        {expected > 0 ? (
          <>
            <div className="dash-stack mt-4" role="img" aria-label={`${pct}% do previsto para o mês já recebido`}>
              {financial.recebido_mes > 0 && <span data-tone="success" style={{ flexGrow: financial.recebido_mes }} />}
              {financial.a_receber_mes > 0 && <span data-tone="info" className="opacity-60" style={{ flexGrow: financial.a_receber_mes }} />}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              <strong className="font-semibold text-ink">{pct}%</strong> do previsto para o mês ({formatCurrency(expected)})
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">Nenhum recebimento previsto para este mês.</p>
        )}
      </div>
      <dl className="mt-3 border-t border-hairline px-4 py-2 text-sm sm:px-5">
        <CashLine tone="info" label="A receber até o fim do mês" value={financial.a_receber_mes} />
        <CashLine tone={financial.vencido ? 'danger' : 'neutral'} label="Vencido" value={financial.vencido} strong={financial.vencido > 0} />
      </dl>
      <p className="mt-auto flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-xs text-ink-muted sm:px-5">
        Carteira total em aberto
        <strong className="tabular-nums text-ink">{formatCurrency(financial.a_receber)}</strong>
      </p>
    </section>
  );
}

function CashLine({ tone, label, value, strong }: { tone: Tone; label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--tone))]" data-tone={tone} aria-hidden />
      <dt className="flex-1 text-ink-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${strong ? 'text-signal-danger' : 'text-ink'}`}>{formatCurrency(value)}</dd>
    </div>
  );
}

function DashboardSkeleton({ withAssistant }: { withAssistant: boolean }) {
  return (
    <main className="ui-page">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="dash-layout">
        <div className="dash-main">
          <Skeleton className="h-[5.5rem]" />
          <Skeleton className="h-[30rem]" />
        </div>
        <div className="dash-rail" data-compact={!withAssistant || undefined}>
          <Skeleton className="h-48 shrink-0" />
          {withAssistant && <Skeleton className="h-[26rem] xl:h-auto xl:flex-1" />}
        </div>
      </div>
    </main>
  );
}
