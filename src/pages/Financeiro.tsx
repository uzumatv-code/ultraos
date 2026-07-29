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
import type { CategoriaFinanceira, ContaPagar, ContaReceber, TransacaoFinanceira } from '../types/database';

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
type FluxoMensal = { label: string; receitas: number; despesas: number; pago: number };
type CategoriaResumo = { nome: string; valor: number; cor: string };

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateBR(value?: string) {
  if (!value) return 'Sem data';
  const [datePart] = value.split('T');
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return new Date(value).toLocaleDateString('pt-BR');
  return `${day}/${month}/${year}`;
}

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const nextStart = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start: toDateInput(start), end: toDateInput(end), nextStart: toDateInput(nextStart) };
}

function getLastSixMonthRange() {
  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  const end = new Date();
  const nextEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return { start: toDateInput(start), end: toDateInput(end), nextEnd: toDateInput(nextEnd) };
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDueDate(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return parseDate(value);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function buildFluxoMensal(transacoes: TransacaoFinanceira[], contas: ContaPagar[]) {
  const months: FluxoMensal[] = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return { label: monthLabel(date), receitas: 0, despesas: 0, pago: 0 };
  });

  const first = new Date();
  first.setMonth(first.getMonth() - 5);

  transacoes.forEach((transacao) => {
    const data = parseDate(transacao.data);
    if (!data) return;
    const index = (data.getFullYear() - first.getFullYear()) * 12 + data.getMonth() - first.getMonth();
    if (index < 0 || index > 5) return;

    if (transacao.tipo === 'receita') months[index].receitas += Number(transacao.valor || 0);
  });

  contas.forEach((conta) => {
    const vencimento = parseDueDate(conta.data_vencimento);
    if (!vencimento || conta.status === 'cancelado') return;
    const index = (vencimento.getFullYear() - first.getFullYear()) * 12 + vencimento.getMonth() - first.getMonth();
    if (index < 0 || index > 5) return;

    const valor = Number(conta.valor || 0);
    months[index].despesas += valor;
    if (conta.status === 'pago') months[index].pago += valor;
  });

  return months;
}

