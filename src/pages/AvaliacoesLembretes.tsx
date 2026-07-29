/* The selection callback uses a concise conditional mutation before returning a cloned Set. */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, Calendar, CheckCircle2, ChevronDown, Clock, ExternalLink,
  MessageSquare, Pause, Phone, Play, RefreshCw, Search, Send, Settings,
  Star, Users, X, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useReminders } from '../contexts/ReminderContext';
import { EvaluationReminderService, PendingEvaluationOrder, EvaluationSettings } from '../utils/evaluation-reminder-service';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { apiRequest } from '../lib/api-client';

interface Stats {
  pendentes: number;
  enviados: number;
  total_clientes: number;
  clientes_avaliaram: number;
  erros: number;
}

interface HistoryItem {
  id: string;
  ordem_servico_id: string;
  status: 'enviado' | 'erro' | 'respondido';
  data_envio?: string;
  created_at: string;
  mensagem_erro?: string;
  cliente?: { id: string; nome: string; telefone: string; avaliou?: boolean };
  ordem_servico?: { id: string; numero: number; modelo?: string; data_entrega?: string; data_previsao?: string };
}

const emptyStats: Stats = { pendentes: 0, enviados: 0, total_clientes: 0, clientes_avaliaram: 0, erros: 0 };

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString('pt-BR');
}

function formatPhone(value?: string) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || '—';
}

