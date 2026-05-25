import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle,
  FileText,
  Filter,
  Plus,
  Receipt,
  Search,
  Tags,
  Upload,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { formatCurrency } from '../utils/formatters';
import { TransacaoModal } from '../components/TransacaoModal';
import { CategoriaFinanceiraModal } from '../components/CategoriaFinanceiraModal';
import { ImportarCSVModal } from '../components/ImportarCSVModal';
import type { CategoriaFinanceira, ContaPagar, ContaReceber, OrdemServico, TransacaoFinanceira } from '../types/database';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
);

type TipoFiltro = 'todos' | 'receita' | 'despesa';
type FluxoMensal = { label: string; receitas: number; despesas: number };
type CategoriaResumo = { nome: string; valor: number; cor: string };

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateInput(start), end: toDateInput(end) };
}

function getLastSixMonthRange() {
  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  const end = new Date();
  return { start: toDateInput(start), end: toDateInput(end) };
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function buildFluxoMensal(transacoes: TransacaoFinanceira[]) {
  const months: FluxoMensal[] = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return { label: monthLabel(date), receitas: 0, despesas: 0 };
  });

  const first = new Date();
  first.setMonth(first.getMonth() - 5);

  transacoes.forEach((transacao) => {
    const data = parseDate(transacao.data);
    if (!data) return;
    const index = (data.getFullYear() - first.getFullYear()) * 12 + data.getMonth() - first.getMonth();
    if (index < 0 || index > 5) return;

    if (transacao.tipo === 'receita') months[index].receitas += Number(transacao.valor || 0);
    else months[index].despesas += Number(transacao.valor || 0);
  });

  return months;
}

function summarizeByCategory(transacoes: TransacaoFinanceira[], tipo: 'receita' | 'despesa') {
  const map = new Map<string, CategoriaResumo>();
  transacoes
    .filter((transacao) => transacao.tipo === tipo)
    .forEach((transacao) => {
      const nome = transacao.categoria?.nome || 'Sem categoria';
      const current = map.get(nome) || { nome, valor: 0, cor: transacao.categoria?.cor || '#64748B' };
      current.valor += Number(transacao.valor || 0);
      map.set(nome, current);
    });

  return [...map.values()].sort((a, b) => b.valor - a.valor).slice(0, 6);
}

