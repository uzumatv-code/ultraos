import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, CalendarClock, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleDollarSign,
  Layers, ListChecks, Paperclip, Pencil, Plus, Receipt, Repeat, Search, Trash2, Wallet, X,
} from 'lucide-react';
import { apiRequest as apiClient } from '../lib/api-client';
import { apiRequest, supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { ContaPagarModal } from '../components/ContaPagarModal';
import { CustomCalendarBills } from '../components/CustomCalendarBills';
import { formatCurrency } from '../utils/formatters';
import { todayLocalDate } from '../utils/dates';
import { Badge, EmptyState, Kpi, Meter, PageHeader, Panel, Segmented, Skeleton, UIButton } from '../components/ui';
import type { Tone } from '../components/ui';
import type { CategoriaFinanceira, ContaPagar } from '../types/database';

type StatusFilter = 'abertas' | 'atrasadas' | 'pagas' | 'todas';
type ViewMode = 'lista' | 'calendario';

const PAGE_SIZE = 12;

function dateOnly(value?: string) {
  return String(value || '').slice(0, 10);
}

function formatShort(value?: string) {
  const iso = dateOnly(value);
  if (!iso) return '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function isOpen(conta: ContaPagar) {
  return conta.status === 'pendente' || conta.status === 'atrasado';
}

function dueInfo(conta: ContaPagar, today: string): { label: string; tone: Tone } {
  if (conta.status === 'pago') {
    return { label: conta.data_pagamento ? `Pago em ${formatShort(conta.data_pagamento)}` : 'Pago', tone: 'success' };
  }
  const diff = daysBetween(today, dateOnly(conta.data_vencimento));
  if (diff < 0) return { label: `Atrasada há ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'dia' : 'dias'}`, tone: 'danger' };
  if (diff === 0) return { label: 'Vence hoje', tone: 'warning' };
  if (diff === 1) return { label: 'Vence amanhã', tone: 'warning' };
  if (diff <= 7) return { label: `Vence em ${diff} dias`, tone: 'info' };
  return { label: `Vence em ${diff} dias`, tone: 'neutral' };
}

function stripeClass(tone: Tone) {
  return {
    danger: 'bg-signal-danger',
    warning: 'bg-signal-warning',
    success: 'bg-signal-success',
    info: 'bg-signal-info',
    brand: 'bg-brand',
    accent: 'bg-signal-accent',
    neutral: 'bg-hairline-strong',
  }[tone];
}

export function ContasPagar() {
  const today = todayLocalDate();
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [contaParaEditar, setContaParaEditar] = useState<ContaPagar>();
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [statusFiltro, setStatusFiltro] = useState<StatusFilter>('abertas');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [view, setView] = useState<ViewMode>('lista');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [processando, setProcessando] = useState<string | null>(null);
  const [anexos, setAnexos] = useState<Record<string, number>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const anexarPara = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const inicio = `${monthKey(mes)}-01`;
      const proximo = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
      const fim = `${monthKey(proximo)}-01`;
      await apiRequest('/api/financeiro/contas-pagar/materializar', {
        method: 'POST',
        body: JSON.stringify({ inicio, fim }),
      }).catch(() => undefined);

      const [contasResult, categoriasResult] = await Promise.all([
        supabase
          .from('contas_pagar')
          .select('*, categoria:categorias_financeiras(*)')
          .eq('user_id', user.id)
          .neq('status', 'cancelado')
          .order('data_vencimento', { ascending: true }),
        supabase.from('categorias_financeiras').select('*').eq('user_id', user.id).order('nome'),
      ]);
      if (contasResult.error) throw contasResult.error;
      setContas((contasResult.data as ContaPagar[]) || []);
      setCategorias((categoriasResult.data as CategoriaFinanceira[]) || []);
      apiClient<Record<string, number>>('/api/financeiro/comprovantes/resumo').then(setAnexos).catch(() => undefined);
    } catch (error) {
      console.error('Erro ao carregar contas a pagar:', error);
      toast.error('Não foi possível carregar as contas.');
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    setPagina(0);
  }, [statusFiltro, categoriaFiltro, busca, mes]);

  /* ----------------------------------------------------------- derivados */

  const chave = monthKey(mes);
  const mesTexto = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const mesLabel = mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1);

  const stats = useMemo(() => {
    const abertas = contas.filter(isOpen);
    const atrasadas = abertas.filter((c) => dateOnly(c.data_vencimento) < today);
    const proximos = abertas.filter((c) => {
      const d = dateOnly(c.data_vencimento);
      return d >= today && daysBetween(today, d) <= 7;
    });
    const doMes = contas.filter((c) => dateOnly(c.data_vencimento).startsWith(chave));
    const sum = (list: ContaPagar[]) => list.reduce((acc, c) => acc + Number(c.valor || 0), 0);
    const abertasMes = doMes.filter(isOpen);
    const pagasMes = doMes.filter((c) => c.status === 'pago');
    return {
      atrasadas, proximos, abertasMes, pagasMes,
      totalAtrasado: sum(atrasadas),
      totalProximos: sum(proximos),
      totalAbertoMes: sum(abertasMes),
      totalPagoMes: sum(pagasMes),
      totalMes: sum(doMes),
    };
  }, [contas, chave, today]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, { nome: string; cor: string; total: number }>();
    contas
      .filter((c) => dateOnly(c.data_vencimento).startsWith(chave))
      .forEach((c) => {
        const key = c.categoria?.nome || 'Sem categoria';
        const item = map.get(key) ?? { nome: key, cor: c.categoria?.cor || '#64748b', total: 0 };
        item.total += Number(c.valor || 0);
        map.set(key, item);
      });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [contas, chave]);

  const filtradas = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return contas.filter((conta) => {
      const venc = dateOnly(conta.data_vencimento);
      if (statusFiltro === 'atrasadas') {
        if (!(isOpen(conta) && venc < today)) return false;
      } else if (statusFiltro === 'abertas') {
        if (!isOpen(conta)) return false;
        // Em aberto: tudo que já venceu, mais o mês em foco.
        if (!(venc < today || venc.startsWith(chave))) return false;
      } else {
        if (!venc.startsWith(chave)) return false;
        if (statusFiltro === 'pagas' && conta.status !== 'pago') return false;
      }
      if (categoriaFiltro && conta.categoria_id !== categoriaFiltro) return false;
      if (term && !`${conta.descricao} ${conta.categoria?.nome || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [contas, statusFiltro, categoriaFiltro, busca, chave, today]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const visiveis = filtradas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);
  const selecionadasSet = useMemo(() => new Set(selecionadas), [selecionadas]);
  const contasSelecionadas = useMemo(() => filtradas.filter((c) => selecionadasSet.has(c.id)), [filtradas, selecionadasSet]);
  const pagaveisSelecionadas = contasSelecionadas.filter(isOpen);
  const totalSelecionado = contasSelecionadas.reduce((acc, c) => acc + Number(c.valor || 0), 0);

  useEffect(() => {
    setSelecionadas((current) => current.filter((id) => filtradas.some((c) => c.id === id)));
  }, [filtradas]);

  const agenda = useMemo(
    () => contas.filter(isOpen).sort((a, b) => dateOnly(a.data_vencimento).localeCompare(dateOnly(b.data_vencimento))).slice(0, 6),
    [contas],
  );

  /* -------------------------------------------------------------- ações */

  async function pagarConta(conta: ContaPagar) {
    await apiClient(`/api/financeiro/contas-pagar/${conta.id}/pagar`, {
      method: 'POST',
      body: JSON.stringify({ forma_pagamento: conta.forma_pagamento }),
    });
  }

  async function handlePagar(conta: ContaPagar) {
    setProcessando(conta.id);
    try {
      await pagarConta(conta);
      toast.success(`${conta.descricao} paga — despesa lançada no caixa.`);
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao pagar conta');
    } finally {
      setProcessando(null);
    }
  }

  function authToken() {
    try {
      return JSON.parse(localStorage.getItem('mysql-auth-session') || 'null')?.access_token || '';
    } catch {
      return '';
    }
  }

  async function abrirComprovante(conta: ContaPagar) {
    try {
      const lista = await apiClient<Array<{ id: string }>>(`/api/financeiro/comprovantes?conta_pagar_id=${conta.id}`);
      if (!lista.length) return toast.error('Nenhum comprovante nesta conta.');
      const response = await fetch(`/api/financeiro/comprovantes/${lista[0].id}/arquivo`, { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!response.ok) throw new Error('Não foi possível abrir o comprovante');
      const blob = await response.blob();
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir comprovante');
    }
  }

  function escolherComprovante(conta: ContaPagar) {
    anexarPara.current = conta.id;
    fileInput.current?.click();
  }

  async function enviarComprovante(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const contaId = anexarPara.current;
    event.target.value = '';
    if (!file || !contaId) return;
    if (file.size > 6 * 1024 * 1024) return toast.error('Arquivo maior que 6 MB.');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(file);
      });
      await apiClient(`/api/financeiro/contas-pagar/${contaId}/comprovantes`, {
        method: 'POST',
        body: JSON.stringify({ nome: file.name, tipo: file.type, base64 }),
      });
      toast.success('Comprovante anexado.');
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao anexar comprovante');
    }
  }

  async function handleDeletar(conta: ContaPagar) {
    const result = await alerts.confirm({
      title: 'Excluir conta?',
      text: conta.recorrencia_id
        ? `"${conta.descricao}" é recorrente. Apenas esta ocorrência será removida.`
        : `"${conta.descricao}" será removida.`,
      icon: 'warning',
    });
    if (!result.isConfirmed) return;
    try {
      const { error } = await supabase
        .from('contas_pagar')
        .update({ status: 'cancelado', alterada_manualmente: Boolean(conta.recorrencia_id) })
        .eq('id', conta.id);
      if (error) throw error;
      toast.success('Conta excluída.');
      await carregar();
    } catch {
      toast.error('Erro ao excluir conta');
    }
  }

  async function pagarSelecionadas() {
    if (!pagaveisSelecionadas.length) return;
    const result = await alerts.confirm({
      title: `Pagar ${pagaveisSelecionadas.length} conta(s)?`,
      text: `Total de ${formatCurrency(pagaveisSelecionadas.reduce((acc, c) => acc + Number(c.valor || 0), 0))} será lançado como despesa.`,
      icon: 'question',
    });
    if (!result.isConfirmed) return;
    setProcessando('lote');
    let falhas = 0;
    for (const conta of pagaveisSelecionadas) {
      try {
        await pagarConta(conta);
      } catch {
        falhas += 1;
      }
    }
    setProcessando(null);
    setSelecionadas([]);
    if (falhas) toast.error(`${falhas} conta(s) não puderam ser pagas.`);
    else toast.success('Contas pagas e despesas lançadas.');
    await carregar();
  }

  async function excluirSelecionadas() {
    if (!contasSelecionadas.length) return;
    const result = await alerts.confirm({
      title: `Excluir ${contasSelecionadas.length} conta(s)?`,
      text: 'Essa ação remove as contas selecionadas da lista.',
      icon: 'warning',
    });
    if (!result.isConfirmed) return;
    setProcessando('lote');
    try {
      const { error } = await supabase
        .from('contas_pagar')
        .update({ status: 'cancelado', alterada_manualmente: true })
        .in('id', selecionadas);
      if (error) throw error;
      toast.success('Contas excluídas.');
      setSelecionadas([]);
      await carregar();
    } catch {
      toast.error('Erro ao excluir contas selecionadas');
    } finally {
      setProcessando(null);
    }
  }

  function toggle(id: string) {
    setSelecionadas((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function togglePagina() {
    const ids = visiveis.map((c) => c.id);
    const todas = ids.length > 0 && ids.every((id) => selecionadasSet.has(id));
    setSelecionadas((current) => (todas ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]));
  }

  const novaConta = () => {
    setContaParaEditar(undefined);
    setModalAberto(true);
  };

  const mudarMes = (delta: number) => setMes((atual) => new Date(atual.getFullYear(), atual.getMonth() + delta, 1));
  const todosDaPagina = visiveis.length > 0 && visiveis.every((c) => selecionadasSet.has(c.id));

  /* -------------------------------------------------------------- render */

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Financeiro"
        title="Contas a pagar"
        description="Vencimentos, atrasos e baixas em um só lugar. Cada pagamento vira despesa no caixa automaticamente."
        actions={
          <>
            <div className="ui-month-nav" role="group" aria-label="Mês de referência">
              <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
              <span>{mesLabel}</span>
              <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <UIButton variant="primary" icon={Plus} onClick={novaConta}>Nova conta</UIButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          label="Em atraso"
          value={loading ? '…' : formatCurrency(stats.totalAtrasado)}
          context={`${stats.atrasadas.length} conta${stats.atrasadas.length === 1 ? '' : 's'}`}
          icon={AlertTriangle}
          tone="danger"
          emphasis={stats.atrasadas.length > 0}
          linkLabel={stats.atrasadas.length ? 'Ver atrasadas' : undefined}
          onClick={stats.atrasadas.length ? () => { setStatusFiltro('atrasadas'); setView('lista'); } : undefined}
        />
        <Kpi
          label="Próximos 7 dias"
          value={loading ? '…' : formatCurrency(stats.totalProximos)}
          context={`${stats.proximos.length} vencimento${stats.proximos.length === 1 ? '' : 's'}`}
          icon={CalendarClock}
          tone="warning"
        />
        <Kpi
          label="A pagar no mês"
          value={loading ? '…' : formatCurrency(stats.totalAbertoMes)}
          context={`de ${formatCurrency(stats.totalMes)} previstos`}
          icon={Wallet}
          tone="brand"
        />
        <Kpi
          label="Pago no mês"
          value={loading ? '…' : formatCurrency(stats.totalPagoMes)}
          context={`${stats.pagasMes.length} conta${stats.pagasMes.length === 1 ? '' : 's'} quitada${stats.pagasMes.length === 1 ? '' : 's'}`}
          icon={CheckCheck}
          tone="success"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-3">
          <div className="ui-toolbar">
            <Segmented<ViewMode>
              value={view}
              onChange={setView}
              options={[{ value: 'lista', label: 'Lista' }, { value: 'calendario', label: 'Calendário' }]}
            />
            {view === 'lista' && (
              <>
                <Segmented<StatusFilter>
                  value={statusFiltro}
                  onChange={setStatusFiltro}
                  options={[
                    { value: 'abertas', label: 'Em aberto' },
                    { value: 'atrasadas', label: 'Atrasadas' },
                    { value: 'pagas', label: 'Pagas' },
                    { value: 'todas', label: 'Todas' },
                  ]}
                />
                <div className="ui-search min-w-44 flex-1">
                  <Search aria-hidden />
                  <input className="ui-field" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta ou categoria" />
                </div>
                <select className="ui-field w-auto min-w-40" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} aria-label="Categoria">
                  <option value="">Todas as categorias</option>
                  {categorias.filter((c) => c.tipo === 'despesa').map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {view === 'calendario' ? (
            <Panel flush>
              <div className="p-3 sm:p-4">
                <CustomCalendarBills
                  bills={contas}
                  loading={loading}
                  onEventClick={(conta) => { setContaParaEditar(conta); setModalAberto(true); }}
                  onUpdate={carregar}
                />
              </div>
            </Panel>
          ) : (
            <Panel flush>
              {loading ? (
                <div className="space-y-px p-4">
                  {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="mb-2 h-16" />)}
                </div>
              ) : filtradas.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title={contas.length === 0 ? 'Nenhuma conta cadastrada' : 'Nada por aqui'}
                  description={
                    contas.length === 0
                      ? 'Cadastre a primeira conta ou mande pelo WhatsApp: “cadastre conta de luz 200 vence dia 10”.'
                      : 'Nenhuma conta corresponde aos filtros deste mês.'
                  }
                  action={<UIButton variant="primary" icon={Plus} onClick={novaConta}>Nova conta</UIButton>}
                />
              ) : (
                <>
                  <div className="ui-list-head">
                    <button type="button" className={`ui-check ${todosDaPagina ? 'is-on' : ''}`} onClick={togglePagina} aria-label="Selecionar página">
                      {todosDaPagina && <Check className="h-3 w-3" />}
                    </button>
                    <span>{filtradas.length} conta{filtradas.length === 1 ? '' : 's'}</span>
                    <span className="ml-auto ui-money">{formatCurrency(filtradas.reduce((acc, c) => acc + Number(c.valor || 0), 0))}</span>
                  </div>
                  <ul>
                    {visiveis.map((conta) => {
                      const info = dueInfo(conta, today);
                      const marcada = selecionadasSet.has(conta.id);
                      const aberta = isOpen(conta);
                      return (
                        <li key={conta.id} className={`ui-bill ${marcada ? 'is-selected' : ''}`}>
                          <span className={`ui-bill-stripe ${stripeClass(info.tone)}`} aria-hidden />
                          <button type="button" className={`ui-check ${marcada ? 'is-on' : ''}`} onClick={() => toggle(conta.id)} aria-label={marcada ? 'Desmarcar' : 'Selecionar'}>
                            {marcada && <Check className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="truncate font-semibold text-ink">{conta.descricao}</p>
                              {conta.recorrencia_id && <Repeat className="h-3.5 w-3.5 text-ink-subtle" aria-label="Recorrente" />}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                              {conta.categoria?.nome && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full" style={{ background: conta.categoria.cor || 'currentColor' }} />
                                  {conta.categoria.nome}
                                </span>
                              )}
                              <span>Venc. {formatShort(conta.data_vencimento)}</span>
                              <Badge tone={info.tone} dot>{info.label}</Badge>
                            </div>
                          </div>
                          <strong className="ui-money shrink-0 text-right text-base text-ink">{formatCurrency(Number(conta.valor))}</strong>
                          <div className="flex shrink-0 items-center gap-1">
                            {aberta && (
                              <UIButton size="sm" variant="success" icon={Check} loading={processando === conta.id} onClick={() => handlePagar(conta)}>
                                <span className="hidden sm:inline">Pagar</span>
                              </UIButton>
                            )}
                            {anexos[conta.id] ? (
                              <UIButton size="sm" variant="ghost" icon={Paperclip} aria-label="Ver comprovante" title="Ver comprovante" className="!text-brand-soft" onClick={() => abrirComprovante(conta)} />
                            ) : (
                              <UIButton size="sm" variant="ghost" icon={Paperclip} aria-label="Anexar comprovante" title="Anexar comprovante" onClick={() => escolherComprovante(conta)} />
                            )}
                            <UIButton size="sm" variant="ghost" icon={Pencil} aria-label="Editar" onClick={() => { setContaParaEditar(conta); setModalAberto(true); }} />
                            <UIButton size="sm" variant="ghost" icon={Trash2} aria-label="Excluir" className="hover:!text-signal-danger" onClick={() => handleDeletar(conta)} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {totalPaginas > 1 && (
                    <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-sm text-ink-muted">
                      <span>Página {pagina + 1} de {totalPaginas}</span>
                      <div className="flex gap-2">
                        <UIButton size="sm" icon={ChevronLeft} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} aria-label="Anterior" />
                        <UIButton size="sm" icon={ChevronRight} disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina((p) => p + 1)} aria-label="Próxima" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </Panel>
          )}
        </div>

        <aside className="space-y-5">
          <Panel title="Próximos vencimentos" subtitle="O que exige atenção primeiro" icon={CalendarDays} tone="warning" flush>
            {agenda.length === 0 ? (
              <EmptyState icon={CircleDollarSign} title="Tudo em dia" description="Nenhuma conta em aberto." />
            ) : (
              <ul className="divide-y divide-hairline">
                {agenda.map((conta) => {
                  const info = dueInfo(conta, today);
                  return (
                    <li key={conta.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border text-center leading-none ui-tone-${info.tone}`}>
                        <span className="text-sm font-bold">{dateOnly(conta.data_vencimento).slice(8, 10)}</span>
                        <span className="text-[0.55rem] font-semibold uppercase">
                          {new Date(`${dateOnly(conta.data_vencimento)}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{conta.descricao}</p>
                        <p className="text-xs text-ink-muted">{info.label}</p>
                      </div>
                      <span className="ui-money text-sm font-semibold text-ink">{formatCurrency(Number(conta.valor))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Por categoria" subtitle={`Previsto em ${mesTexto}`} icon={Layers} tone="brand">
            {porCategoria.length === 0 ? (
              <p className="text-sm text-ink-muted">Sem contas neste mês.</p>
            ) : (
              <ul className="space-y-3.5">
                {porCategoria.map((item) => (
                  <li key={item.nome}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.cor }} />
                        <span className="truncate">{item.nome}</span>
                      </span>
                      <span className="ui-money font-semibold text-ink">{formatCurrency(item.total)}</span>
                    </div>
                    <Meter value={item.total} max={porCategoria[0].total} tone="brand" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>

      <AnimatePresence>
        {selecionadas.length > 0 && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="ui-bulkbar"
            role="region"
            aria-label="Ações em lote"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/20 text-brand-soft"><ListChecks className="h-4 w-4" /></span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-ink">{selecionadas.length} selecionada{selecionadas.length === 1 ? '' : 's'}</p>
                <p className="ui-money text-xs text-ink-muted">{formatCurrency(totalSelecionado)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <UIButton size="sm" variant="success" icon={Check} loading={processando === 'lote'} disabled={!pagaveisSelecionadas.length} onClick={pagarSelecionadas}>Pagar</UIButton>
              <UIButton size="sm" variant="danger" icon={Trash2} disabled={processando === 'lote'} onClick={excluirSelecionadas}>Excluir</UIButton>
              <UIButton size="sm" variant="ghost" icon={X} aria-label="Limpar seleção" onClick={() => setSelecionadas([])} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={enviarComprovante} />

      <ContaPagarModal
        isOpen={modalAberto}
        onClose={() => { setModalAberto(false); setContaParaEditar(undefined); }}
        contaParaEditar={contaParaEditar}
        categorias={categorias}
        onSuccess={() => { setModalAberto(false); setContaParaEditar(undefined); void carregar(); }}
      />
    </div>
  );
}
