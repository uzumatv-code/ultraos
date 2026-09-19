/**
 * Painel operacional.
 *
 * A hierarquia segue a ordem em que a oficina realmente decide o dia:
 *   1. o que está fora do prazo e custa dinheiro ou reputação;
 *   2. o que precisa sair hoje;
 *   3. como a bancada está distribuída;
 *   4. como o caixa reage a isso.
 * Planejamento mensal e histórico ficam recolhidos: são consulta, não decisão.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Clock3,
  ListChecks, MessageCircle, Plus, RefreshCw, TimerReset, TrendingUp, Wallet,
  Wrench, type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatDateOnly } from '../utils/formatters';
import { CustomCalendar } from '../components/CustomCalendar';
import { supabase } from '../lib/supabase';
import { alerts } from '../utils/alerts';
import { toast } from '../components/ToastCustom';
import type { OrdemServico } from '../types/database';
import {
  Badge, EmptyState, Kpi, Meter, Panel, Skeleton, UIButton, toneText, type Tone,
} from '../components/ui';

type DashboardSummary = {
  generated_at: string;
  period: { today: string; month_start: string; month_end_exclusive: string };
  metrics: { entregas_hoje: number; atrasadas: number; em_andamento: number; concluidas_mes: number };
  pipeline: { pendente: number; em_andamento: number; atraso: number; concluido_mes: number };
  financial: { recebido_mes: number; a_receber: number; a_receber_mes: number; vencido: number } | null;
  agenda: Array<{ id: string; numero: number; status: string; data_previsao: string; modelo?: string; cliente_nome: string; instrumento_nome: string; marca_nome?: string }>;
  priorities: Array<{ id: string; type: string; severity: 'danger' | 'warning' | 'info'; title: string; description: string; href: string }>;
  activity: Array<{ id: string; tipo: string; descricao: string; created_at: string; ordem_numero?: number }>;
};

const severityTone: Record<'danger' | 'warning' | 'info', Tone> = {
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function activityLabel(type: string) {
  if (type.includes('mensagem')) return 'Mensagem';
  if (type.includes('pagamento')) return 'Financeiro';
  if (type.includes('aditivo')) return 'Aditivo';
  if (type.includes('ocorrencia')) return 'Ocorrência';
  return 'Ordem de serviço';
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarOrders, setCalendarOrders] = useState<OrdemServico[]>([]);

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

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*,cliente:clientes(*),instrumento:instrumentos(*),marca:marcas(*)')
        .in('status', ['pendente', 'em_andamento', 'atraso']);
      if (error) throw error;
      setCalendarOrders(data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o calendário');
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function toggleCalendar() {
    const next = !showCalendar;
    setShowCalendar(next);
    if (next && !calendarOrders.length) await loadCalendar();
  }

  const firstName = user?.user_metadata?.nome?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'por aqui';
  const showFinance = can('financeiro.read') && Boolean(summary?.financial);
  const pipelineMax = useMemo(
    () => Math.max(1, ...(summary ? Object.values(summary.pipeline) : [1])),
    [summary],
  );

  if (loading && !summary) return <DashboardSkeleton />;

  const metrics = summary?.metrics;
  const financial = summary?.financial;

  return (
    <main className="ui-page space-y-5">
      <header className="ui-page-header">
        <div className="min-w-0">
          <p className="ui-page-eyebrow">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
          <h1 className="ui-page-title">
            {greeting()}, {firstName}
          </h1>
          <p className="ui-page-description">
            {metrics?.atrasadas
              ? `${metrics.atrasadas} ordem(ns) fora do prazo exigem decisão antes de qualquer outra coisa.`
              : 'Nenhuma ordem fora do prazo. A operação está em dia.'}
          </p>
        </div>
        <div className="ui-page-actions">
          <UIButton variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => void loadSummary(true)}>
            Atualizar
          </UIButton>
          <UIButton variant="secondary" size="sm" icon={MessageCircle} onClick={() => navigate('/conversas')}>
            Conversas
          </UIButton>
          <UIButton variant="primary" size="sm" icon={Plus} onClick={() => navigate('/ordens/nova')}>
            Nova ordem
          </UIButton>
        </div>
      </header>

      {/* Indicadores acionáveis — cada um leva à lista já filtrada. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Fora do prazo"
          value={metrics?.atrasadas ?? 0}
          context={metrics?.atrasadas ? 'Risco de atraso na entrega ao cliente' : 'Nenhuma pendência vencida'}
          icon={TimerReset}
          tone={metrics?.atrasadas ? 'danger' : 'success'}
          emphasis={Boolean(metrics?.atrasadas)}
          linkLabel={metrics?.atrasadas ? 'Resolver agora' : 'Ver ordens'}
          onClick={() => navigate('/ordens?prazo=atraso')}
        />
        <Kpi
          label="Entregas hoje"
          value={metrics?.entregas_hoje ?? 0}
          context="Previstas para sair até o fim do dia"
          icon={CalendarDays}
          tone="info"
          linkLabel="Abrir agenda"
          onClick={() => navigate('/ordens?prazo=hoje')}
        />
        <Kpi
          label="Na bancada"
          value={metrics?.em_andamento ?? 0}
          context="Serviços em execução neste momento"
          icon={Wrench}
          tone="brand"
          linkLabel="Acompanhar"
          onClick={() => navigate('/ordens?status=em_andamento')}
        />
        {showFinance && financial ? (
          <Kpi
            label="A receber"
            value={formatCurrency(financial.a_receber)}
            context={financial.vencido ? `${formatCurrency(financial.vencido)} já vencido` : 'Nada vencido no momento'}
            icon={Wallet}
            tone={financial.vencido ? 'warning' : 'success'}
            linkLabel="Abrir financeiro"
            onClick={() => navigate('/financeiro')}
          />
        ) : (
          <Kpi
            label="Concluídas no mês"
            value={metrics?.concluidas_mes ?? 0}
            context="Serviços entregues no período"
            icon={CheckCircle2}
            tone="success"
            linkLabel="Ver entregas"
            onClick={() => navigate('/ordens?status=concluido')}
          />
        )}
      </section>

      {/* Fila de decisão + agenda curta */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <Panel
          title="Precisa de você agora"
          subtitle="Ordenado por impacto na operação"
          icon={ListChecks}
          tone="danger"
          action={
            <UIButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/ordens')}>
              Todas as OS
            </UIButton>
          }
          flush
        >
          {summary?.priorities.length ? (
            <ul className="divide-y divide-hairline">
              {summary.priorities.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand/5 sm:px-5"
                  >
                    <span className={`shrink-0 ${toneText[severityTone[item.severity]]}`}>
                      <AlertOctagon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                      <span className="block truncate text-xs text-ink-muted">{item.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Nenhuma prioridade crítica"
              description="Nada vencido, nada aguardando resposta. Bom momento para adiantar a fila."
            />
          )}
        </Panel>

        <Panel title="Próximas entregas" subtitle="Hoje e próximos 7 dias" icon={CalendarDays} tone="info" flush>
          {summary?.agenda.length ? (
            <ul className="divide-y divide-hairline">
              {summary.agenda.slice(0, 7).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/ordens/${item.id}/historico`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-brand/5 sm:px-5"
                  >
                    <span className="w-11 shrink-0 text-center text-xs font-bold tabular-nums text-brand-soft">
                      {formatDateOnly(item.data_previsao).slice(0, 5)}
                    </span>
                    <span className="min-w-0 flex-1 border-l border-hairline pl-3">
                      <span className="block truncate text-sm font-medium text-ink">
                        OS #{item.numero} · {item.cliente_nome}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {[item.instrumento_nome, item.marca_nome, item.modelo].filter(Boolean).join(' ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarDays} title="Agenda livre" description="Nenhuma entrega prevista nos próximos sete dias." />
          )}
        </Panel>
      </section>

      {/* Pipeline + saúde do caixa */}
      <section className={`grid gap-4 ${showFinance ? 'xl:grid-cols-[1.2fr_0.8fr]' : ''}`}>
        <Panel title="Distribuição da bancada" subtitle="Onde o trabalho está parado" icon={TrendingUp}>
          <div className="space-y-3.5">
            {summary &&
              ([
                ['Pendente', summary.pipeline.pendente, 'warning', '/ordens?status=pendente'],
                ['Em andamento', summary.pipeline.em_andamento, 'brand', '/ordens?status=em_andamento'],
                ['Em atraso', summary.pipeline.atraso, 'danger', '/ordens?prazo=atraso'],
                ['Concluídas no mês', summary.pipeline.concluido_mes, 'success', '/ordens?status=concluido'],
              ] as Array<[string, number, Tone, string]>).map(([label, value, tone, href]) => (
                <button key={label} type="button" onClick={() => navigate(href)} className="block w-full text-left">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-muted">{label}</span>
                    <strong className="tabular-nums text-ink">{value}</strong>
                  </div>
                  <Meter value={value} max={pipelineMax} tone={tone} />
                </button>
              ))}
          </div>
        </Panel>

        {showFinance && financial && (
          <Panel
            title="Caixa do mês"
            subtitle="Recebido, previsto e vencido"
            icon={Wallet}
            tone="success"
            action={
              <UIButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/financeiro')}>
                Detalhar
              </UIButton>
            }
          >
            <div className="space-y-3">
              <FinanceLine label="Recebido no mês" value={financial.recebido_mes} tone="success" />
              <FinanceLine label="A receber no mês" value={financial.a_receber_mes} tone="info" />
              <FinanceLine label="Vencido" value={financial.vencido} tone={financial.vencido ? 'danger' : 'neutral'} />
              {financial.a_receber > 0 && (
                <p className="border-t border-hairline pt-3 text-xs text-ink-muted">
                  Carteira total em aberto: <strong className="tabular-nums text-ink">{formatCurrency(financial.a_receber)}</strong>
                </p>
              )}
            </div>
          </Panel>
        )}
      </section>

      {/* Consulta — recolhido por padrão */}
      <Disclosure
        open={showCalendar}
        onToggle={() => void toggleCalendar()}
        icon={CalendarDays}
        title="Planejamento mensal"
        subtitle="Abra o calendário quando precisar remanejar prazos."
      >
        <CustomCalendar
          orders={calendarOrders}
          loading={calendarLoading}
          onEventClick={(order) =>
            alerts.orderDetails(order, () => {
              void loadCalendar();
              void loadSummary(true);
            })
          }
          onUpdate={() => {
            void loadCalendar();
            void loadSummary(true);
          }}
        />
      </Disclosure>

      <Disclosure
        open={showActivity}
        onToggle={() => setShowActivity((value) => !value)}
        icon={Clock3}
        title="Atividade recente"
        subtitle="Alterações de OS, mensagens e pagamentos."
      >
        {summary?.activity.length ? (
          <ul className="divide-y divide-hairline">
            {summary.activity.slice(0, 8).map((item) => (
              <li key={`${item.tipo}-${item.id}`} className="flex items-center gap-3 py-2.5">
                <Badge tone="neutral">{activityLabel(item.tipo)}</Badge>
                <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                  {item.descricao}
                  {item.ordem_numero ? ` · OS #${item.ordem_numero}` : ''}
                </p>
                <time className="shrink-0 text-xs tabular-nums text-ink-subtle">
                  {new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Clock3} title="Sem atividade recente" description="As movimentações aparecerão aqui." />
        )}
      </Disclosure>
    </main>
  );
}

function FinanceLine({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md bg-surface-muted px-3 py-2.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <strong className={`text-base font-semibold tabular-nums ${tone === 'neutral' ? 'text-ink-muted' : toneText[tone]}`}>
        {formatCurrency(value)}
      </strong>
    </div>
  );
}

function Disclosure({
  open,
  onToggle,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ui-panel ui-panel-flush">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="ui-icon-tile ui-icon-tile-sm ui-tone-brand" aria-hidden>
            <Icon />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{title}</span>
            <span className="block truncate text-xs text-ink-muted">{subtitle}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-hairline p-4 sm:p-5">{children}</div>}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <main className="ui-page space-y-5">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.75fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </main>
  );
}
