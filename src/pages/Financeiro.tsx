/**
 * Visão financeira.
 *
 * O erro estrutural da versão anterior era somar coisas que não se somam:
 * a receita vinha do caixa (transações lançadas) e a despesa vinha da
 * competência (contas a pagar do mês, pagas ou não). O "resultado" exibido
 * não correspondia nem ao dinheiro em conta nem ao resultado do período, e
 * despesas avulsas — lançadas fora do Contas a Pagar — simplesmente sumiam.
 *
 * Aqui os dois regimes aparecem separados e rotulados:
 *
 *   CAIXA         o que entrou e saiu no mês (transações financeiras).
 *   COMPETÊNCIA   o que o mês gerou, pago ou não (recebíveis e pagáveis
 *                 pelo vencimento), organizado em DRE.
 *
 * Além disso: aging da inadimplência, projeção de 30/60/90 dias e indicadores
 * de produção (ticket médio, prazo médio de recebimento). Todos os números
 * vêm agregados de `/api/financeiro/resumo` — o navegador não soma mais nada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend,
  LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarRange, CheckCircle2,
  ChevronLeft, ChevronRight, Clock, FileText, Plus, Receipt, Tags, TrendingUp,
  Upload, Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { formatCurrency, formatDateOnly } from '../utils/formatters';
import { TransacaoModal } from '../components/TransacaoModal';
import { CategoriaFinanceiraModal } from '../components/CategoriaFinanceiraModal';
import { ImportarCSVModal } from '../components/ImportarCSVModal';
import { baseChartOptions, useChartPalette } from '../lib/chart-theme';
import { Badge, EmptyState, Kpi, Meter, Panel, Segmented, Skeleton, Table, Td, UIButton, toneText, type Tone } from '../components/ui';
import type { CategoriaFinanceira } from '../types/database';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, ArcElement, Filler);

type Resumo = {
  periodo: { mes: string; inicio: string; fim_exclusivo: string; hoje: string };
  caixa: { entradas: number; saidas: number; resultado: number; lancamentos: number; entradas_mes_anterior: number; saidas_mes_anterior: number };
  competencia: {
    receita: number; custo_direto: number; despesa: number; investimento: number;
    resultado: number; margem: number;
    grupos: Array<{ chave: string; label: string; sinal: number; valor: number; quantidade: number }>;
  };
  recebiveis: {
    aberto: number; vencido: number; a_vencer: number; quantidade: number;
    quantidade_vencida: number; inadimplencia: number;
    aging: Array<{ chave: string; label: string; valor: number; quantidade: number }>;
  };
  pagaveis: { aberto: number; vencido: number; a_vencer: number; pago_mes: number; quantidade_vencida: number };
  projecao: Array<{ chave: string; label: string; entradas: number; saidas: number; saldo: number }>;
  serie: Array<{ mes: string; entradas: number; saidas: number; resultado: number }>;
  categorias: { receitas: Array<{ nome: string; cor: string; valor: number }>; despesas: Array<{ nome: string; cor: string; valor: number }> };
  indicadores: { os_concluidas: number; ticket_medio: number; valor_produzido: number; prazo_medio_recebimento: number };
};

type Receivable = {
  id: string; descricao: string; valor: number; valor_recebido: number; saldo: number;
  data_vencimento: string; status: string; ordem_servico_id?: string; forma_pagamento?: string;
  dias_atraso: number; cliente_nome?: string; cliente_telefone?: string; ordem_numero?: number;
};

type Payable = {
  id: string; descricao: string; valor: number; data_vencimento: string; status: string;
  forma_pagamento?: string; recorrente?: number; dias_atraso: number;
  categoria_nome?: string; categoria_cor?: string;
};

type TabId = 'visao' | 'resultado' | 'receber' | 'pagar' | 'projecao';

const tabs: Array<{ value: TabId; label: string }> = [
  { value: 'visao', label: 'Visão geral' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'receber', label: 'A receber' },
  { value: 'pagar', label: 'A pagar' },
  { value: 'projecao', label: 'Projeção' },
];

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(monthText: string, offset: number) {
  const [year, month] = monthText.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthText: string) {
  const [year, month] = monthText.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function shortMonth(monthText: string) {
  const [year, month] = monthText.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function variation(current: number, previous: number) {
  if (!previous) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function Financeiro() {
  const navigate = useNavigate();
  const { palette } = useChartPalette();

  const [month, setMonth] = useState(currentMonthKey);
  const [tab, setTab] = useState<TabId>('visao');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [transacaoOpen, setTransacaoOpen] = useState(false);
  const [categoriaOpen, setCategoriaOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const loadResumo = useCallback(async () => {
    setLoading(true);
    try {
      setResumo(await apiRequest<Resumo>(`/api/financeiro/resumo?mes=${month}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar o financeiro');
    } finally {
      setLoading(false);
    }
  }, [month]);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const [receber, pagar] = await Promise.all([
        apiRequest<{ rows: Receivable[] }>('/api/financeiro/carteira?tipo=receber&limit=100'),
        apiRequest<{ rows: Payable[] }>('/api/financeiro/carteira?tipo=pagar&limit=100'),
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
    try {
      const { data } = await supabase.from('categorias_financeiras').select('*').order('nome');
      setCategorias(data || []);
    } catch {
      // Categorias só afetam os modais de lançamento.
    }
  }, []);

  useEffect(() => {
    void loadResumo();
  }, [loadResumo]);

  useEffect(() => {
    void loadWallet();
    void loadCategorias();
  }, [loadWallet, loadCategorias]);

  async function refreshAll() {
    await Promise.all([loadResumo(), loadWallet()]);
  }

  async function receberConta(conta: Receivable) {
    if (!conta.ordem_servico_id) {
      toast.error('Este recebível não está vinculado a uma OS.');
      return;
    }
    setBusy(conta.id);
    try {
      await apiRequest(`/api/financeiro/os/${conta.ordem_servico_id}/pagamentos`, {
        method: 'POST',
        body: JSON.stringify({
          valor: conta.saldo,
          forma_pagamento: conta.forma_pagamento,
          observacoes: 'Recebimento registrado na visão financeira',
        }),
      });
      toast.success('Recebimento lançado no caixa.');
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar recebimento');
    } finally {
      setBusy(null);
    }
  }

  async function pagarConta(conta: Payable) {
    setBusy(conta.id);
    try {
      await apiRequest(`/api/financeiro/contas-pagar/${conta.id}/pagar`, {
        method: 'POST',
        body: JSON.stringify({ forma_pagamento: conta.forma_pagamento }),
      });
      toast.success('Conta paga e despesa lançada no caixa.');
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao pagar conta');
    } finally {
      setBusy(null);
    }
  }

  const chartOptions = useMemo(() => baseChartOptions(palette), [palette]);

  const serieData = useMemo(() => {
    if (!resumo) return null;
    return {
      labels: resumo.serie.map((item) => shortMonth(item.mes)),
      datasets: [
        {
          label: 'Entradas',
          data: resumo.serie.map((item) => item.entradas),
          backgroundColor: palette.successSoft,
          borderColor: palette.success,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Saídas',
          data: resumo.serie.map((item) => item.saidas),
          backgroundColor: palette.dangerSoft,
          borderColor: palette.danger,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [palette, resumo]);

  const donutOptions = useMemo(
    () => ({
      ...chartOptions,
      cutout: '62%',
      scales: undefined,
    }),
    [chartOptions],
  );

  if (loading && !resumo) {
    return (
      <main className="ui-page space-y-4">
        <Skeleton className="h-16 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </main>
    );
  }

  if (!resumo) return null;

  const entradaVar = variation(resumo.caixa.entradas, resumo.caixa.entradas_mes_anterior);
  const isCurrentMonth = month === currentMonthKey();

  return (
    <main className="ui-page space-y-4">
      <header className="ui-page-header">
        <div className="min-w-0">
          <p className="ui-page-eyebrow">Gestão financeira</p>
          <h1 className="ui-page-title">Financeiro</h1>
          <p className="ui-page-description">
            Caixa e competência lado a lado, sem misturar o que entrou com o que foi gerado.
          </p>
        </div>
        <div className="ui-page-actions">
          <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface-raised p-1">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="app-icon-button h-8 w-8" aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-36 text-center text-sm font-semibold text-ink first-letter:uppercase">{monthLabel(month)}</span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="app-icon-button h-8 w-8"
              aria-label="Próximo mês"
              disabled={isCurrentMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <UIButton size="sm" icon={Tags} onClick={() => setCategoriaOpen(true)}>Categorias</UIButton>
          <UIButton size="sm" icon={Upload} onClick={() => setImportOpen(true)}>Importar</UIButton>
          <UIButton size="sm" variant="primary" icon={Plus} onClick={() => setTransacaoOpen(true)}>Lançar</UIButton>
        </div>
      </header>

      <Segmented value={tab} onChange={setTab} options={tabs} className="w-full overflow-x-auto sm:w-auto" />

      {/* ------------------------------------------------------- Visão geral */}
      {tab === 'visao' && (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Entrou no caixa"
              value={formatCurrency(resumo.caixa.entradas)}
              context={entradaVar === null ? `${resumo.caixa.lancamentos} lançamento(s) no mês` : `${entradaVar > 0 ? '+' : ''}${entradaVar}% vs. mês anterior`}
              icon={ArrowUpRight}
              tone="success"
            />
            <Kpi
              label="Saiu do caixa"
              value={formatCurrency(resumo.caixa.saidas)}
              context="Pagamentos efetivamente realizados"
              icon={ArrowDownRight}
              tone="danger"
            />
            <Kpi
              label="Sobrou no mês"
              value={formatCurrency(resumo.caixa.resultado)}
              context="Entradas menos saídas — dinheiro real"
              icon={Wallet}
              tone={resumo.caixa.resultado >= 0 ? 'success' : 'danger'}
              emphasis
            />
            <Kpi
              label="Inadimplência"
              value={`${resumo.recebiveis.inadimplencia}%`}
              context={`${formatCurrency(resumo.recebiveis.vencido)} vencidos em ${resumo.recebiveis.quantidade_vencida} título(s)`}
              icon={AlertTriangle}
              tone={resumo.recebiveis.inadimplencia > 20 ? 'danger' : resumo.recebiveis.inadimplencia > 0 ? 'warning' : 'success'}
              linkLabel="Ver carteira"
              onClick={() => setTab('receber')}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Panel title="Caixa dos últimos 12 meses" subtitle="Entradas e saídas efetivamente movimentadas" icon={TrendingUp}>
              <div className="h-72">{serieData && <Bar data={serieData} options={chartOptions} />}</div>
            </Panel>

            <Panel title="Produção do mês" subtitle="O que a bancada gerou de valor" icon={CheckCircle2}>
              <div className="space-y-3">
                <IndicatorRow label="OS concluídas" value={String(resumo.indicadores.os_concluidas)} />
                <IndicatorRow label="Valor produzido" value={formatCurrency(resumo.indicadores.valor_produzido)} />
                <IndicatorRow label="Ticket médio" value={formatCurrency(resumo.indicadores.ticket_medio)} />
                <IndicatorRow
                  label="Prazo médio de recebimento"
                  value={resumo.indicadores.prazo_medio_recebimento ? `${resumo.indicadores.prazo_medio_recebimento} dias` : '—'}
                  hint="Da entrada da OS até o último pagamento"
                />
                <div className="border-t border-hairline pt-3">
                  <p className="text-xs text-ink-muted">
                    Carteira em aberto:{' '}
                    <strong className="tabular-nums text-ink">{formatCurrency(resumo.recebiveis.aberto)}</strong> em{' '}
                    {resumo.recebiveis.quantidade} título(s)
                  </p>
                </div>
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Entradas por categoria" subtitle="Composição do que foi recebido no mês" icon={ArrowUpRight} tone="success">
              {resumo.categorias.receitas.length ? (
                <div className="h-64">
                  <Doughnut
                    data={{
                      labels: resumo.categorias.receitas.map((item) => item.nome),
                      datasets: [{ data: resumo.categorias.receitas.map((item) => item.valor), backgroundColor: resumo.categorias.receitas.map((item) => item.cor), borderWidth: 0 }],
                    }}
                    options={donutOptions}
                  />
                </div>
              ) : (
                <EmptyState icon={ArrowUpRight} title="Nenhuma entrada no período" />
              )}
            </Panel>

            <Panel title="Saídas por categoria" subtitle="Onde o dinheiro foi gasto no mês" icon={ArrowDownRight} tone="danger">
              {resumo.categorias.despesas.length ? (
                <CategoryBars items={resumo.categorias.despesas} />
              ) : (
                <EmptyState icon={ArrowDownRight} title="Nenhuma saída no período" />
              )}
            </Panel>
          </section>
        </div>
      )}

      {/* --------------------------------------------------------- Resultado */}
      {tab === 'resultado' && (
        <div className="space-y-4">
          <Panel
            title={`Resultado por competência · ${monthLabel(month)}`}
            subtitle="O que o mês gerou, tenha sido pago ou não. Não confundir com o caixa."
            icon={FileText}
            flush
          >
            <DreTable competencia={resumo.competencia} />
          </Panel>

          <section className="grid gap-4 md:grid-cols-3">
            <Kpi label="Receita do período" value={formatCurrency(resumo.competencia.receita)} context="Recebíveis gerados com vencimento no mês" icon={ArrowUpRight} tone="success" />
            <Kpi label="Resultado do período" value={formatCurrency(resumo.competencia.resultado)} context="Receita menos custos e despesas" icon={Wallet} tone={resumo.competencia.resultado >= 0 ? 'success' : 'danger'} emphasis />
            <Kpi label="Margem" value={`${resumo.competencia.margem}%`} context="Resultado sobre a receita do período" icon={TrendingUp} tone={resumo.competencia.margem >= 20 ? 'success' : resumo.competencia.margem >= 0 ? 'warning' : 'danger'} />
          </section>

          <Panel title="Caixa × competência" subtitle="Por que os dois números diferem" icon={CalendarRange}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-hairline bg-surface-muted p-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">Caixa</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${resumo.caixa.resultado >= 0 ? toneText.success : toneText.danger}`}>
                  {formatCurrency(resumo.caixa.resultado)}
                </p>
                <p className="mt-2 text-xs text-ink-muted">
                  Dinheiro que efetivamente entrou e saiu no mês. É o que responde “dá para pagar as contas”.
                </p>
              </div>
              <div className="rounded-md border border-hairline bg-surface-muted p-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">Competência</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${resumo.competencia.resultado >= 0 ? toneText.success : toneText.danger}`}>
                  {formatCurrency(resumo.competencia.resultado)}
                </p>
                <p className="mt-2 text-xs text-ink-muted">
                  Resultado do trabalho do período, independentemente de já ter sido pago. É o que responde “o mês foi lucrativo”.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* --------------------------------------------------------- Recebíveis */}
      {tab === 'receber' && (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Carteira em aberto" value={formatCurrency(resumo.recebiveis.aberto)} context={`${resumo.recebiveis.quantidade} título(s)`} icon={Receipt} tone="brand" />
            <Kpi label="Vencido" value={formatCurrency(resumo.recebiveis.vencido)} context={`${resumo.recebiveis.quantidade_vencida} título(s) em atraso`} icon={AlertTriangle} tone="danger" emphasis={resumo.recebiveis.vencido > 0} />
            <Kpi label="A vencer" value={formatCurrency(resumo.recebiveis.a_vencer)} context="Ainda dentro do prazo" icon={Clock} tone="info" />
            <Kpi label="Índice de inadimplência" value={`${resumo.recebiveis.inadimplencia}%`} context="Vencido sobre a carteira total" icon={TrendingUp} tone={resumo.recebiveis.inadimplencia > 20 ? 'danger' : 'warning'} />
          </section>

          <Panel title="Idade da carteira" subtitle="Há quanto tempo cada valor está parado" icon={Clock}>
            <AgingBars aging={resumo.recebiveis.aging} />
          </Panel>

          <Panel title="Títulos em aberto" subtitle="Os mais antigos primeiro — é por onde a cobrança começa" icon={Receipt} flush>
            {walletLoading ? (
              <div className="p-4"><Skeleton className="h-40" /></div>
            ) : receivables.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nada a receber" description="Toda a carteira está quitada." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="w-24">OS</th>
                    <th className="w-28">Vencimento</th>
                    <th className="w-28">Atraso</th>
                    <th className="w-32 text-right">Saldo</th>
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((conta) => (
                    <tr key={conta.id}>
                      <Td>
                        <p className="truncate font-medium text-ink">{conta.cliente_nome || conta.descricao}</p>
                        <p className="truncate text-xs text-ink-subtle">{conta.cliente_telefone || conta.descricao}</p>
                      </Td>
                      <Td>
                        {conta.ordem_numero ? (
                          <button type="button" onClick={() => navigate(`/ordens/${conta.ordem_servico_id}/historico`)} className="tabular-nums text-brand-soft hover:underline">
                            #{conta.ordem_numero}
                          </button>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="tabular-nums text-ink-muted">{formatDateOnly(conta.data_vencimento)}</span>
                      </Td>
                      <Td>
                        {conta.dias_atraso > 0 ? (
                          <Badge tone={conta.dias_atraso > 30 ? 'danger' : 'warning'}>{conta.dias_atraso} dias</Badge>
                        ) : (
                          <Badge tone="neutral">Em dia</Badge>
                        )}
                      </Td>
                      <Td numeric>
                        <strong className="text-ink">{formatCurrency(conta.saldo)}</strong>
                      </Td>
                      <Td>
                        <UIButton
                          size="sm"
                          variant="success"
                          icon={CheckCircle2}
                          loading={busy === conta.id}
                          disabled={!conta.ordem_servico_id}
                          onClick={() => void receberConta(conta)}
                        >
                          Receber
                        </UIButton>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------ Pagáveis */}
      {tab === 'pagar' && (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Em aberto" value={formatCurrency(resumo.pagaveis.aberto)} context="Total ainda não pago" icon={Receipt} tone="brand" />
            <Kpi label="Vencido" value={formatCurrency(resumo.pagaveis.vencido)} context={`${resumo.pagaveis.quantidade_vencida} conta(s) atrasada(s)`} icon={AlertTriangle} tone="danger" emphasis={resumo.pagaveis.vencido > 0} />
            <Kpi label="A vencer" value={formatCurrency(resumo.pagaveis.a_vencer)} context="Dentro do prazo" icon={Clock} tone="info" />
            <Kpi label="Pago no mês" value={formatCurrency(resumo.pagaveis.pago_mes)} context="Contas quitadas com vencimento no mês" icon={CheckCircle2} tone="success" />
          </section>

          <Panel
            title="Contas a pagar em aberto"
            subtitle="Ordenadas por vencimento"
            icon={Receipt}
            action={<UIButton size="sm" onClick={() => navigate('/contas')}>Gerenciar contas</UIButton>}
            flush
          >
            {walletLoading ? (
              <div className="p-4"><Skeleton className="h-40" /></div>
            ) : payables.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nenhuma conta em aberto" description="Nada pendente de pagamento." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th className="w-40">Categoria</th>
                    <th className="w-28">Vencimento</th>
                    <th className="w-28">Situação</th>
                    <th className="w-32 text-right">Valor</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {payables.map((conta) => (
                    <tr key={conta.id}>
                      <Td>
                        <p className="truncate font-medium text-ink">{conta.descricao}</p>
                        {Number(conta.recorrente) === 1 && <p className="text-xs text-ink-subtle">Recorrente</p>}
                      </Td>
                      <Td>
                        <span className="truncate text-ink-muted">{conta.categoria_nome || 'Sem categoria'}</span>
                      </Td>
                      <Td>
                        <span className="tabular-nums text-ink-muted">{formatDateOnly(conta.data_vencimento)}</span>
                      </Td>
                      <Td>
                        {conta.dias_atraso > 0 ? <Badge tone="danger">{conta.dias_atraso} dias</Badge> : <Badge tone="neutral">A vencer</Badge>}
                      </Td>
                      <Td numeric>
                        <strong className="text-ink">{formatCurrency(conta.valor)}</strong>
                      </Td>
                      <Td>
                        <UIButton size="sm" icon={CheckCircle2} loading={busy === conta.id} onClick={() => void pagarConta(conta)}>
                          Pagar
                        </UIButton>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------ Projeção */}
      {tab === 'projecao' && (
        <div className="space-y-4">
          <Panel
            title="Fluxo de caixa projetado"
            subtitle="Entradas e saídas já comprometidas, pela data de vencimento"
            icon={CalendarRange}
            flush
          >
            <Table>
              <thead>
                <tr>
                  <th>Janela</th>
                  <th className="w-40 text-right">Entradas previstas</th>
                  <th className="w-40 text-right">Saídas previstas</th>
                  <th className="w-40 text-right">Saldo da janela</th>
                  <th className="w-40 text-right">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {resumo.projecao.reduce<Array<{ item: Resumo['projecao'][number]; acumulado: number }>>((acc, item) => {
                  const previous = acc.length ? acc[acc.length - 1].acumulado : 0;
                  acc.push({ item, acumulado: Number((previous + item.saldo).toFixed(2)) });
                  return acc;
                }, []).map(({ item, acumulado }) => (
                  <tr key={item.chave}>
                    <Td>
                      <span className="font-medium text-ink">{item.label}</span>
                      {item.chave === 'vencido' && <p className="text-xs text-ink-subtle">Já deveria ter entrado ou saído</p>}
                    </Td>
                    <Td numeric><span className={toneText.success}>{formatCurrency(item.entradas)}</span></Td>
                    <Td numeric><span className={toneText.danger}>{formatCurrency(item.saidas)}</span></Td>
                    <Td numeric><strong className={item.saldo >= 0 ? toneText.success : toneText.danger}>{formatCurrency(item.saldo)}</strong></Td>
                    <Td numeric><strong className={acumulado >= 0 ? 'text-ink' : toneText.danger}>{formatCurrency(acumulado)}</strong></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="Como ler esta projeção" icon={AlertTriangle} tone="info">
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>
                <strong className="text-ink">Vencido</strong> soma o que já passou do prazo nos dois sentidos. Um saldo negativo
                aqui costuma significar que a cobrança está mais atrasada que os pagamentos.
              </li>
              <li>
                <strong className="text-ink">Saldo acumulado</strong> assume que tudo será recebido e pago na data prevista.
                Compare com o índice de inadimplência antes de contar com esse dinheiro.
              </li>
              <li>
                A projeção considera apenas o que já está registrado. Contas recorrentes ainda não materializadas e OS ainda
                não faturadas não aparecem aqui.
              </li>
            </ul>
          </Panel>
        </div>
      )}

      <TransacaoModal
        isOpen={transacaoOpen}
        onClose={() => setTransacaoOpen(false)}
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
      <ImportarCSVModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        categorias={categorias}
        onSuccess={() => void refreshAll()}
      />
    </main>
  );
}

/* ------------------------------------------------------------------ Apoio */

function IndicatorRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md bg-surface-muted px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink-muted">{label}</span>
        {hint && <span className="block text-2xs text-ink-subtle">{hint}</span>}
      </span>
      <strong className="shrink-0 text-base font-semibold tabular-nums text-ink">{value}</strong>
    </div>
  );
}

function CategoryBars({ items }: { items: Array<{ nome: string; cor: string; valor: number }> }) {
  const max = Math.max(...items.map((item) => item.valor), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.nome}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-ink-muted">{item.nome}</span>
            <strong className="shrink-0 tabular-nums text-ink">{formatCurrency(item.valor)}</strong>
          </div>
          <div className="ui-meter">
            <span style={{ width: `${Math.max(4, (item.valor / max) * 100)}%`, backgroundColor: item.cor }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AgingBars({ aging }: { aging: Resumo['recebiveis']['aging'] }) {
  const max = Math.max(...aging.map((item) => item.valor), 1);
  const tones: Record<string, Tone> = {
    a_vencer: 'info',
    d1_15: 'warning',
    d16_30: 'warning',
    d31_60: 'danger',
    d60_mais: 'danger',
  };

  return (
    <div className="space-y-3">
      {aging.map((item) => (
        <div key={item.chave}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="text-ink-muted">
              {item.label}
              {item.quantidade > 0 && <span className="ml-2 text-ink-subtle">· {item.quantidade} título(s)</span>}
            </span>
            <strong className="tabular-nums text-ink">{formatCurrency(item.valor)}</strong>
          </div>
          <Meter value={item.valor} max={max} tone={tones[item.chave] ?? 'neutral'} />
        </div>
      ))}
      <p className="border-t border-hairline pt-3 text-xs text-ink-muted">
        Valores acima de 60 dias raramente são recebidos sem contato direto. Priorize a cobrança da faixa mais antiga.
      </p>
    </div>
  );
}

function DreTable({ competencia }: { competencia: Resumo['competencia'] }) {
  const find = (key: string) => competencia.grupos.find((group) => group.chave === key)?.valor ?? 0;

  const receitaServico = find('receita_servico');
  const receitaOutras = find('receita_outras');
  const custo = find('custo_direto');
  const margemBruta = Number((competencia.receita - custo).toFixed(2));
  const operacional = find('despesa_operacional');
  const administrativa = find('despesa_administrativa');
  const financeira = find('despesa_financeira');
  const investimento = find('investimento');

  const rows: Array<{ label: string; value: number; kind: 'entrada' | 'saida' | 'subtotal' | 'total'; hint?: string }> = [
    { label: 'Receita de serviços', value: receitaServico, kind: 'entrada' },
    { label: 'Outras receitas', value: receitaOutras, kind: 'entrada' },
    { label: 'Receita bruta', value: competencia.receita, kind: 'subtotal' },
    { label: 'Custos diretos', value: -custo, kind: 'saida', hint: 'Peças, materiais e insumos aplicados no serviço' },
    { label: 'Margem bruta', value: margemBruta, kind: 'subtotal' },
    { label: 'Despesas operacionais', value: -operacional, kind: 'saida', hint: 'Aluguel, energia, ferramentas de trabalho' },
    { label: 'Despesas administrativas', value: -administrativa, kind: 'saida', hint: 'Impostos, contabilidade, pró-labore' },
    { label: 'Despesas financeiras', value: -financeira, kind: 'saida', hint: 'Tarifas, juros e taxas de cartão' },
    { label: 'Resultado operacional', value: competencia.resultado, kind: 'total' },
  ];

  if (investimento > 0) {
    rows.push({ label: 'Investimentos', value: -investimento, kind: 'saida', hint: 'Não entram no resultado operacional' });
  }

  return (
    <Table>
      <thead>
        <tr>
          <th>Conta</th>
          <th className="w-44 text-right">Valor</th>
          <th className="w-28 text-right">% receita</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const share = competencia.receita > 0 ? (Math.abs(row.value) / competencia.receita) * 100 : 0;
          const isSummary = row.kind === 'subtotal' || row.kind === 'total';
          return (
            <tr key={row.label} className={isSummary ? 'bg-surface-muted/60' : undefined}>
              <Td>
                <span className={isSummary ? 'font-semibold text-ink' : 'text-ink-muted'}>{row.label}</span>
                {row.hint && <p className="text-xs text-ink-subtle">{row.hint}</p>}
              </Td>
              <Td numeric>
                <span
                  className={
                    row.kind === 'total'
                      ? `text-base font-bold ${row.value >= 0 ? toneText.success : toneText.danger}`
                      : row.kind === 'subtotal'
                        ? 'font-semibold text-ink'
                        : row.value < 0
                          ? toneText.danger
                          : toneText.success
                  }
                >
                  {formatCurrency(row.value)}
                </span>
              </Td>
              <Td numeric>
                <span className="text-xs text-ink-subtle">{competencia.receita > 0 ? `${share.toFixed(1)}%` : '—'}</span>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