function summarizeAccountsByCategory(contas: ContaPagar[]) {
  const map = new Map<string, CategoriaResumo>();
  contas
    .filter((conta) => conta.status !== 'cancelado')
    .forEach((conta) => {
      const nome = conta.categoria?.nome || 'Sem categoria';
      const current = map.get(nome) || { nome, valor: 0, cor: conta.categoria?.cor || '#64748B' };
      current.valor += Number(conta.valor || 0);
      map.set(nome, current);
    });

  return [...map.values()].sort((a, b) => b.valor - a.valor).slice(0, 6);
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-2 break-words text-xl font-semibold text-gray-950 dark:text-white sm:text-2xl">{value}</p>
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
  const [transacoesMes, setTransacoesMes] = useState<TransacaoFinanceira[]>([]);
  const [transacoesGrafico, setTransacoesGrafico] = useState<TransacaoFinanceira[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [contasMes, setContasMes] = useState<ContaPagar[]>([]);
  const [contasGrafico, setContasGrafico] = useState<ContaPagar[]>([]);
  const [contasPendentes, setContasPendentes] = useState<ContaPagar[]>([]);
  const [contasAtrasadas, setContasAtrasadas] = useState<ContaPagar[]>([]);
  const [contasReceber, setContasReceber] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalTransacaoAberto, setModalTransacaoAberto] = useState(false);
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false);
  const [modalImportarCSVAberto, setModalImportarCSVAberto] = useState(false);
  const [transacaoParaEditar, setTransacaoParaEditar] = useState<TransacaoFinanceira>();
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  const { start: monthStart, nextStart: nextMonthStart } = useMemo(() => getMonthRange(currentDate), [currentDate]);
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
        .lt('data', nextMonthStart)
        .order('data', { ascending: false });

      if (busca.trim()) transacoesQuery = transacoesQuery.ilike('descricao', `%${busca.trim()}%`);
      if (tipoFiltro !== 'todos') transacoesQuery = transacoesQuery.eq('tipo', tipoFiltro);
      if (categoriaFiltro) transacoesQuery = transacoesQuery.eq('categoria_id', categoriaFiltro);

      const transacoesMesQuery = supabase
        .from('transacoes_financeiras')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .gte('data', monthStart)
        .lt('data', nextMonthStart)
        .order('data', { ascending: false });

      const transacoesGraficoQuery = supabase
        .from('transacoes_financeiras')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .gte('data', chartRange.start)
        .lt('data', chartRange.nextEnd)
        .order('data', { ascending: true });

      const contasQuery = supabase
        .from('contas_pagar')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .gte('data_vencimento', monthStart)
        .lt('data_vencimento', nextMonthStart)
        .order('data_vencimento', { ascending: true });

      const contasMesQuery = supabase
        .from('contas_pagar')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .neq('status', 'cancelado')
        .gte('data_vencimento', monthStart)
        .lt('data_vencimento', nextMonthStart)
        .order('data_vencimento', { ascending: true });

      const contasGraficoQuery = supabase
        .from('contas_pagar')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .neq('status', 'cancelado')
        .gte('data_vencimento', chartRange.start)
        .lt('data_vencimento', chartRange.nextEnd)
        .order('data_vencimento', { ascending: true });

      const contasAtrasadasQuery = supabase
        .from('contas_pagar')
        .select('*, categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .lt('data_vencimento', toDateInput(new Date()))
        .order('data_vencimento', { ascending: true });

      const contasReceberQuery = supabase
        .from('contas_receber')
        .select('*, cliente:clientes(*), ordem_servico:ordens_servico(*)')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'parcial', 'atrasado'])
        .gte('data_vencimento', monthStart)
        .lt('data_vencimento', nextMonthStart)
        .order('data_vencimento', { ascending: true });

      const [
        { data: categoriasData, error: categoriasError },
        { data: transacoesData, error: transacoesError },
        { data: transacoesMesData, error: transacoesMesError },
        { data: graficoData, error: graficoError },
        { data: contasData, error: contasError },
        { data: contasMesData, error: contasMesError },
        { data: contasGraficoData, error: contasGraficoError },
        { data: contasAtrasadasData, error: contasAtrasadasError },
        { data: contasReceberData, error: contasReceberError },
      ] = await Promise.all([
        categoriasQuery,
        transacoesQuery,
        transacoesMesQuery,
        transacoesGraficoQuery,
        contasQuery,
        contasMesQuery,
        contasGraficoQuery,
        contasAtrasadasQuery,
        contasReceberQuery,
      ]);

      if (categoriasError) throw categoriasError;
      if (transacoesError) throw transacoesError;
      if (transacoesMesError) throw transacoesMesError;
      if (graficoError) throw graficoError;
      if (contasError) throw contasError;
      if (contasMesError) throw contasMesError;
      if (contasGraficoError) throw contasGraficoError;
      if (contasAtrasadasError) throw contasAtrasadasError;
      if (contasReceberError) throw contasReceberError;

      setCategorias(categoriasData || []);
      setTransacoes(transacoesData || []);
      setTransacoesMes(transacoesMesData || []);
      setTransacoesGrafico(graficoData || []);
      setContasPendentes(contasData || []);
      setContasMes(contasMesData || []);
      setContasGrafico(contasGraficoData || []);
      setContasAtrasadas(contasAtrasadasData || []);
      setContasReceber(contasReceberData || []);
    } catch (error) {
      console.error('Erro ao carregar financeiro:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [busca, categoriaFiltro, monthStart, navigate, nextMonthStart, tipoFiltro]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);

  const receitasMes = useMemo(
    () => transacoesMes.filter((item) => item.tipo === 'receita').reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [transacoesMes],
  );

  const despesasMes = useMemo(
    () => contasMes.reduce((acc, conta) => acc + Number(conta.valor || 0), 0),
    [contasMes],
  );

  const totalPagoMes = useMemo(
    () => contasMes.filter((conta) => conta.status === 'pago').reduce((acc, conta) => acc + Number(conta.valor || 0), 0),
    [contasMes],
  );

  const saldoMes = receitasMes - despesasMes;

  const totalContasPendentes = useMemo(
    () => contasPendentes.reduce((acc, conta) => acc + Number(conta.valor || 0), 0),
    [contasPendentes],
  );

  const totalReceberPendente = useMemo(
    () => contasReceber.reduce((acc, conta) => acc + Math.max(0, Number(conta.valor || 0) - Number(conta.valor_recebido || 0)), 0),
    [contasReceber],
  );

  const lucroLiquido = saldoMes;

  const fluxoMensal = useMemo(() => buildFluxoMensal(transacoesGrafico, contasGrafico), [contasGrafico, transacoesGrafico]);
  const receitasPorCategoria = useMemo(() => summarizeByCategory(transacoesMes, 'receita'), [transacoesMes]);
  const despesasPorCategoria = useMemo(() => summarizeAccountsByCategory(contasMes), [contasMes]);
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
      {
        label: 'Pago',
        data: fluxoMensal.map((item) => item.pago),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.10)',
        fill: false,
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
    } catch (error: unknown) {
      console.error('Erro ao pagar conta:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao pagar conta');
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
    } catch (error: unknown) {
      console.error('Erro ao receber conta:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao receber conta');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="responsive-page">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Gestao financeira</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-950 dark:text-white">Financeiro</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Caixa, recebimentos, despesas, vencimentos e categorias em uma visao operacional.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
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

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard title="Receitas do mes" value={formatCurrency(receitasMes)} description="Entradas registradas no periodo" tone="green" icon={<ArrowUpRight className="h-5 w-5" />} />
          <StatCard title="Despesas do mes" value={formatCurrency(despesasMes)} description={`${contasMes.length} conta(s) do Contas a Pagar`} tone="red" icon={<ArrowDownRight className="h-5 w-5" />} />
          <StatCard title="Ja pago no mes" value={formatCurrency(totalPagoMes)} description={`${contasMes.filter((conta) => conta.status === 'pago').length} conta(s) paga(s)`} tone="blue" icon={<CheckCircle className="h-5 w-5" />} />
          <StatCard title="Resultado do mes" value={formatCurrency(lucroLiquido)} description="Receitas menos despesas do mes" tone={saldoMes >= 0 ? 'blue' : 'amber'} icon={<Wallet className="h-5 w-5" />} />
          <StatCard title="Contas a pagar" value={formatCurrency(totalContasPendentes)} description={`${contasPendentes.length} conta(s) no mes`} tone="red" icon={<ArrowDownRight className="h-5 w-5" />} />
          <StatCard title="A receber" value={formatCurrency(totalReceberPendente)} description={`${contasReceber.length} recebivel(is) no mes`} tone="amber" icon={<Receipt className="h-5 w-5" />} />
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
                <p className="text-sm text-gray-500">Contas a pagar no mes</p>
                <p className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">{formatCurrency(totalContasPendentes)}</p>
                <p className="mt-1 text-xs text-gray-500">{contasPendentes.length} conta(s) pendente(s)</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-950">
                <p className="text-sm text-gray-500">Pago no mes</p>
                <p className="mt-1 text-xl font-semibold text-emerald-600">{formatCurrency(totalPagoMes)}</p>
                <p className="mt-1 text-xs text-gray-500">Conforme o status do Contas a Pagar</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-950">
                <p className="text-sm text-gray-500">Recebiveis do mes</p>
                <p className="mt-1 text-xl font-semibold text-amber-600">{formatCurrency(totalReceberPendente)}</p>
                <p className="mt-1 text-xs text-gray-500">{contasReceber.length} recebivel(is)</p>
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
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <button onClick={() => setModalTransacaoAberto(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950">
                <Plus className="h-4 w-4" />
                Lancar
              </button>
              <button onClick={() => setModalCategoriaAberto(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800">
                <Tags className="h-4 w-4" />
                Categorias
              </button>
              <button onClick={() => setModalImportarCSVAberto(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800">
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(totalReceberPendente)} no mes</p>
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
                        {formatDateBR(conta.data_vencimento)} - {conta.status}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(totalContasPendentes)} no mes - {contasPendentes.length} conta(s)</p>
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
                    <p className="text-xs text-gray-500">{formatDateBR(conta.data_vencimento)} - {conta.categoria?.nome || 'Sem categoria'}</p>
                  </div>
                    <div className="flex flex-wrap items-center gap-3">
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
            <div className="responsive-table-wrap">
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
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{formatDateBR(transacao.data)}</td>
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
                      <p className="text-xs text-gray-500">{formatDateBR(conta.data_vencimento)} - {conta.categoria?.nome || 'Sem categoria'}</p>
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
