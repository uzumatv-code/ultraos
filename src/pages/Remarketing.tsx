import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, Ban, CheckCircle2, ChevronDown, Clock3, MessageCircle,
  RefreshCw, Search, Send, Settings, ShieldCheck, Sparkles, UserCheck, Users, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import {
  RemarketingCampaign, RemarketingExcludedOrder, RemarketingHistoryItem, RemarketingOpportunity,
  RemarketingOverview, RemarketingService,
} from '../utils/remarketing-service';

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

function instrumentLabel(item: Pick<RemarketingOpportunity, 'instrumento_nome' | 'equipamento_nome' | 'marca_nome' | 'modelo'>) {
  return [item.instrumento_nome || item.equipamento_nome, item.marca_nome, item.modelo].filter(Boolean).join(' ') || 'Instrumento não informado';
}

const statusLabel: Record<string, string> = {
  processando: 'Processando', enviado: 'Enviado', respondido: 'Respondido', convertido: 'Convertido',
  descadastrado: 'Descadastrado', erro: 'Erro', cancelado: 'Cancelado',
};

const statusTone: Record<string, string> = {
  processando: 'bg-amber-100 text-amber-700', enviado: 'bg-sky-100 text-sky-700', respondido: 'bg-violet-100 text-violet-700',
  convertido: 'bg-emerald-100 text-emerald-700', descadastrado: 'bg-slate-200 text-slate-700', erro: 'bg-rose-100 text-rose-700',
  cancelado: 'bg-slate-100 text-slate-600',
};