export function AvaliacoesLembretes() {
  const navigate = useNavigate();
  const { isEnabled, lastProcessed, pendingOrders, enableAutomatic, disableAutomatic, refreshPending, sendSingle } = useReminders();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [settings, setSettings] = useState<EvaluationSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [sendingId, setSendingId] = useState('');
  const [search, setSearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'todos' | 'enviado' | 'respondido' | 'erro'>('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<PendingEvaluationOrder | null>(null);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [statsData, settingsData, historyData, connection] = await Promise.all([
        EvaluationReminderService.getStats(),
        EvaluationReminderService.getSettings(),
        EvaluationReminderService.getEvaluationHistory(),
        apiRequest<{ status: string }>('/api/whatsapp/connection').catch(() => ({ status: 'desconectado' })),
      ]);
      setStats(statsData);
      setSettings(settingsData);
      setHistory(historyData as HistoryItem[]);
      setWhatsappConnected(connection.status === 'conectado');
      await refreshPending();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar as avaliações');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshPending]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const available = new Set(pendingOrders.map((order) => order.ordem_id));
    setSelectedIds((current) => new Set([...current].filter((id) => available.has(id))));
  }, [pendingOrders]);

  const filteredPending = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pendingOrders.filter((order) => !term || [order.cliente_nome, order.cliente_telefone, order.ordem_numero, order.instrumento_nome, order.marca_nome, order.modelo].join(' ').toLowerCase().includes(term));
  }, [pendingOrders, search]);

  const filteredHistory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return history.filter((item) => {
      if (historyStatus !== 'todos' && item.status !== historyStatus) return false;
      return !term || [item.cliente?.nome, item.cliente?.telefone, item.ordem_servico?.numero, item.ordem_servico?.modelo].join(' ').toLowerCase().includes(term);
    });
  }, [history, historyStatus, search]);

  const selectedOrders = pendingOrders.filter((order) => selectedIds.has(order.ordem_id));
  const evaluatedRate = stats.total_clientes ? Math.round((stats.clientes_avaliaram / stats.total_clientes) * 100) : 0;
  const allVisibleSelected = filteredPending.length > 0 && filteredPending.every((order) => selectedIds.has(order.ordem_id));

  async function toggleAutomatic() {
    try {
      if (isEnabled) await disableAutomatic(); else await enableAutomatic();
      toast.success(isEnabled ? 'Automação desativada' : 'Automação ativada');
    } catch { toast.error('A configuração não foi salva. O estado anterior foi restaurado.'); }
  }

  async function sendOne(order: PendingEvaluationOrder) {
    if (!whatsappConnected) return toast.error('Conecte o WhatsApp antes de enviar');
    setSendingId(order.ordem_id);
    try {
      const success = await sendSingle(order);
      if (!success) throw new Error('O provedor não confirmou o envio');
      toast.success(`Solicitação enviada para ${order.cliente_nome}`);
      await loadData(true);
    } catch (error: any) { toast.error(error.message || 'Falha no envio'); }
    finally { setSendingId(''); }
  }

  async function sendSelected() {
    if (!whatsappConnected) return toast.error('Conecte o WhatsApp antes de enviar');
    if (!selectedOrders.length) return toast.info('Selecione ao menos um cliente');
    const allowed = Math.min(selectedOrders.length, settings?.daily_limit || selectedOrders.length);
    const confirmation = await alerts.confirm({
      title: `Enviar para ${allowed} cliente${allowed > 1 ? 's' : ''}?`,
      text: `Os envios respeitarão o intervalo de ${settings?.min_interval_seconds || 20}s e o limite diário de ${settings?.daily_limit || 20}. Não feche esta página durante o processamento.`,
      icon: 'question',
      confirmButtonText: 'Confirmar envios',
      cancelButtonText: 'Revisar seleção',
    });
    if (!confirmation.isConfirmed) return;
    setBatchBusy(true);
    try {
      const result = await EvaluationReminderService.sendSelectedEvaluations(selectedOrders);
      if (result.errors) toast.error(`${result.sent} enviado(s) e ${result.errors} com erro`);
      else toast.success(`${result.sent} solicitação(ões) enviada(s)`);
      setSelectedIds(new Set());
      await loadData(true);
    } catch (error: any) { toast.error(error.message || 'Falha no processamento'); }
    finally { setBatchBusy(false); }
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredPending.forEach((order) => allVisibleSelected ? next.delete(order.ordem_id) : next.add(order.ordem_id));
      return next;
    });
  }

  const metricCards = [
    { label: 'Na fila', value: stats.pendentes, detail: 'clientes únicos', icon: Clock, tone: 'amber' },
    { label: 'Solicitações enviadas', value: stats.enviados, detail: 'histórico total', icon: CheckCircle2, tone: 'emerald' },
    { label: 'Clientes avaliados', value: stats.clientes_avaliaram, detail: `${evaluatedRate}% de ${stats.total_clientes} clientes`, icon: Star, tone: 'violet' },
    { label: 'Envios com erro', value: stats.erros, detail: stats.erros ? 'exigem revisão' : 'nenhuma pendência', icon: AlertCircle, tone: 'rose' },
  ];
  const tones: Record<string, string> = { amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40', emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40', violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40', rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' };

  return (
    <PageContainer title="Avaliações e relacionamento" description="Acompanhe retornos, avaliações e ações que fortalecem a confiança do cliente." eyebrow="Experiência do cliente" icon={Star}>
      <section className={`mb-6 overflow-hidden rounded-2xl border ${isEnabled ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3"><div className={`rounded-xl p-3 ${isEnabled ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{isEnabled ? <Zap className="h-6 w-6" /> : <Pause className="h-6 w-6" />}</div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-950 dark:text-white">Automação de avaliações</h2><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>{isEnabled ? 'Ativa' : 'Pausada'}</span></div><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{isEnabled ? `Próxima execução diária às ${settings?.trigger_hour ?? 11}h · clientes com OS concluída há ${settings?.days_after_completion ?? 7}+ dias` : 'A fila continuará disponível para envios manuais.'}</p><p className="mt-1 text-xs text-slate-500">{lastProcessed ? `Última execução manual: ${lastProcessed.toLocaleString('pt-BR')}` : 'Nenhuma execução manual nesta sessão'}</p></div></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => void loadData(true)} disabled={refreshing} icon={RefreshCw}>{refreshing ? 'Atualizando' : 'Atualizar'}</Button><Button variant="secondary" size="sm" onClick={() => setShowSettings((value) => !value)} icon={Settings}>Regras</Button><Button variant={isEnabled ? 'secondary' : 'success'} size="sm" onClick={() => void toggleAutomatic()} icon={isEnabled ? Pause : Play}>{isEnabled ? 'Pausar' : 'Ativar'}</Button></div>
        </div>
        <AnimatePresence>{showSettings && settings && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-emerald-200/70 dark:border-emerald-900"><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">{[['Espera após conclusão', `${settings.days_after_completion} dias`], ['Horário', `${settings.trigger_hour}h`], ['Limite diário', `${settings.daily_limit} envios`], ['Intervalo', `${settings.min_interval_seconds}s`], ['Instagram', settings.instagram_handle]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-5"><a href={settings.google_review_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600">Validar link de avaliação <ExternalLink className="h-4 w-4" /></a><button onClick={() => navigate('/configuracoes')} className="text-sm font-semibold text-violet-600">Editar configurações da empresa</button></div></motion.div>}</AnimatePresence>
      </section>

      {whatsappConnected === false && <div className="mb-6 flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center"><div className="flex gap-3"><AlertCircle className="h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-sm font-semibold text-amber-900">WhatsApp desconectado</p><p className="text-xs text-amber-700">Os envios estão bloqueados para evitar registros inconsistentes.</p></div></div><Button size="sm" variant="secondary" onClick={() => navigate('/configuracoes-whatsapp')}>Reconectar</Button></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{metricCards.map(({ label, value, detail, icon: Icon, tone }) => <Card key={label} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{loading ? '—' : value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div><div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div></div></Card>)}</div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"><button onClick={() => setActiveTab('pending')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === 'pending' ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}>Fila <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs">{pendingOrders.length}</span></button><button onClick={() => setActiveTab('history')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === 'history' ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}>Histórico <span className="ml-1 text-xs">{history.length}</span></button></div><div className="flex flex-1 flex-col gap-2 sm:flex-row xl:max-w-2xl"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone, OS ou instrumento" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></div>{activeTab === 'history' && <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as typeof historyStatus)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="todos">Todos os status</option><option value="enviado">Enviados</option><option value="respondido">Respondidos</option><option value="erro">Com erro</option></select>}</div></div></div>

        {activeTab === 'pending' ? <>
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="h-4 w-4 rounded border-slate-300 text-violet-600" />Selecionar resultados ({filteredPending.length})</label><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{selectedOrders.length} selecionado(s)</span><Button size="sm" onClick={() => void sendSelected()} disabled={!selectedOrders.length || batchBusy || !whatsappConnected} loading={batchBusy} icon={Send}>Enviar selecionados</Button></div></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">{loading ? <EmptyState icon={RefreshCw} title="Carregando fila…" spinning /> : filteredPending.length === 0 ? <EmptyState icon={CheckCircle2} title={search ? 'Nenhum resultado encontrado' : 'Tudo em dia'} description={search ? 'Tente outro termo de busca.' : 'Nenhum cliente elegível aguarda solicitação.'} /> : filteredPending.map((order) => <div key={order.ordem_id} className="grid gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:grid-cols-[auto_1fr_auto] sm:items-center"><input type="checkbox" checked={selectedIds.has(order.ordem_id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(order.ordem_id) ? next.delete(order.ordem_id) : next.add(order.ordem_id); return next; })} className="h-4 w-4 rounded border-slate-300 text-violet-600" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{order.cliente_nome}</h3><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{order.dias_desde_conclusao} dias</span><span className="text-xs font-medium text-slate-400">OS #{order.ordem_numero}</span></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{[order.instrumento_nome, order.marca_nome, order.modelo].filter(Boolean).join(' ')}</span><span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{formatPhone(order.cliente_telefone)}</span><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Concluída em {formatDate(order.data_conclusao)}</span></div></div><div className="flex gap-2 sm:justify-end"><Button variant="ghost" size="sm" onClick={() => setPreviewOrder(order)}>Prévia</Button><Button size="sm" onClick={() => void sendOne(order)} disabled={sendingId === order.ordem_id || batchBusy || !whatsappConnected} loading={sendingId === order.ordem_id} icon={Send}>Enviar</Button></div></div>)}</div>
        </> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{filteredHistory.length === 0 ? <EmptyState icon={MessageSquare} title="Nenhum registro encontrado" description="O histórico de envios e erros aparecerá aqui." /> : filteredHistory.map((item) => { const isError = item.status === 'erro'; const retryOrder = pendingOrders.find((order) => order.ordem_id === item.ordem_servico_id); return <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{item.cliente?.nome || 'Cliente'}</h3><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isError ? 'bg-rose-100 text-rose-700' : item.status === 'respondido' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{isError ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{item.status}</span><span className="text-xs text-slate-400">OS #{item.ordem_servico?.numero || '—'}</span></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{item.ordem_servico?.modelo || 'Serviço concluído'}</span><span>{formatPhone(item.cliente?.telefone)}</span><span>{formatDate(item.data_envio || item.created_at)}</span></div>{item.mensagem_erro && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{item.mensagem_erro}</p>}</div><div className="flex gap-2">{isError && retryOrder && <Button size="sm" variant="secondary" onClick={() => void sendOne(retryOrder)} icon={RefreshCw}>Tentar novamente</Button>}<Button size="sm" variant="ghost" onClick={() => navigate('/conversas')} icon={MessageSquare}>Conversas</Button></div></div>; })}</div>}
      </Card>

      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-700 dark:text-slate-200">Como a fila é formada e protegida contra duplicidade <ChevronDown className="h-4 w-4" /></summary><div className="mt-3 grid gap-2 text-slate-500 sm:grid-cols-2"><p>• Considera OS concluídas há pelo menos {settings?.days_after_completion ?? 7} dias.</p><p>• Mantém somente uma solicitação pendente por cliente.</p><p>• Ignora clientes já marcados como avaliados.</p><p>• Registra tentativas, erros e envios para auditoria.</p></div></details>

      <AnimatePresence>{previewOrder && settings && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between"><div><h2 className="font-bold text-slate-950 dark:text-white">Prévia da mensagem</h2><p className="text-sm text-slate-500">{previewOrder.cliente_nome} · {formatPhone(previewOrder.cliente_telefone)}</p></div><button onClick={() => setPreviewOrder(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="my-4 whitespace-pre-wrap rounded-2xl bg-emerald-50 p-4 text-sm text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200">{EvaluationReminderService.buildEvaluationMessagePreview(previewOrder, settings)}</div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPreviewOrder(null)}>Fechar</Button><Button disabled={!whatsappConnected} onClick={() => { const order = previewOrder; setPreviewOrder(null); void sendOne(order); }} icon={Send}>Enviar agora</Button></div></motion.div></div>}</AnimatePresence>
    </PageContainer>
  );
}

function EmptyState({ icon: Icon, title, description, spinning = false }: { icon: typeof Users; title: string; description?: string; spinning?: boolean }) {
  return <div className="p-10 text-center"><Icon className={`mx-auto mb-3 h-10 w-10 text-slate-300 ${spinning ? 'animate-spin' : ''}`} /><h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>;
}
