import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign,
  Clock3, ListChecks, MessageCircle, Plus, RefreshCw, Sparkles, TimerReset, TrendingUp,
  UserPlus, WalletCards, Wrench,
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

type DashboardMetric = {
  entregas_hoje: number;
  atrasadas: number;
  em_andamento: number;
  concluidas_mes: number;
};

type DashboardSummary = {
  generated_at: string;
  period: { today: string; month_start: string; month_end_exclusive: string };
  metrics: DashboardMetric;
  pipeline: { pendente: number; em_andamento: number; atraso: number; concluido_mes: number };
  financial: { recebido_mes: number; a_receber: number; a_receber_mes: number; vencido: number } | null;
  agenda: Array<{ id: string; numero: number; status: string; data_previsao: string; modelo?: string; cliente_nome: string; instrumento_nome: string; marca_nome?: string }>;
  priorities: Array<{ id: string; type: string; severity: 'danger' | 'warning' | 'info'; title: string; description: string; href: string }>;
  activity: Array<{ id: string; tipo: string; descricao: string; created_at: string; ordem_numero?: number }>;
};

const priorityTone = {
  danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
  info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300',
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
  const [showRecentActivity, setShowRecentActivity] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarOrders, setCalendarOrders] = useState<OrdemServico[]>([]);

  const loadSummary = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      setSummary(await apiRequest<DashboardSummary>('/api/dashboard/resumo'));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar a dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase.from('ordens_servico').select('*,cliente:clientes(*),instrumento:instrumentos(*),marca:marcas(*)').in('status', ['pendente', 'em_andamento', 'atraso']);
      if (error) throw error;
      setCalendarOrders(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar o calendário');
    } finally { setCalendarLoading(false); }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  async function toggleCalendar() {
    const next = !showCalendar;
    setShowCalendar(next);
    if (next && !calendarOrders.length) await loadCalendar();
  }

  const firstName = user?.user_metadata?.nome?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'Usuário';
  const isFinancial = can('financeiro.read') && Boolean(summary?.financial);
  const maxPipeline = useMemo(() => Math.max(1, ...(summary ? Object.values(summary.pipeline) : [1])), [summary]);
  const metrics = summary ? [
    { label: 'Entregas hoje', value: summary.metrics.entregas_hoje, detail: 'previsões para hoje', icon: CalendarDays, tone: 'blue', href: '/ordens?prazo=hoje' },
    { label: 'OS atrasadas', value: summary.metrics.atrasadas, detail: summary.metrics.atrasadas ? 'precisam de atenção' : 'operação em dia', icon: TimerReset, tone: 'rose', href: '/ordens?prazo=atraso' },
    { label: 'Em andamento', value: summary.metrics.em_andamento, detail: 'na bancada agora', icon: Wrench, tone: 'violet', href: '/ordens?status=em_andamento' },
    isFinancial
      ? { label: 'A receber', value: formatCurrency(summary.financial!.a_receber), detail: `${formatCurrency(summary.financial!.vencido)} vencido`, icon: WalletCards, tone: 'emerald', href: '/ordens?financeiro=aberto' }
      : { label: 'Concluídas no mês', value: summary.metrics.concluidas_mes, detail: 'entregas realizadas', icon: CheckCircle2, tone: 'emerald', href: '/ordens?status=concluido' },
  ] : [];
  const metricTones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  };

  if (loading && !summary) return <DashboardSkeleton />;

  return (
    <main className="responsive-page space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="flex items-center gap-2 text-sm font-semibold text-violet-600"><Sparkles className="h-4 w-4" /> Visão operacional</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">{greeting()}, {firstName}</h1><p className="mt-1 text-sm text-slate-500">Estas são as prioridades e entregas que exigem atenção hoje.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => void loadSummary(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar</button><button onClick={() => navigate('/clientes')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><UserPlus className="h-4 w-4" /> Clientes</button><button onClick={() => navigate('/conversas')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><MessageCircle className="h-4 w-4" /> Conversas</button><button onClick={() => navigate('/ordens/nova')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"><Plus className="h-4 w-4" /> Nova OS</button></div>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(({ label, value, detail, icon: Icon, tone, href }, index) => <motion.button key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} onClick={() => navigate(href)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-800"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div><div className={`rounded-xl p-2.5 ${metricTones[tone]}`}><Icon className="h-5 w-5" /></div></div><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 opacity-0 transition group-hover:opacity-100">Ver detalhes <ArrowRight className="h-3 w-3" /></span></motion.button>)}</section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <DashboardCard title="Precisa da sua atenção" subtitle="Ordenado por impacto operacional" icon={ListChecks} action={<button onClick={() => navigate('/ordens')} className="text-xs font-semibold text-violet-600">Ver todas as OS</button>}>
          {summary?.priorities.length ? <div className="space-y-2">{summary.priorities.map((item) => <button key={item.id} onClick={() => navigate(item.href)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-violet-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${priorityTone[item.severity]}`}><AlertCircle className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</span><span className="block truncate text-xs text-slate-500">{item.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-300" /></button>)}</div> : <EmptyPanel icon={CheckCircle2} title="Nenhuma prioridade crítica" description="A operação está em dia neste momento." />}
        </DashboardCard>

        <DashboardCard title="Próximas entregas" subtitle="Hoje e próximos 7 dias" icon={CalendarDays} action={<button onClick={() => navigate('/ordens')} className="text-xs font-semibold text-violet-600">Abrir ordens</button>}>
          {summary?.agenda.length ? <div className="space-y-1">{summary.agenda.slice(0, 7).map((item) => <button key={item.id} onClick={() => navigate(`/ordens/${item.id}/historico`)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"><div className="w-12 shrink-0 text-center"><p className="text-xs font-bold text-violet-600">{formatDateOnly(item.data_previsao).slice(0, 5)}</p></div><div className="min-w-0 flex-1 border-l border-slate-200 pl-3 dark:border-slate-700"><p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">OS #{item.numero} · {item.cliente_nome}</p><p className="truncate text-xs text-slate-500">{[item.instrumento_nome, item.marca_nome, item.modelo].filter(Boolean).join(' ')}</p></div></button>)}</div> : <EmptyPanel icon={CalendarDays} title="Agenda livre" description="Nenhuma entrega prevista nos próximos sete dias." />}
        </DashboardCard>
      </section>

      <section className={`grid gap-6 ${isFinancial ? 'xl:grid-cols-[1.2fr_0.8fr]' : ''}`}>
        <DashboardCard title="Pipeline das ordens" subtitle="Distribuição atual do trabalho" icon={TrendingUp}>
          <div className="space-y-4">{summary && ([['Pendente', summary.pipeline.pendente, 'bg-amber-500'], ['Em andamento', summary.pipeline.em_andamento, 'bg-violet-500'], ['Em atraso', summary.pipeline.atraso, 'bg-rose-500'], ['Concluídas no mês', summary.pipeline.concluido_mes, 'bg-emerald-500']] as const).map(([label, value, color]) => <button key={label} onClick={() => navigate(label === 'Em atraso' ? '/ordens?prazo=atraso' : `/ordens?status=${label === 'Pendente' ? 'pendente' : label === 'Em andamento' ? 'em_andamento' : 'concluido'}`)} className="block w-full text-left"><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-slate-600 dark:text-slate-300">{label}</span><strong className="text-slate-900 dark:text-white">{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value ? 6 : 0, (value / maxPipeline) * 100)}%` }} /></div></button>)}</div>
        </DashboardCard>
        {isFinancial && summary?.financial && <DashboardCard title="Financeiro" subtitle="Regime de caixa e vencimentos" icon={CircleDollarSign} action={<button onClick={() => navigate('/financeiro')} className="text-xs font-semibold text-violet-600">Abrir financeiro</button>}><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><FinancialLine label="Recebido no mês" value={summary.financial.recebido_mes} tone="text-emerald-600" /><FinancialLine label="A receber" value={summary.financial.a_receber} tone="text-violet-600" /><FinancialLine label="Saldo vencido" value={summary.financial.vencido} tone={summary.financial.vencido ? 'text-rose-600' : 'text-slate-500'} /></div></DashboardCard>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><button onClick={() => void toggleCalendar()} className="flex w-full items-center justify-between p-5 text-left"><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-950/40"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900 dark:text-white">Planejamento mensal</h2><p className="text-xs text-slate-500">Abra o calendário completo quando precisar reorganizar prazos.</p></div></div><ChevronDown className={`h-5 w-5 text-slate-400 transition ${showCalendar ? 'rotate-180' : ''}`} /></button>{showCalendar && <div className="border-t border-slate-200 p-4 dark:border-slate-800"><CustomCalendar orders={calendarOrders} loading={calendarLoading} onEventClick={(order) => alerts.orderDetails(order, () => { void loadCalendar(); void loadSummary(true); })} onUpdate={() => { void loadCalendar(); void loadSummary(true); }} /></div>}</section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={() => setShowRecentActivity((current) => !current)} className="flex w-full items-center justify-between p-5 text-left" aria-expanded={showRecentActivity}>
          <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-950/40"><Clock3 className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900 dark:text-white">Atividades recentes</h2><p className="text-xs text-slate-500">Atualizações de OS, mensagens e pagamentos.</p></div></div>
          <ChevronDown className={`h-5 w-5 text-slate-400 transition ${showRecentActivity ? 'rotate-180' : ''}`} />
        </button>
        {showRecentActivity && <div className="border-t border-slate-200 px-5 pb-2 dark:border-slate-800">{summary?.activity.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{summary.activity.slice(0, 8).map((item) => <div key={`${item.tipo}-${item.id}`} className="flex items-center gap-3 py-3"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.descricao}</p><p className="text-xs text-slate-400">{activityLabel(item.tipo)}{item.ordem_numero ? ` · OS #${item.ordem_numero}` : ''}</p></div><time className="shrink-0 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div>)}</div> : <EmptyPanel icon={Clock3} title="Sem atividade recente" description="As movimentações mais recentes aparecerão aqui." />}</div>}
      </section>
    </main>
  );
}

function DashboardCard({ title, subtitle, icon: Icon, action, children }: { title: string; subtitle: string; icon: typeof Wrench; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><header className="mb-4 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40"><Icon className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900 dark:text-white">{title}</h2><p className="text-xs text-slate-500">{subtitle}</p></div></div>{action}</header>{children}</section>;
}

function FinancialLine({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold ${tone}`}>{formatCurrency(value)}</p></div>;
}

function EmptyPanel({ icon: Icon, title, description }: { icon: typeof Wrench; title: string; description: string }) {
  return <div className="py-8 text-center"><Icon className="mx-auto mb-2 h-9 w-9 text-slate-300" /><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p><p className="mt-1 text-xs text-slate-400">{description}</p></div>;
}

function DashboardSkeleton() {
  return <main className="responsive-page animate-pulse space-y-6"><div className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-800" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div><div className="grid gap-6 xl:grid-cols-2"><div className="h-80 rounded-2xl bg-slate-200 dark:bg-slate-800" /><div className="h-80 rounded-2xl bg-slate-200 dark:bg-slate-800" /></div></main>;
}