export function Remarketing() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<RemarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'opportunities' | 'excluded' | 'history'>('opportunities');
  const [search, setSearch] = useState('');
  const [consentFilter, setConsentFilter] = useState<'todos' | 'autorizado' | 'nao_autorizado' | 'descadastrado'>('todos');
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<RemarketingCampaign | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [preview, setPreview] = useState<RemarketingOpportunity | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await RemarketingService.getOverview();
      setOverview(data);
      setDraft(data.campaign);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar a manutenção preventiva');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredOpportunities = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (overview?.opportunities || []).filter((item) => {
      if (consentFilter !== 'todos' && item.consentimento !== consentFilter) return false;
      return !term || [item.cliente_nome, item.cliente_telefone, item.ordem_numero, instrumentLabel(item)]
        .join(' ').toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [consentFilter, overview?.opportunities, search]);

  const filteredHistory = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (overview?.history || []).filter((item) => !term || [item.cliente_nome, item.cliente_telefone, item.ordem_numero, item.status, instrumentLabel(item)]
      .join(' ').toLocaleLowerCase('pt-BR').includes(term));
  }, [overview?.history, search]);

  const filteredExcluded = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (overview?.excluded || []).filter((item) => !term || [item.cliente_nome, item.cliente_telefone, item.ordem_numero, item.exclusion_reason, instrumentLabel(item)]
      .join(' ').toLocaleLowerCase('pt-BR').includes(term));
  }, [overview?.excluded, search]);

  async function saveSettings() {
    if (!draft) return;
    setSaving(true);
    try {
      await RemarketingService.saveSettings(draft);
      toast.success('Regras de manutenção preventiva atualizadas');
      setShowSettings(false);
      await load(true);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar as regras');
    } finally {
      setSaving(false);
    }
  }

  async function registerConsent(item: RemarketingOpportunity) {
    const confirmation = await alerts.confirm({
      title: 'Registrar autorização?',
      text: `Confirme somente se ${item.cliente_nome} autorizou receber lembretes de manutenção pelo WhatsApp. A data e a origem serão registradas para auditoria.`,
      icon: 'question',
      confirmButtonText: 'Confirmar autorização',
      cancelButtonText: 'Cancelar',
    });
    if (!confirmation.isConfirmed) return;
    setBusyId(item.cliente_id);
    try {
      await RemarketingService.setConsent(item.cliente_id, true);
      toast.success('Autorização registrada');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível registrar a autorização');
    } finally {
      setBusyId('');
    }
  }

  async function optOut(item: RemarketingOpportunity) {
    const confirmation = await alerts.confirm({
      title: 'Descadastrar cliente?',
      text: `${item.cliente_nome} não receberá novos lembretes de manutenção até que conceda uma nova autorização.`,
      icon: 'warning',
      confirmButtonText: 'Descadastrar',
      cancelButtonText: 'Manter autorização',
    });
    if (!confirmation.isConfirmed) return;
    setBusyId(item.cliente_id);
    try {
      await RemarketingService.setConsent(item.cliente_id, false, true);
      toast.success('Preferência de contato atualizada');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível atualizar a preferência');
    } finally {
      setBusyId('');
    }
  }

  async function send(item: RemarketingOpportunity) {
    if (!overview?.provider.manualSingleAllowed) return toast.error('Conecte o WhatsApp antes de enviar');
    if (item.consentimento !== 'autorizado') return toast.error('Registre a autorização do cliente antes do envio');
    const confirmation = await alerts.confirm({
      title: `Enviar para ${item.cliente_nome}?`,
      text: 'Este é um envio individual. O limite diário, o intervalo de segurança e o histórico do cliente serão verificados novamente pelo servidor.',
      icon: 'question',
      confirmButtonText: 'Enviar mensagem',
      cancelButtonText: 'Revisar',
    });
    if (!confirmation.isConfirmed) return;
    setBusyId(item.ordem_servico_id);
    try {
      await RemarketingService.send(item.ordem_servico_id);
      toast.success('Lembrete enviado e arquivado na conversa');
      setPreview(null);
      await load(true);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível enviar o lembrete');
    } finally {
      setBusyId('');
    }
  }

  const stats = overview?.stats || { elegiveis: 0, autorizados: 0, enviados: 0, respondidos: 0, convertidos: 0, erros: 0, descadastrados: 0 };
  const metrics = [
    { label: 'Oportunidades', value: stats.elegiveis, detail: `${stats.autorizados} autorizadas`, icon: Users, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Enviados', value: stats.enviados, detail: 'histórico total', icon: Send, tone: 'bg-sky-50 text-sky-600' },
    { label: 'Respostas', value: stats.respondidos, detail: 'clientes que retornaram', icon: MessageCircle, tone: 'bg-violet-50 text-violet-600' },
    { label: 'Conversões', value: stats.convertidos, detail: 'novas ordens vinculadas', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <PageContainer title="Manutenção preventiva" description="Identifique oportunidades, confirme consentimentos e execute o próximo contato." eyebrow="Relacionamento ativo" icon={Sparkles}>
      <section className={`mb-5 rounded-2xl border p-5 ${overview?.provider.manualSingleAllowed || overview?.provider.automaticAllowed ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'} dark:border-slate-800 dark:bg-slate-900`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-3 ${overview?.provider.manualSingleAllowed || overview?.provider.automaticAllowed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {overview?.provider.manualSingleAllowed || overview?.provider.automaticAllowed ? <ShieldCheck className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-slate-950 dark:text-white">Campanha de relacionamento</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${Number(overview?.campaign.ativo) ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {Number(overview?.campaign.ativo) ? 'Monitorando' : 'Pausada'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Instrumentos sem manutenção há {overview?.campaign.dias_sem_manutencao || 180}+ dias · envio com consentimento.
              </p>
              {overview?.provider.manualSingleAllowed && !overview.provider.automaticAllowed && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Evolution conectada: envios individuais e confirmados estão disponíveis. A automação em massa permanece desativada até a configuração do conector oficial.</p>}
              {!overview?.provider.manualSingleAllowed && !overview?.provider.automaticAllowed && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">WhatsApp indisponível para envios. Verifique a conexão para habilitar os envios individuais.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} disabled={refreshing} onClick={() => void load(true)}>{refreshing ? 'Atualizando' : 'Atualizar'}</Button>
            <Button variant="secondary" size="sm" icon={Settings} onClick={() => setShowSettings((value) => !value)}>Configurar regras</Button>
          </div>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => <Card key={label} className="p-4" hover={false}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{loading ? '—' : value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div></div>
        </Card>)}
      </div>

      <AnimatePresence>{showSettings && draft && <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
        <Card hover={false} className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-950 dark:text-white">Regras da campanha</h2><p className="text-sm text-slate-500">Os limites são validados novamente no servidor a cada envio.</p></div><button onClick={() => setShowSettings(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <NumberField label="Dias sem manutenção" value={draft.dias_sem_manutencao} min={30} max={1460} onChange={(value) => setDraft({ ...draft, dias_sem_manutencao: value })} />
            <NumberField label="Horário planejado" value={draft.horario_envio} min={0} max={23} onChange={(value) => setDraft({ ...draft, horario_envio: value })} />
            <NumberField label="Limite diário" value={draft.limite_diario} min={1} max={100} onChange={(value) => setDraft({ ...draft, limite_diario: value })} />
            <NumberField label="Intervalo entre envios (s)" value={draft.intervalo_minimo_segundos} min={30} max={3600} onChange={(value) => setDraft({ ...draft, intervalo_minimo_segundos: value })} />
            <NumberField label="Intervalo por cliente (dias)" value={draft.intervalo_cliente_dias} min={30} max={730} onChange={(value) => setDraft({ ...draft, intervalo_cliente_dias: value })} />
            <NumberField label="Máximo de tentativas" value={draft.max_tentativas} min={1} max={5} onChange={(value) => setDraft({ ...draft, max_tentativas: value })} />
          </div>
          <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Mensagem</span><textarea rows={7} value={draft.mensagem} onChange={(event) => setDraft({ ...draft, mensagem: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950" /><span className="mt-1 block text-xs text-slate-400">Variáveis: {'{{nome}}'}, {'{{cliente}}'}, {'{{instrumento}}'}, {'{{meses}}'} e {'{{dias}}'}.</span></label>
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input type="checkbox" checked={Boolean(Number(draft.ativo))} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} className="h-4 w-4 rounded text-violet-600" />Monitorar novas oportunidades</label>
            <Button onClick={() => void saveSettings()} loading={saving}>Salvar regras</Button>
          </div>
        </Card>
      </motion.section>}</AnimatePresence>

      <Card className="overflow-hidden" hover={false}>
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <TabButton active={activeTab === 'opportunities'} onClick={() => setActiveTab('opportunities')}>Oportunidades <span className="ml-1 text-xs">{overview?.opportunities.length || 0}</span></TabButton>
              <TabButton active={activeTab === 'excluded'} onClick={() => setActiveTab('excluded')}>Excluídas <span className="ml-1 text-xs">{overview?.excluded.length || 0}</span></TabButton>
              <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>Histórico <span className="ml-1 text-xs">{overview?.history.length || 0}</span></TabButton>
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row xl:max-w-2xl">
              <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone, OS ou instrumento" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></div>
              {activeTab === 'opportunities' && <select value={consentFilter} onChange={(event) => setConsentFilter(event.target.value as typeof consentFilter)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="todos">Todos os consentimentos</option><option value="autorizado">Autorizados</option><option value="nao_autorizado">Sem autorização</option><option value="descadastrado">Descadastrados</option></select>}
            </div>
          </div>
        </div>

        {activeTab === 'opportunities'
          ? <OpportunityList items={filteredOpportunities} loading={loading} busyId={busyId} providerReady={Boolean(overview?.provider.manualSingleAllowed)} onConsent={registerConsent} onOptOut={optOut} onPreview={setPreview} onSend={send} />
          : activeTab === 'excluded'
            ? <ExcludedList items={filteredExcluded} loading={loading} />
            : <HistoryList items={filteredHistory} loading={loading} onConversations={() => navigate('/conversas')} />}
      </Card>

      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-700 dark:text-slate-200">Como a fila é formada e protegida <ChevronDown className="h-4 w-4" /></summary><div className="mt-3 grid gap-2 text-slate-500 sm:grid-cols-2"><p>• Considera OS concluídas pela data de entrega ou previsão.</p><p>• Mantém somente uma solicitação pendente por cliente.</p><p>• Consentimento e descadastro têm histórico próprio.</p><p>• Envios repetidos são bloqueados por ciclo de manutenção.</p><p>• “SAIR”, “PARAR” e “CANCELAR” descadastram automaticamente.</p><p>• Automação exige provedor oficial do WhatsApp.</p></div></details>

      <AnimatePresence>{preview && overview && <PreviewModal opportunity={preview} campaign={overview.campaign} canSend={overview.provider.manualSingleAllowed && preview.consentimento === 'autorizado'} busy={busyId === preview.ordem_servico_id} onClose={() => setPreview(null)} onSend={() => void send(preview)} />}</AnimatePresence>
    </PageContainer>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300' : 'text-slate-500'}`}>{children}</button>;
}

function OpportunityList({ items, loading, busyId, providerReady, onConsent, onOptOut, onPreview, onSend }: {
  items: RemarketingOpportunity[]; loading: boolean; busyId: string; providerReady: boolean;
  onConsent: (item: RemarketingOpportunity) => void; onOptOut: (item: RemarketingOpportunity) => void;
  onPreview: (item: RemarketingOpportunity) => void; onSend: (item: RemarketingOpportunity) => void;
}) {
  if (loading) return <Empty icon={RefreshCw} title="Calculando oportunidades…" spinning />;
  if (!items.length) return <Empty icon={CheckCircle2} title="Nenhuma oportunidade encontrada" description="Não há instrumentos que correspondam aos filtros e às regras atuais." />;
  return <div className="divide-y divide-slate-100 dark:divide-slate-800">{items.map((item) => <div key={item.ordem_servico_id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{item.cliente_nome}</h3><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{item.dias_sem_manutencao} dias</span><ConsentBadge status={item.consentimento} /><span className="text-xs text-slate-400">OS #{item.ordem_numero}</span></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{instrumentLabel(item)}</span><span>{formatPhone(item.cliente_telefone)}</span><span>Última manutenção: {formatDate(item.data_ultima_manutencao)}</span></div></div>
    <div className="flex flex-wrap gap-2 lg:justify-end">{item.consentimento === 'nao_autorizado' && <Button size="sm" variant="secondary" icon={UserCheck} loading={busyId === item.cliente_id} onClick={() => void onConsent(item)}>Registrar autorização</Button>}{item.consentimento === 'autorizado' && <Button size="sm" variant="ghost" icon={Ban} loading={busyId === item.cliente_id} onClick={() => void onOptOut(item)}>Descadastrar</Button>}<Button size="sm" variant="ghost" onClick={() => onPreview(item)}>Prévia</Button><Button size="sm" icon={Send} disabled={!providerReady || item.consentimento !== 'autorizado'} loading={busyId === item.ordem_servico_id} onClick={() => void onSend(item)}>Enviar</Button></div>
  </div>)}</div>;
}

function ConsentBadge({ status }: { status: RemarketingOpportunity['consentimento'] }) {
  const styles = status === 'autorizado' ? 'bg-emerald-100 text-emerald-700' : status === 'descadastrado' ? 'bg-slate-200 text-slate-700' : 'bg-rose-100 text-rose-700';
  const label = status === 'autorizado' ? 'Autorizado' : status === 'descadastrado' ? 'Descadastrado' : 'Sem autorização';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles}`}>{label}</span>;
}

function HistoryList({ items, loading, onConversations }: { items: RemarketingHistoryItem[]; loading: boolean; onConversations: () => void }) {
  if (loading) return <Empty icon={RefreshCw} title="Carregando histórico…" spinning />;
  if (!items.length) return <Empty icon={Clock3} title="Nenhum envio registrado" description="As tentativas e respostas aparecerão aqui." />;
  return <div className="divide-y divide-slate-100 dark:divide-slate-800">{items.map((item) => <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{item.cliente_nome}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[item.status] || statusTone.cancelado}`}>{statusLabel[item.status] || item.status}</span><span className="text-xs text-slate-400">OS #{item.ordem_numero}</span></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{instrumentLabel(item)}</span><span>{formatPhone(item.cliente_telefone)}</span><span>{formatDate(item.data_envio || item.created_at)}</span><span>{item.tentativas} tentativa(s)</span></div>{item.mensagem_erro && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{item.mensagem_erro}</p>}</div><Button size="sm" variant="ghost" icon={MessageCircle} onClick={onConversations}>Conversas</Button></div>)}</div>;
}

function ExcludedList({ items, loading }: { items: RemarketingExcludedOrder[]; loading: boolean }) {
  if (loading) return <Empty icon={RefreshCw} title="Analisando ordens…" spinning />;
  if (!items.length) return <Empty icon={CheckCircle2} title="Nenhuma ordem excluída" description="Todas as ordens analisadas correspondem às regras atuais." />;
  return <div className="divide-y divide-slate-100 dark:divide-slate-800">{items.map((item) => <div key={`${item.ordem_servico_id}-${item.exclusion_code}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{item.cliente_nome}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">OS #{item.ordem_numero}</span>{typeof item.dias_sem_manutencao === 'number' && <span className="text-xs text-slate-400">{item.dias_sem_manutencao} dias</span>}</div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{instrumentLabel(item)}</span><span>{formatPhone(item.cliente_telefone)}</span><span>{formatDate(item.data_ultima_manutencao)}</span></div></div><div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{item.exclusion_reason}</div></div>)}</div>;
}

function PreviewModal({ opportunity, campaign, canSend, busy, onClose, onSend }: { opportunity: RemarketingOpportunity; campaign: RemarketingCampaign; canSend: boolean; busy: boolean; onClose: () => void; onSend: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true"><motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between"><div><h2 className="font-bold text-slate-950 dark:text-white">Prévia do lembrete</h2><p className="text-sm text-slate-500">{opportunity.cliente_nome} · {instrumentLabel(opportunity)}</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="my-4 whitespace-pre-wrap rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200">{RemarketingService.renderPreview(campaign, opportunity)}</div>{opportunity.consentimento !== 'autorizado' && <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><ShieldCheck className="h-4 w-4 shrink-0" />O envio ficará disponível após registrar a autorização do cliente.</div>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Fechar</Button><Button icon={Send} disabled={!canSend} loading={busy} onClick={onSend}>Enviar individualmente</Button></div></motion.div></div>;
}

function Empty({ icon: Icon, title, description, spinning = false }: { icon: typeof Users; title: string; description?: string; spinning?: boolean }) {
  return <div className="p-10 text-center"><Icon className={`mx-auto mb-3 h-10 w-10 text-slate-300 ${spinning ? 'animate-spin' : ''}`} /><h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>;
}
