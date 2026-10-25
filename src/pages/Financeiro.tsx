/**
 * Financeiro.
 *
 * Tudo gira em torno de um período (semana, mês, ano ou intervalo livre) que
 * fica na URL. A tela responde, nesta ordem:
 *   1. quanto entrou, saiu e sobrou no período? → faixa de status;
 *   2. como o dinheiro se moveu? → fluxo de caixa dia a dia (ou 12 meses);
 *   3. o que preciso pagar ou cobrar agora? → vencimentos, no trilho;
 *   4. de onde veio e para onde foi? → categorias e o extrato do período.
 * Carteira (a receber / a pagar) e resultado por competência ficam em abas.
 *
 * Os dois regimes continuam separados: CAIXA é o que entrou e saiu
 * (transações); COMPETÊNCIA é o que o período gerou, pago ou não (DRE).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Tags, Upload } from 'lucide-react';
import { useLiveRefresh } from '../lib/live-events';
import { apiRequest } from '../lib/api-client';
import { supabase } from '../lib/supabase';
import { useUrlState } from '../hooks/useUrlState';
import { toast } from '../components/ToastCustom';
import { LiveBadge } from '../components/LiveBadge';
import { TransacaoModal } from '../components/TransacaoModal';
import { CategoriaFinanceiraModal } from '../components/CategoriaFinanceiraModal';
import { formatCurrency } from '../utils/formatters';
import { todayLocalDate } from '../utils/dates';
import { Segmented, Skeleton, UIButton, type Tone } from '../components/ui';
import { CashFlowChart } from '../components/financeiro/CashFlowChart';
import { DueList } from '../components/financeiro/DueList';
import { Lancamentos } from '../components/financeiro/Lancamentos';
import { ImportarExtratoModal } from '../components/financeiro/ImportarExtratoModal';
import { PagarList, ReceberList } from '../components/financeiro/Carteira';
import { AgingBars, CategoryBars, DreTable, FinPanel, ProjectionList } from '../components/financeiro/Analises';
import { containsDate, periodOptions, previousLabel, rangeFor, rangeLabel, shiftRef, variation, type PeriodMode } from '../components/financeiro/period';
import type { Payable, Receivable, Resumo } from '../components/financeiro/types';
import type { CategoriaFinanceira, TransacaoFinanceira } from '../types/database';

type TabId = 'visao' | 'lancamentos' | 'receber' | 'pagar' | 'resultado';

const tabs: Array<{ value: TabId; label: string }> = [
  { value: 'visao', label: 'Visão geral' },
  { value: 'lancamentos', label: 'Lançamentos' },
  { value: 'receber', label: 'A receber' },
  { value: 'pagar', label: 'A pagar' },
  { value: 'resultado', label: 'Resultado' },
];

const urlDefaults = { aba: 'visao', periodo: 'mes', ref: '', de: '', ate: '' };

function varText(value: number | null, mode: PeriodMode) {
  if (value === null) return `Sem movimento no ${previousLabel(mode)}`;
  return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR')}% vs. ${previousLabel(mode)}`;
}

export function Financeiro() {
  const today = todayLocalDate();
  const { state, setState } = useUrlState(urlDefaults);
  const tab = (tabs.some((item) => item.value === state.aba) ? state.aba : 'visao') as TabId;
  const mode = (periodOptions.some((item) => item.value === state.periodo) ? state.periodo : 'mes') as PeriodMode;
  const ref = state.ref || today;
  const range = useMemo(() => rangeFor(mode, ref, state.de, state.ate), [mode, ref, state.de, state.ate]);

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [lancamento, setLancamento] = useState<{ tipo: 'receita' | 'despesa'; editar?: TransacaoFinanceira } | null>(null);
  const [categoriaOpen, setCategoriaOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [extratoKey, setExtratoKey] = useState(0);

  const loadResumo = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setResumo(await apiRequest<Resumo>(`/api/financeiro/resumo?inicio=${range.inicio}&fim=${range.fim}`));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao carregar o financeiro');
      } finally {
        setLoading(false);
      }
    },
    [range.inicio, range.fim],
  );

  const loadWallet = useCallback(async () => {
    try {
      const [receber, pagar] = await Promise.all([
        apiRequest<{ rows: Receivable[] }>('/api/financeiro/carteira?tipo=receber&limit=200'),
        apiRequest<{ rows: Payable[] }>('/api/financeiro/carteira?tipo=pagar&limit=200'),
      ]);
      setReceivables(receber.rows);
      setPayables(pagar.rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar a carteira');
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const loadCategorias = useCallback(async () => {
    const { data } = await supabase.from('categorias_financeiras').select('*').order('nome');
    setCategorias(data || []);
  }, []);

  useEffect(() => {
    void loadResumo();
  }, [loadResumo]);

  useEffect(() => {
    void loadWallet();
    void loadCategorias();
  }, [loadWallet, loadCategorias]);

  const refreshAll = useCallback(async () => {
    setExtratoKey((value) => value + 1);
    await Promise.all([loadResumo(true), loadWallet()]);
  }, [loadResumo, loadWallet]);

  // Qualquer mudança no financeiro (outra tela, WhatsApp, agente de IA…) atualiza esta tela sozinha.
  useLiveRefresh(['financeiro'], () => Promise.all([loadResumo(true), loadWallet()]));

  async function receive(conta: Receivable) {
    if (!conta.ordem_servico_id) return;
    setBusy(conta.id);
    try {
      await apiRequest(`/api/financeiro/os/${conta.ordem_servico_id}/pagamentos`, {
        method: 'POST',
        body: JSON.stringify({ valor: conta.saldo, forma_pagamento: conta.forma_pagamento, observacoes: 'Recebimento registrado na visão financeira' }),
      });
      toast.success(`${formatCurrency(Number(conta.saldo))} recebido e lançado no caixa.`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar recebimento');
    } finally {
      setBusy(null);
    }
  }

  async function pay(conta: Payable) {
    setBusy(conta.id);
    try {
      await apiRequest(`/api/financeiro/contas-pagar/${conta.id}/pagar`, {
        method: 'POST',
        body: JSON.stringify({ forma_pagamento: conta.forma_pagamento }),
      });
      toast.success(`"${conta.descricao}" paga e lançada no caixa.`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao pagar conta');
    } finally {
      setBusy(null);
    }
  }

  function changeMode(next: PeriodMode) {
    if (next === 'personalizado') setState({ periodo: next, de: state.de || range.inicio, ate: state.ate || range.fim });
    else setState({ periodo: next, de: '', ate: '' });
  }

  const goTab = (value: TabId) => setState({ aba: value });
  const isCurrent = containsDate(range, today);
  const label = rangeLabel(mode, range, today);

  if (loading && !resumo) return <FinanceSkeleton />;
  if (!resumo) return null;

  const { caixa, recebiveis, pagaveis, competencia, indicadores } = resumo;
  const weekly = payables.filter((row) => row.dias_atraso <= 0 && row.dias_atraso >= -7);
  const payWeek = {
    total: weekly.reduce((sum, row) => sum + Number(row.valor), 0),
    count: weekly.length,
    until: new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  };
  const usesPeriod = tab === 'visao' || tab === 'lancamentos' || tab === 'resultado';

  return (
    <main className="ui-page space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="dash-eyebrow">Gestão financeira</p>
          <h1 className="mt-1 font-display text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[1.85rem]">Financeiro</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline-flex">
            <LiveBadge />
          </span>
          <UIButton variant="ghost" size="sm" icon={Tags} onClick={() => setCategoriaOpen(true)} aria-label="Categorias" title="Categorias" />
          <UIButton variant="ghost" size="sm" icon={Upload} onClick={() => setImportOpen(true)} aria-label="Importar extrato do banco (OFX ou CSV)" title="Importar extrato do banco (OFX ou CSV)" />
          <UIButton variant="secondary" size="sm" icon={Minus} onClick={() => setLancamento({ tipo: 'despesa' })}>
            Saída
          </UIButton>
          <UIButton variant="primary" size="sm" icon={Plus} onClick={() => setLancamento({ tipo: 'receita' })}>
            Entrada
          </UIButton>
        </div>
      </header>

      {/* Navegação: abas à esquerda, período à direita (só nas abas que dependem dele). */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented<TabId> value={tab} onChange={goTab} options={tabs} className="max-w-full overflow-x-auto [scrollbar-width:none]" />
        {usesPeriod ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<PeriodMode> value={mode} onChange={changeMode} options={periodOptions} />
            {mode === 'personalizado' ? (
              <div className="flex items-center gap-1.5">
                <input type="date" className="ui-field h-9 w-auto" value={range.inicio} max={range.fim} aria-label="Início do período" onChange={(event) => event.target.value && setState({ de: event.target.value })} />
                <span className="text-xs text-ink-subtle">até</span>
                <input type="date" className="ui-field h-9 w-auto" value={range.fim} min={range.inicio} aria-label="Fim do período" onChange={(event) => event.target.value && setState({ ate: event.target.value })} />
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface-raised p-0.5">
                <button type="button" className="app-icon-button h-8 w-8" onClick={() => setState({ ref: shiftRef(mode, ref, -1) })} aria-label="Período anterior">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[8.5rem] text-center text-sm font-semibold text-ink">{label}</span>
                <button type="button" className="app-icon-button h-8 w-8" onClick={() => setState({ ref: shiftRef(mode, ref, 1) })} aria-label="Próximo período">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {!isCurrent && mode !== 'personalizado' && (
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setState({ ref: '' })}>
                Hoje
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-subtle">Mostra tudo o que está em aberto hoje, sem filtro de período.</p>
        )}
      </div>

      {/* ------------------------------------------------------- Visão geral */}
      {tab === 'visao' && (
        <>
          <div className="dash-pulse-wrap">
            <section className="dash-pulse" aria-label="Resumo do período">
              <Pulse label="Entrou" value={formatCurrency(caixa.entradas)} context={varText(variation(caixa.entradas, caixa.entradas_mes_anterior), mode)} tone="success" onClick={() => goTab('lancamentos')} />
              <Pulse label="Saiu" value={formatCurrency(caixa.saidas)} context={varText(variation(caixa.saidas, caixa.saidas_mes_anterior), mode)} tone="danger" onClick={() => goTab('lancamentos')} />
              <Pulse
                label="Sobrou"
                value={formatCurrency(caixa.resultado)}
                context={`${caixa.lancamentos} lançamento${caixa.lancamentos === 1 ? '' : 's'} no período`}
                tone={caixa.resultado < 0 ? 'danger' : 'success'}
                alert={caixa.resultado < 0}
                onClick={() => goTab('lancamentos')}
              />
              <Pulse
                label="A receber vencido"
                value={formatCurrency(recebiveis.vencido)}
                context={recebiveis.vencido ? `${recebiveis.quantidade_vencida} título(s) · ${recebiveis.inadimplencia.toLocaleString('pt-BR')}% da carteira` : 'Nada vencido'}
                tone="danger"
                alert={recebiveis.vencido > 0}
                onClick={() => goTab('receber')}
              />
            </section>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="min-w-0 space-y-5">
              <CashFlowChart daily={resumo.diario ?? []} monthly={resumo.serie} />
              <div className="grid gap-5 md:grid-cols-2">
                <FinPanel id="cat-in" title="De onde veio" subtitle="Entradas por categoria no período">
                  <CategoryBars items={resumo.categorias.receitas} empty="Nenhuma entrada no período." />
                </FinPanel>
                <FinPanel id="cat-out" title="Para onde foi" subtitle="Saídas por categoria no período">
                  <CategoryBars items={resumo.categorias.despesas} empty="Nenhuma saída no período." />
                </FinPanel>
              </div>
              <FinPanel id="producao" title="Produção da bancada" subtitle="OS concluídas no período">
                <dl className="grid grid-cols-2 divide-hairline sm:grid-cols-4 sm:divide-x">
                  <Stat label="OS concluídas" value={String(indicadores.os_concluidas)} />
                  <Stat label="Valor produzido" value={formatCurrency(indicadores.valor_produzido)} />
                  <Stat label="Ticket médio" value={formatCurrency(indicadores.ticket_medio)} />
                  <Stat label="Prazo de recebimento" value={indicadores.prazo_medio_recebimento ? `${indicadores.prazo_medio_recebimento} dias` : '—'} hint="Da entrada da OS ao último pagamento" />
                </dl>
              </FinPanel>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-[5.75rem]" aria-label="Vencimentos e projeção">
              <DueList receivables={receivables} payables={payables} busy={busy} onReceive={(item) => void receive(item)} onPay={(item) => void pay(item)} onSeeAll={goTab} />
              <FinPanel id="projecao" title="Projeção" subtitle="Saldo previsto do que já está registrado">
                <ProjectionList projecao={resumo.projecao} />
              </FinPanel>
            </aside>
          </div>
        </>
      )}

      {/* --------------------------------------------------------- Lançamentos */}
      {tab === 'lancamentos' && (
        <Lancamentos
          key={extratoKey}
          range={range}
          categorias={categorias}
          onEdit={(row) => setLancamento({ tipo: row.tipo, editar: row })}
          onChanged={() => void loadResumo(true)}
        />
      )}

      {/* --------------------------------------------------------- A receber */}
      {tab === 'receber' && (
        <>
          <div className="dash-pulse-wrap">
            <section className="dash-pulse" aria-label="Resumo da carteira a receber">
              <Pulse label="Em aberto" value={formatCurrency(recebiveis.aberto)} context={`${recebiveis.quantidade} título(s)`} tone="info" />
              <Pulse label="Vencido" value={formatCurrency(recebiveis.vencido)} context={`${recebiveis.quantidade_vencida} título(s) em atraso`} tone="danger" alert={recebiveis.vencido > 0} />
              <Pulse label="A vencer" value={formatCurrency(recebiveis.a_vencer)} context="Ainda no prazo" tone="info" />
              <Pulse label="Inadimplência" value={`${recebiveis.inadimplencia.toLocaleString('pt-BR')}%`} context="Vencido sobre a carteira" tone="warning" alert={recebiveis.inadimplencia > 20} />
            </section>
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <ReceberList rows={receivables} loading={walletLoading} busy={busy} onReceive={(item) => void receive(item)} />
            <FinPanel id="aging" title="Idade da carteira" subtitle="Há quanto tempo cada valor está parado" className="xl:sticky xl:top-[5.75rem]">
              <AgingBars aging={recebiveis.aging} />
            </FinPanel>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ A pagar */}
      {tab === 'pagar' && (
        <>
          <div className="dash-pulse-wrap">
            <section className="dash-pulse" aria-label="Resumo das contas a pagar">
              <Pulse label="Em aberto" value={formatCurrency(pagaveis.aberto)} context="Total ainda não pago" tone="info" />
              <Pulse label="Vencido" value={formatCurrency(pagaveis.vencido)} context={`${pagaveis.quantidade_vencida} conta(s) atrasada(s)`} tone="danger" alert={pagaveis.vencido > 0} />
              <Pulse label="A vencer" value={formatCurrency(pagaveis.a_vencer)} context="Dentro do prazo" tone="info" />
              <Pulse label="Vence em 7 dias" value={formatCurrency(payWeek.total)} context={`${payWeek.count} conta(s) até ${payWeek.until}`} tone="warning" />
            </section>
          </div>
          <PagarList rows={payables} loading={walletLoading} busy={busy} onPay={(item) => void pay(item)} />
        </>
      )}

      {/* ---------------------------------------------------------- Resultado */}
      {tab === 'resultado' && (
        <>
          <div className="dash-pulse-wrap">
            <section className="dash-pulse" aria-label="Resultado por competência">
              <Pulse label="Receita gerada" value={formatCurrency(competencia.receita)} context="Recebíveis com vencimento no período" tone="success" />
              <Pulse label="Custos e despesas" value={formatCurrency(competencia.custo_direto + competencia.despesa)} context="Contas com vencimento no período" tone="danger" />
              <Pulse label="Resultado" value={formatCurrency(competencia.resultado)} context="O período deu lucro?" tone={competencia.resultado < 0 ? 'danger' : 'success'} alert={competencia.resultado < 0} />
              <Pulse label="Margem" value={`${competencia.margem.toLocaleString('pt-BR')}%`} context="Resultado sobre a receita" tone={competencia.margem < 0 ? 'danger' : 'success'} />
            </section>
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <FinPanel id="dre" title={`Resultado por competência · ${label}`} subtitle="O que o período gerou, pago ou não">
              <DreTable competencia={competencia} />
            </FinPanel>
            <FinPanel id="regimes" title="Caixa × competência" subtitle="Por que os dois números diferem">
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <Regime label="Caixa" value={caixa.resultado} text="O que entrou menos o que saiu de fato. Responde “dá para pagar as contas?”." />
                <Regime label="Competência" value={competencia.resultado} text="O resultado do trabalho do período, recebido ou não. Responde “o período foi lucrativo?”." />
              </div>
            </FinPanel>
          </div>
        </>
      )}

      <TransacaoModal
        isOpen={Boolean(lancamento)}
        onClose={() => setLancamento(null)}
        transacaoParaEditar={lancamento?.editar}
        tipoInicial={lancamento?.tipo}
        categorias={categorias}
        onSuccess={() => void refreshAll()}
      />
      <CategoriaFinanceiraModal
        isOpen={categoriaOpen}
        onClose={() => setCategoriaOpen(false)}
        onSuccess={() => {
          void loadCategorias();
          void refreshAll();
        }}
      />
      <ImportarExtratoModal isOpen={importOpen} onClose={() => setImportOpen(false)} onSuccess={() => void refreshAll()} />
    </main>
  );
}

function Pulse({ label, value, context, tone, alert, onClick }: { label: string; value: string; context: string; tone: Tone; alert?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="dash-eyebrow">{label}</span>
      <strong className="dash-pulse-value truncate">{value}</strong>
      <span className="truncate text-xs text-ink-muted">{context}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="dash-pulse-item" data-tone={tone} data-alert={alert || undefined} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="dash-pulse-item" data-tone={tone} data-alert={alert || undefined}>
      {body}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3 sm:px-5" title={hint}>
      <dt className="dash-eyebrow">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Regime({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div>
      <p className="dash-eyebrow">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${value < 0 ? 'text-signal-danger' : 'text-ink'}`}>{formatCurrency(value)}</p>
      <p className="mt-1 text-xs text-ink-muted">{text}</p>
    </div>
  );
}

function FinanceSkeleton() {
  return (
    <main className="ui-page space-y-5">
      <Skeleton className="h-12 w-60" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-[5.5rem]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[22rem]" />
        <Skeleton className="h-[22rem]" />
      </div>
    </main>
  );
}
