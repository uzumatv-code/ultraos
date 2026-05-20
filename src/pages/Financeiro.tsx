import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { DollarSign, ArrowRight, Search, Plus, Filter, Upload, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { formatCurrency, capitalize } from '../utils/formatters';
import { Autocomplete } from '../components/Autocomplete';
import { TransacaoModal } from '../components/TransacaoModal';
import { CategoriaFinanceiraModal } from '../components/CategoriaFinanceiraModal';
import { ImportarCSVModal } from '../components/ImportarCSVModal';
import type { TransacaoFinanceira, CategoriaFinanceira } from '../types/database';

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

export function Financeiro() {
  const navigate = useNavigate();
  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalTransacaoAberto, setModalTransacaoAberto] = useState(false);
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false);
  const [modalImportarCSVAberto, setModalImportarCSVAberto] = useState(false);
  const [transacaoParaEditar, setTransacaoParaEditar] = useState<TransacaoFinanceira>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [paginaTransacoes, setPaginaTransacoes] = useState(0);
  const [totalTransacoes, setTotalTransacoes] = useState(0);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'receita' | 'despesa'>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [receitasMes, setReceitasMes] = useState(0);
  const [despesasMes, setDespesasMes] = useState(0);
  const [saldoMes, setSaldoMes] = useState(0);
  const [showTransactions, setShowTransactions] = useState(false);
  const itensPorPagina = 10;

  // Função para obter o primeiro e último dia do mês
  const getMonthRange = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { firstDay, lastDay };
  };
  const [dadosGraficos, setDadosGraficos] = useState({
    receitasPorCategoria: {},
    despesasPorCategoria: {},
    fluxoMensal: [],
  });

  useEffect(() => {
    const { firstDay, lastDay } = getMonthRange(currentDate);
    buscarDados(firstDay, lastDay);
    carregarDadosGraficos();
  }, [currentDate, pagina, busca, tipoFiltro, categoriaFiltro]);

  async function buscarDados(firstDay: Date, lastDay: Date) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) {
        navigate('/login');
        return;
      }

      // Buscar categorias
      let { data: categoriasData, error: categoriasError } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome');

      if (categoriasError) throw categoriasError;
      setCategorias(categoriasData || []);

      // Buscar totais do mês
      const { data: transacoesMes, error: transacoesError } = await supabase
        .from('transacoes_financeiras')
        .select('tipo, valor, conta_pagar_id')
        .eq('user_id', user.id)
        .gte('data', firstDay.toISOString())
        .lte('data', lastDay.toISOString());

      if (transacoesError) throw transacoesError;

      if (transacoesMes) {
        const contaIds = [
          ...new Set(transacoesMes.map(t => t.conta_pagar_id).filter(Boolean))
        ];
        const contasPorId = new Map<string, { status: string }>();

        if (contaIds.length > 0) {
          const { data: contasVinculadas, error: contasError } = await supabase
            .from('contas_pagar')
            .select('id, status')
            .eq('user_id', user.id)
            .in('id', contaIds);

          if (contasError) throw contasError;
          contasVinculadas?.forEach(conta => {
            contasPorId.set(conta.id, { status: conta.status });
          });
        }

        const receitas = transacoesMes
          .filter(t => t.tipo === 'receita')
          .reduce((acc, t) => acc + Number(t.valor), 0);
        const despesas = transacoesMes
          .filter(t => t.tipo === 'despesa')
          .reduce((acc, t) => {
            // Não contar transações que são de contas a pagar ainda não pagas
            if (t.conta_pagar_id) {
              const conta = contasPorId.get(t.conta_pagar_id);
              if (conta && conta.status !== 'pago') {
                return acc;
              }
            }
            return acc + Number(t.valor);
          }, 0);

        setReceitasMes(receitas);
        setDespesasMes(despesas);
        setSaldoMes(receitas - despesas);
      }

      // Buscar transações
      let query = supabase
        .from('transacoes_financeiras')
        .select(`
          *,
          categoria:categorias_financeiras(*)
        `, { count: 'exact' })
        .eq('user_id', user.id)
        .order('data', { ascending: false });

      // Aplicar filtros
      if (busca) {
        query = query.or(`descricao.ilike.%${busca}%`);
      }

      if (tipoFiltro !== 'todos') {
        query.eq('tipo', tipoFiltro);
      }

      if (categoriaFiltro) {
        query.eq('categoria_id', categoriaFiltro);
      }
      
      query
        .gte('data', firstDay.toISOString())
        .lte('data', lastDay.toISOString());

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setTransacoes(data || []);
      setTotalTransacoes(count || 0);
    } catch (error) {
      if (error?.message && !error.message.includes('Failed to fetch')) {
        console.error('Erro ao buscar dados:', error);
      }
      if (error?.message && !error.message.includes('Failed to fetch')) {
        console.error('Erro ao buscar dados:', error);
        toast.error('Erro ao carregar dados financeiros');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(transacao: TransacaoFinanceira) {
    const result = await alerts.confirm({
      title: 'Excluir Transação',
      text: 'Deseja realmente excluir esta transação?',
      icon: 'warning'
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from('transacoes_financeiras')
        .delete()
        .eq('id', transacao.id);

      if (error) throw error;

      toast.success('Transação excluída com sucesso!');
      buscarDados(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    } catch (error) {
      console.error('Erro ao excluir transação:', error);
      toast.error('Erro ao excluir transação');
    }
  }

  // Wrapper para recarregar dados após modificações
  const recarregarDados = () => {
    const { firstDay, lastDay } = getMonthRange(currentDate);
    buscarDados(firstDay, lastDay);
  };

  const totalPaginas = Math.ceil(totalTransacoes / itensPorPagina);

  async function carregarDadosGraficos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar dados dos últimos 6 meses
      const dataFinal = new Date();
      const dataInicial = new Date();
      dataInicial.setMonth(dataInicial.getMonth() - 5);

      const { data: transacoes, error } = await supabase
        .from('transacoes_financeiras')
        .select(`
          *,
          categoria:categorias_financeiras(*)
        `)
        .eq('user_id', user.id)
        .is('conta_pagar_id', null)
        .gte('data', dataInicial.toISOString())
        .lte('data', dataFinal.toISOString());

      if (error) throw error;

      // Processar dados para os gráficos
      const receitasPorCategoria = {};
      const despesasPorCategoria = {};
      const fluxoMensal = Array(6).fill(0).map(() => ({ receitas: 0, despesas: 0 }));

      transacoes.forEach(transacao => {
        const valor = Number(transacao.valor);
        const mes = new Date(transacao.data).getMonth();
        const mesIndex = (mes - dataInicial.getMonth() + 12) % 6;
        const categoriaNome = transacao.categoria?.nome || 'Sem categoria';

        if (transacao.tipo === 'receita') {
          receitasPorCategoria[categoriaNome] = (receitasPorCategoria[categoriaNome] || 0) + valor;
          fluxoMensal[mesIndex].receitas += valor;
        } else {
          despesasPorCategoria[categoriaNome] = (despesasPorCategoria[categoriaNome] || 0) + valor;
          fluxoMensal[mesIndex].despesas += valor;
        }
      });

      setDadosGraficos({
        receitasPorCategoria,
        despesasPorCategoria,
        fluxoMensal
      });
    } catch (error) {
      console.error('Erro ao carregar dados dos gráficos:', error);
      toast.error('Erro ao carregar análises');
    }
  }

  // Configuração dos gráficos
  const fluxoMensalConfig = {
    labels: Array(6).fill(0).map((_, i) => {
      const data = new Date();
      data.setMonth(data.getMonth() - (5 - i));
      return data.toLocaleDateString('pt-BR', { month: 'short' });
    }),
    datasets: [
      {
        label: 'Receitas',
        data: dadosGraficos.fluxoMensal.map(m => m.receitas),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
      },
      {
        label: 'Despesas',
        data: dadosGraficos.fluxoMensal.map(m => m.despesas),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: true,
      }
    ]
  };

  const receitasConfig = {
    labels: Object.keys(dadosGraficos.receitasPorCategoria),
    datasets: [{
      data: Object.values(dadosGraficos.receitasPorCategoria),
      backgroundColor: [
        '#10B981',
        '#3B82F6',
        '#6366F1',
        '#8B5CF6',
        '#EC4899'
      ]
    }]
  };

  const despesasConfig = {
    labels: Object.keys(dadosGraficos.despesasPorCategoria),
    datasets: [{
      label: 'Despesas',
      data: Object.values(dadosGraficos.despesasPorCategoria),
      backgroundColor: [
        '#EF4444',
        '#F59E0B',
        '#F43F5E',
        '#8B5CF6',
        '#64748B'
      ]
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-green-100 dark:from-gray-900 dark:via-teal-900/20 dark:to-emerald-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Cabeçalho Animado */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 dark:shadow-emerald-500/20">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 dark:from-emerald-400 dark:via-teal-400 dark:to-green-400 bg-clip-text text-transparent">
                Financeiro
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Gerencie suas transações e acompanhe o fluxo de caixa
              </p>
            </div>
          </div>
        </motion.div>

        {/* Cabeçalho e Filtros */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Autocomplete
                options={transacoes.map(t => ({ id: t.id, nome: t.descricao }))}
                value={busca}
                onChange={(value) => setBusca(value)}
                placeholder="Buscar transações..."
                className="w-full sm:w-64"
              />
            </div>

            <div className="flex space-x-2">
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as any)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg shadow-sm text-gray-900 dark:text-gray-100 transition-all"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Saídas</option>
              </select>

              <Autocomplete
                value={categoriaFiltro}
                onChange={(value) => setCategoriaFiltro(value)}
                options={categorias.map(c => ({ id: c.id, nome: c.nome }))}
                placeholder="Todas as Categorias"
                className="w-48"
              >
              </Autocomplete>
            </div>

            <div className="flex space-x-2 flex-wrap">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setModalTransacaoAberto(true)}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 dark:from-emerald-500 dark:to-teal-500 text-white font-medium rounded-xl transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-emerald-500/30 dark:shadow-emerald-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Nova Transação</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setModalCategoriaAberto(true)}
                className="px-4 py-2 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 font-medium rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 flex items-center space-x-2 border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-lg"
              >
                <Filter className="w-5 h-5" />
                <span>Categorias</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setModalImportarCSVAberto(true)}
                className="px-4 py-2 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 font-medium rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 flex items-center space-x-2 border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-lg"
              >
                <Upload className="w-5 h-5" />
                <span>Importar CSV</span>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Card de Atalho - Notas Fiscais */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div 
            onClick={() => navigate('/notas-fiscais')}
            className="bg-gradient-to-r from-emerald-500 via-teal-500 to-green-500 dark:from-emerald-600 dark:via-teal-600 dark:to-green-600 rounded-2xl p-6 shadow-xl shadow-emerald-500/30 dark:shadow-emerald-500/20 cursor-pointer hover:shadow-2xl hover:shadow-emerald-500/40 dark:hover:shadow-emerald-500/30 transition-all duration-300 transform hover:scale-[1.02] group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Notas Fiscais de Serviço (NFS-e)</h3>
                  <p className="text-white/90 text-sm mt-1">
                    Gere, visualize e gerencie suas notas fiscais eletrônicas
                  </p>
                </div>
              </div>
              <div className="hidden md:flex items-center space-x-2 text-white/90 group-hover:translate-x-1 transition-transform duration-300">
                <span className="text-sm font-medium">Acessar</span>
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Cards de Resumo */}
        <div className="grid gap-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-300 group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Receitas
                </h3>
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                {formatCurrency(receitasMes)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-300 group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Saídas
                </h3>
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-red-600 to-rose-600 dark:from-red-400 dark:to-rose-400 bg-clip-text text-transparent">
                {formatCurrency(despesasMes)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-300 group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Saldo do Mês
                </h3>
                <div className={`w-10 h-10 bg-gradient-to-br rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
                  saldoMes >= 0 ? 'from-blue-500 to-cyan-600' : 'from-orange-500 to-amber-600'
                }`}>
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
              <p className={`text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${
                saldoMes >= 0 
                  ? 'from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400' 
                  : 'from-orange-600 to-amber-600 dark:from-orange-400 dark:to-amber-400'
              }`}>
                {formatCurrency(saldoMes)}
              </p>
            </motion.div>
          </div>
        </div>

        {/* Atalho para Transações */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => navigate('/transacoes')}
            className="w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl dark:hover:shadow-gray-900/50 transition-all duration-300 flex items-center justify-between group"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Lista de Transações</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Visualize e gerencie todas as suas transações financeiras</p>
              </div>
            </div>
            <ArrowRight className="w-6 h-6 text-gray-400 dark:text-gray-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
          </motion.button>
        </motion.div>

        {/* Gráficos Analíticos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Fluxo Mensal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="lg:col-span-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              📊 Fluxo de Caixa - Últimos 6 Meses
            </h3>
            <div className="h-[300px]">
              <Line data={fluxoMensalConfig} options={chartOptions} />
            </div>
          </motion.div>

          {/* Receitas por Categoria */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              💚 Receitas por Categoria
            </h3>
            <div className="h-[300px]">
              <Doughnut data={receitasConfig} options={chartOptions} />
            </div>
          </motion.div>

          {/* Despesas por Categoria */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              📉 Saídas por Categoria
            </h3>
            <div className="h-[300px]">
              <Bar 
                data={despesasConfig}
                options={{
                  ...chartOptions,
                  indexAxis: 'y' as const,
                  plugins: {
                    ...chartOptions.plugins,
                    legend: {
                      display: false
                    }
                  },
                  scales: {
                    x: {
                      grid: {
                        display: false
                      }
                    },
                    y: {
                      grid: {
                        display: false
                      }
                    }
                  }
                }}
              />
            </div>
          </motion.div>

          {/* Comparativo Mensal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              📊 Comparativo Mensal
            </h3>
            <div className="h-[300px]">
              <Bar 
                data={{
                  labels: ['Receitas', 'Saídas'],
                  datasets: [{
                    data: [receitasMes, despesasMes],
                    backgroundColor: ['#10B981', '#EF4444'],
                    label: 'Valores'
                  }]
                }}
                options={{
                  ...chartOptions,
                  plugins: {
                    ...chartOptions.plugins,
                    legend: {
                      display: false
                    }
                  }
                }}
              />
            </div>
          </motion.div>
        </div>

        {/* Modais */}
        <TransacaoModal
          isOpen={modalTransacaoAberto}
          onClose={() => {
            setModalTransacaoAberto(false);
            setTransacaoParaEditar(undefined);
          }}
          transacaoParaEditar={transacaoParaEditar}
          categorias={categorias}
          onSuccess={recarregarDados}
        />

        <CategoriaFinanceiraModal
          isOpen={modalCategoriaAberto}
          onClose={() => setModalCategoriaAberto(false)}
          onSuccess={recarregarDados}
        />

        <ImportarCSVModal
          isOpen={modalImportarCSVAberto}
          onClose={() => setModalImportarCSVAberto(false)}
          categorias={categorias}
          onSuccess={recarregarDados}
        />
      </div>
    </div>
  );
}