function StatCard({
  title,
  value,
  description,
  tone,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  tone: 'green' | 'red' | 'blue' | 'amber';
  icon: React.ReactNode;
}) {
  const toneMap = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{value}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneMap[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

export function Financeiro() {
  const navigate = useNavigate();
  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [transacoesGrafico, setTransacoesGrafico] = useState<TransacaoFinanceira[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [contasPendentes, setContasPendentes] = useState<ContaPagar[]>([]);
  const [contasReceber, setContasReceber] = useState<ContaReceber[]>([]);
  const [ordensConcluidas, setOrdensConcluidas] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalTransacaoAberto, setModalTransacaoAberto] = useState(false);
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false);
  const [modalImportarCSVAberto, setModalImportarCSVAberto] = useState(false);
  const [transacaoParaEditar, setTransacaoParaEditar] = useState<TransacaoFinanceira>();
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  const { start: monthStart, end: monthEnd } = useMemo(() => getMonthRange(currentDate), [currentDate]);
  const periodoLabel = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const buscarDados = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        navigate('/login');
        return;
      }

      const chartRange = getLastSixMonthRange();

      const categoriasQuery = supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome');

      let transacoesQuery = supabase
        .from('transacoes_financeiras')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .gte('data', monthStart)
        .lte('data', monthEnd)
        .order('data', { ascending: false });

      if (busca.trim()) transacoesQuery = transacoesQuery.ilike('descricao', `%${busca.trim()}%`);
      if (tipoFiltro !== 'todos') transacoesQuery = transacoesQuery.eq('tipo', tipoFiltro);
      if (categoriaFiltro) transacoesQuery = transacoesQuery.eq('categoria_id', categoriaFiltro);

      const transacoesGraficoQuery = supabase
        .from('transacoes_financeiras')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .gte('data', chartRange.start)
        .lte('data', chartRange.end)
        .order('data', { ascending: true });

      const contasQuery = supabase
        .from('contas_pagar')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .order('data_vencimento', { ascending: true });

      const contasReceberQuery = supabase
        .from('contas_receber')
        .select('*, cliente:clientes(*), ordem_servico:ordens_servico(*)')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'parcial', 'atrasado'])
        .order('data_vencimento', { ascending: true });

      const ordensQuery = supabase
        .from('ordens_servico')
        .select('id, numero, valor_total, valor_servicos, desconto, data_entrega, data_entrada, cliente:clientes(*)')
        .eq('user_id', user.id)
        .eq('status', 'concluido')
        .gte('data_entrega', monthStart)
        .lte('data_entrega', monthEnd)
        .order('data_entrega', { ascending: false });

      const [
        { data: categoriasData, error: categoriasError },
        { data: transacoesData, error: transacoesError },
        { data: graficoData, error: graficoError },
        { data: contasData, error: contasError },
        { data: contasReceberData, error: contasReceberError },
        { data: ordensData, error: ordensError },
      ] = await Promise.all([categoriasQuery, transacoesQuery, transacoesGraficoQuery, contasQuery, contasReceberQuery, ordensQuery]);

      if (categoriasError) throw categoriasError;
      if (transacoesError) throw transacoesError;
      if (graficoError) throw graficoError;
      if (contasError) throw contasError;
      if (contasReceberError) throw contasReceberError;
      if (ordensError) throw ordensError;

      setCategorias(categoriasData || []);
      setTransacoes(transacoesData || []);
      setTransacoesGrafico(graficoData || []);
      setContasPendentes(contasData || []);
      setContasReceber(contasReceberData || []);
      setOrdensConcluidas(ordensData || []);
    } catch (error) {
      console.error('Erro ao carregar financeiro:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [busca, categoriaFiltro, monthEnd, monthStart, navigate, tipoFiltro]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);

  const receitasMes = useMemo(
    () => transacoes.filter((item) => item.tipo === 'receita').reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [transacoes],
  );

  const despesasMes = useMemo(
    () => transacoes.filter((item) => item.tipo === 'despesa').reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [transacoes],
  );

  const saldoMes = receitasMes - despesasMes;

  const totalOrdensConcluidas = useMemo(
    () => ordensConcluidas.reduce((acc, ordem) => acc + Number(ordem.valor_total ?? (Number(ordem.valor_servicos || 0) - Number(ordem.desconto || 0))), 0),
    [ordensConcluidas],
  );

  const totalContasPendentes = useMemo(
    () => contasPendentes.reduce((acc, conta) => acc + Number(conta.valor || 0), 0),
    [contasPendentes],
  );

  const totalReceberPendente = useMemo(
    () => contasReceber.reduce((acc, conta) => acc + Math.max(0, Number(conta.valor || 0) - Number(conta.valor_recebido || 0)), 0),
    [contasReceber],
  );

  const lucroLiquido = saldoMes;

  const contasAtrasadas = useMemo(
    () => contasPendentes.filter((conta) => conta.status === 'atrasado' || (conta.status === 'pendente' && conta.data_vencimento < toDateInput(new Date()))),
    [contasPendentes],
  );

  const fluxoMensal = useMemo(() => buildFluxoMensal(transacoesGrafico), [transacoesGrafico]);
  const receitasPorCategoria = useMemo(() => summarizeByCategory(transacoes, 'receita'), [transacoes]);
  const despesasPorCategoria = useMemo(() => summarizeByCategory(transacoes, 'despesa'), [transacoes]);
  const ultimasTransacoes = transacoes.slice(0, 8);
  const proximasContas = contasPendentes.slice(0, 6);
  const proximosRecebimentos = contasReceber.slice(0, 6);

  const lineData = {
    labels: fluxoMensal.map((item) => item.label),
    datasets: [
      {
        label: 'Receitas',
        data: fluxoMensal.map((item) => item.receitas),
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.12)',
        fill: true,
        tension: 0.35,
      },
      {
        label: 'Despesas',
        data: fluxoMensal.map((item) => item.despesas),
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.10)',
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const doughnutData = {
    labels: receitasPorCategoria.map((item) => item.nome),
    datasets: [{
      data: receitasPorCategoria.map((item) => item.valor),
      backgroundColor: receitasPorCategoria.map((item) => item.cor),
      borderWidth: 0,
    }],
  };

  const barData = {
    labels: despesasPorCategoria.map((item) => item.nome),
    datasets: [{
      label: 'Despesas',
      data: despesasPorCategoria.map((item) => item.valor),
      backgroundColor: despesasPorCategoria.map((item) => item.cor),
      borderRadius: 6,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
    },
  };

  function changeMonth(offset: number) {
    setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function authHeaders() {
    const sessionRaw = localStorage.getItem('mysql-auth-session');
    const token = sessionRaw ? JSON.parse(sessionRaw)?.access_token : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function pagarConta(conta: ContaPagar) {
    try {
      const response = await fetch(`/api/financeiro/contas-pagar/${conta.id}/pagar`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ forma_pagamento: conta.forma_pagamento })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error?.message || 'Erro ao pagar conta');
      toast.success('Conta paga e despesa lancada');
      buscarDados();
    } catch (error: any) {
      console.error('Erro ao pagar conta:', error);
      toast.error(error.message || 'Erro ao pagar conta');
    }
  }

  async function receberConta(conta: ContaReceber) {
    if (!conta.ordem_servico_id) {
      toast.error('Recebivel sem OS vinculada');
      return;
    }

    try {
      const saldo = Math.max(0, Number(conta.valor || 0) - Number(conta.valor_recebido || 0));
      const response = await fetch(`/api/financeiro/os/${conta.ordem_servico_id}/pagamentos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          valor: saldo,
          forma_pagamento: conta.forma_pagamento,
          observacoes: 'Recebimento registrado pela tela financeira'
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error?.message || 'Erro ao receber conta');
      toast.success('Recebimento lancado como receita');
      buscarDados();
    } catch (error: any) {
      console.error('Erro ao receber conta:', error);
      toast.error(error.message || 'Erro ao receber conta');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Gestao financeira</p>
            <h1 className="mt-1 text-3xl font-semibold text-gray-950 dark:text-white">Financeiro</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Caixa, recebimentos, despesas, vencimentos e categorias em uma visao operacional.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
              Mes anterior
            </button>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold capitalize text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white">
              {periodoLabel}
            </div>
            <button onClick={() => changeMonth(1)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
              Proximo mes
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Receitas do mes" value={formatCurrency(receitasMes)} description="Lancamentos filtrados no periodo" tone="green" icon={<ArrowUpRight className="h-5 w-5" />} />
          <StatCard title="Despesas do mes" value={formatCurrency(despesasMes)} description="Saidas registradas no periodo" tone="red" icon={<ArrowDownRight className="h-5 w-5" />} />
          <StatCard title="Lucro liquido" value={formatCurrency(lucroLiquido)} description="Recebido menos despesas" tone={saldoMes >= 0 ? 'blue' : 'amber'} icon={<Wallet className="h-5 w-5" />} />
          <StatCard title="A receber" value={formatCurrency(totalReceberPendente)} description={`${contasReceber.length} recebivel(is) em aberto`} tone="amber" icon={<Receipt className="h-5 w-5" />} />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Fluxo dos ultimos 6 meses</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Comparativo entre entradas e saidas.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-gray-400" />
            </div>
            <div className="h-72">
              <Line data={lineData} options={chartOptions} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Saude do caixa</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-950">
                <p className="text-sm text-gray-500">Contas pendentes</p>
                <p className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">{formatCurrency(totalContasPendentes)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-950">
                <p className="text-sm text-gray-500">Recebiveis pendentes</p>
                <p className="mt-1 text-xl font-semibold text-amber-600">{formatCurrency(totalReceberPendente)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-950">
                <p className="text-sm text-gray-500">Contas atrasadas</p>
                <p className="mt-1 text-xl font-semibold text-rose-600">{contasAtrasadas.length}</p>
              </div>
              <button onClick={() => navigate('/contas')} className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800">
                Abrir contas a pagar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_220px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar movimentacao..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
              />
            </div>
            <select value={tipoFiltro} onChange={(event) => setTipoFiltro(event.target.value as TipoFiltro)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-white">
              <option value="todos">Todos os tipos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
            <select value={categoriaFiltro} onChange={(event) => setCategoriaFiltro(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-white">
              <option value="">Todas as categorias</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setModalTransacaoAberto(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950">
                <Plus className="h-4 w-4" />
                Lancar
              </button>
              <button onClick={() => setModalCategoriaAberto(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800">
                <Tags className="h-4 w-4" />
                Categorias
              </button>
              <button onClick={() => setModalImportarCSVAberto(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800">
                <Upload className="h-4 w-4" />
                CSV
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Contas a receber</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(totalReceberPendente)} em aberto</p>
              </div>
              <Receipt className="h-5 w-5 text-amber-500" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {proximosRecebimentos.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">Nenhum recebivel em aberto.</p>
              ) : proximosRecebimentos.map((conta) => {
                const saldo = Math.max(0, Number(conta.valor || 0) - Number(conta.valor_recebido || 0));
                return (
                  <div key={conta.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-950 dark:text-white">{conta.descricao}</p>
                      <p className="text-xs text-gray-500">
                        {conta.data_vencimento ? new Date(conta.data_vencimento).toLocaleDateString('pt-BR') : 'Sem vencimento'} - {conta.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-amber-600">{formatCurrency(saldo)}</p>
                      <button onClick={() => receberConta(conta)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">
                        <CheckCircle className="h-4 w-4" />
                        Receber
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Contas a pagar</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(totalContasPendentes)} pendente</p>
              </div>
              <ArrowDownRight className="h-5 w-5 text-rose-500" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {proximasContas.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">Nenhuma conta pendente.</p>
              ) : proximasContas.map((conta) => (
                <div key={conta.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-950 dark:text-white">{conta.descricao}</p>
                    <p className="text-xs text-gray-500">{new Date(conta.data_vencimento).toLocaleDateString('pt-BR')} - {conta.categoria?.nome || 'Sem categoria'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-rose-600">{formatCurrency(conta.valor)}</p>
                    <button onClick={() => pagarConta(conta)} className="inline-flex items-center gap-1 rounded-lg bg-gray-950 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950">
                      <CheckCircle className="h-4 w-4" />
                      Pagar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 xl:col-span-2">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Movimentacoes recentes</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{loading ? 'Carregando...' : `${transacoes.length} lancamento(s) no periodo`}</p>
              </div>
              <button onClick={() => navigate('/transacoes')} className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900">
                Ver todas
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3">Descricao</th>
                    <th className="px-5 py-3">Categoria</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {ultimasTransacoes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-500">Nenhuma movimentacao encontrada para os filtros atuais.</td>
                    </tr>
                  ) : ultimasTransacoes.map((transacao) => (
                    <tr key={transacao.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{new Date(transacao.data).toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => {
                            setTransacaoParaEditar(transacao);
                            setModalTransacaoAberto(true);
                          }}
                          className="text-left text-sm font-medium text-gray-950 hover:text-sky-700 dark:text-white"
                        >
                          {transacao.descricao}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: `${transacao.categoria?.cor || '#64748B'}1A`, color: transacao.categoria?.cor || '#64748B' }}>
                          {transacao.categoria?.nome || 'Sem categoria'}
                        </span>
                      </td>
                      <td className={`px-5 py-4 text-right text-sm font-semibold ${transacao.tipo === 'receita' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {transacao.tipo === 'despesa' ? '-' : '+'}{formatCurrency(transacao.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Receitas por categoria</h2>
                <Filter className="h-5 w-5 text-gray-400" />
              </div>
              <div className="h-64">
                {receitasPorCategoria.length ? <Doughnut data={doughnutData} options={chartOptions} /> : <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem receitas no periodo.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-4 text-lg font-semibold text-gray-950 dark:text-white">Despesas por categoria</h2>
              <div className="h-64">
                {despesasPorCategoria.length ? <Bar data={barData} options={{ ...chartOptions, indexAxis: 'y' as const, plugins: { legend: { display: false } } }} /> : <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem despesas no periodo.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Proximos vencimentos</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {proximasContas.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-500">Nenhuma conta pendente.</p>
                ) : proximasContas.map((conta) => (
                  <div key={conta.id} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-950 dark:text-white">{conta.descricao}</p>
                      <p className="text-xs text-gray-500">{new Date(conta.data_vencimento).toLocaleDateString('pt-BR')} - {conta.categoria?.nome || 'Sem categoria'}</p>
                    </div>
                    <p className={`text-sm font-semibold ${conta.status === 'atrasado' ? 'text-rose-600' : 'text-gray-900 dark:text-white'}`}>{formatCurrency(conta.valor)}</p>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => navigate('/notas-fiscais')} className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 text-left text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
              <span className="inline-flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                Notas fiscais
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <TransacaoModal
          isOpen={modalTransacaoAberto}
          onClose={() => {
            setModalTransacaoAberto(false);
            setTransacaoParaEditar(undefined);
          }}
          transacaoParaEditar={transacaoParaEditar}
          categorias={categorias}
          onSuccess={buscarDados}
        />

        <CategoriaFinanceiraModal
          isOpen={modalCategoriaAberto}
          onClose={() => setModalCategoriaAberto(false)}
          onSuccess={buscarDados}
        />

        <ImportarCSVModal
          isOpen={modalImportarCSVAberto}
          onClose={() => setModalImportarCSVAberto(false)}
          categorias={categorias}
          onSuccess={buscarDados}
        />
      </div>
    </div>
  );
}
