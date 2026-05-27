import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Check, AlertTriangle, TrendingDown, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { ContaPagarModal } from '../components/ContaPagarModal';
import { CustomCalendarBills } from '../components/CustomCalendarBills';
import { ModernCalendarBills } from '../components/ModernCalendarBills';
import { formatCurrency } from '../utils/formatters';
import type { ContaPagar, CategoriaFinanceira } from '../types/database';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateBR(value?: string) {
  if (!value) return '-';
  const [datePart] = value.split('T');
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return new Date(value).toLocaleDateString('pt-BR');
  return `${day}/${month}/${year}`;
}

function getMonthRange(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextMonthFirstDay = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    monthStart: toDateInput(firstDay),
    nextMonthStart: toDateInput(nextMonthFirstDay),
  };
}

export function ContasPagar() {
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [contaParaEditar, setContaParaEditar] = useState<ContaPagar>();
  const [buscaCategoria, setBuscaCategoria] = useState('');
  const [pagina, setPagina] = useState(0);
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'pendente' | 'atrasado' | 'pago'>('todos');
  const itensPorPagina = 10;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [totalMes, setTotalMes] = useState(0);
  const [quantidadeAPagarMes, setQuantidadeAPagarMes] = useState(0);
  const [totalPagoMes, setTotalPagoMes] = useState(0);
  const [contasAtrasadas, setContasAtrasadas] = useState<ContaPagar[]>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showCalendar, setShowCalendar] = useState(true);
  const [calendarType, setCalendarType] = useState<'custom' | 'modern'>('custom');
  const [contasCalendario, setContasCalendario] = useState<ContaPagar[]>([]);

  // Função para obter o primeiro e último dia do mês
  useEffect(() => {
    buscarDados();
    buscarContasCalendario();
  }, [currentDate]);

  useEffect(() => {
    setPagina(0);
  }, [globalFilter, buscaCategoria, statusFiltro, currentDate]);

  async function buscarContasCalendario() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('contas_pagar')
        .select(`
          *,
          categoria:categorias_financeiras(*)
        `)
        .eq('user_id', user.id)
        .order('data_vencimento', { ascending: true });

      if (error) throw error;

      setContasCalendario(data || []);
    } catch (error) {
      console.error('Erro ao buscar contas para o calendário:', error);
    }
  }

  async function buscarDados() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Buscar contas atrasadas
      const { data: contasAtrasadasData } = await supabase
        .from('contas_pagar')
        .select(`
          *,
          categoria:categorias_financeiras(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'atrasado')
        .order('data_vencimento', { ascending: true });

      setContasAtrasadas(contasAtrasadasData || []);

      const { monthStart, nextMonthStart } = getMonthRange(currentDate);

      // Buscar total do mês
      const [{ data: contasPendentes }, { data: contasPagas }] = await Promise.all([
        supabase
        .from('contas_pagar')
        .select('valor, status')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .gte('data_vencimento', monthStart)
        .lt('data_vencimento', nextMonthStart),
        
        supabase
        .from('contas_pagar')
        .select('valor, status')
        .eq('user_id', user.id)
        .eq('status', 'pago')
        .gte('data_vencimento', monthStart)
        .lt('data_vencimento', nextMonthStart)
      ]);

      const totalPendente = contasPendentes?.reduce((acc, conta) => 
        acc + Number(conta.valor), 0) || 0;
      const totalPago = contasPagas?.reduce((acc, conta) => 
        acc + Number(conta.valor), 0) || 0;

      setTotalMes(totalPendente);
      setQuantidadeAPagarMes(contasPendentes?.length || 0);
      setTotalPagoMes(totalPago);

      // Buscar categorias
      const { data: categoriasData } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome');

      setCategorias(categoriasData || []);

      // Buscar contas
      const query = supabase
        .from('contas_pagar')
        .select(`
          *,
          categoria:categorias_financeiras(*)
        `)
        .eq('user_id', user.id)
        .order('data_vencimento', { ascending: true })
        .gte('data_vencimento', monthStart)
        .lt('data_vencimento', nextMonthStart);

      const { data, error } = await query;

      if (error) throw error;

      setContas(data || []);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      toast.error('Erro ao carregar contas');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletar(conta: ContaPagar) {
    if (!confirm(`Deseja realmente excluir a conta ${conta.descricao}?`)) return;

    try {
      const { error } = await supabase
        .from('contas_pagar')
        .delete()
        .eq('id', conta.id);

      if (error) throw error;

      toast.success('Conta excluída com sucesso!');
      // Se a página atual ficar vazia após exclusão, volte para a anterior
      if (paginatedContas.length === 1 && pagina > 0) {
        setPagina(pagina - 1);
      } else {
        await buscarDados();
      }
      await buscarContasCalendario();
    } catch (error) {
      console.error('Erro ao excluir conta:', error);
      toast.error('Erro ao excluir conta');
    }
  }

  async function handlePagar(conta: ContaPagar) {
    try {
      const sessionRaw = localStorage.getItem('mysql-auth-session');
      const token = sessionRaw ? JSON.parse(sessionRaw)?.access_token : null;
      const response = await fetch(`/api/financeiro/contas-pagar/${conta.id}/pagar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          forma_pagamento: conta.forma_pagamento
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error?.message || 'Erro ao pagar conta');

      toast.success('Conta paga e despesa lancada!');
      await buscarDados();
      await buscarContasCalendario();
    } catch (error) {
      console.error('Erro ao pagar conta:', error);
      toast.error('Erro ao pagar conta');
    }
  }

  // Filtro global client-side
  const filteredContas = useMemo(() => {
    let result = contas;
    if (globalFilter) {
      result = result.filter(conta => {
        const values = [
          conta.descricao,
          conta.categoria?.nome,
          conta.status,
          formatCurrency(conta.valor),
          formatDateBR(conta.data_vencimento)
        ].join(' ').toLowerCase();
        return values.includes(globalFilter.toLowerCase());
      });
    }
    if (statusFiltro !== 'todos') {
      result = result.filter(conta => conta.status === statusFiltro);
    }
    if (buscaCategoria) {
      result = result.filter(conta => conta.categoria_id === buscaCategoria);
    }
    return result;
  }, [contas, globalFilter, statusFiltro, buscaCategoria]);

  // Paginação client-side
  const paginatedContas = useMemo(() => {
    const start = pagina * itensPorPagina;
    return filteredContas.slice(start, start + itensPorPagina);
  }, [filteredContas, pagina, itensPorPagina]);

  const totalPaginas = Math.ceil(filteredContas.length / itensPorPagina);

  const statusColors = {
    pendente: 'bg-yellow-100 text-yellow-800',
    atrasado: 'bg-red-100 text-red-800',
    pago: 'bg-green-100 text-green-800',
    cancelado: 'bg-gray-100 text-gray-800'
  };

  // Colunas para TanStack Table
  const columns = useMemo<ColumnDef<ContaPagar, any>[]>(() => [
    {
      header: 'Descrição',
      accessorKey: 'descricao',
    },
    {
      header: 'Categoria',
      accessorFn: row => row.categoria?.nome || '',
      id: 'categoria',
      cell: info => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${info.row.original.categoria?.cor}20`, color: info.row.original.categoria?.cor }}>{info.getValue()}</span>
      ),
    },
    {
      header: 'Vencimento',
      accessorKey: 'data_vencimento',
      cell: info => formatDateBR(info.getValue() as string),
    },
    {
      header: 'Valor',
      accessorKey: 'valor',
      cell: info => formatCurrency(info.getValue()),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: info => {
        const status = info.getValue() as 'pendente' | 'atrasado' | 'pago' | 'cancelado';
        return (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[status]}`}>
            {status === 'pago' ? 'Pago' : status === 'atrasado' ? 'Atrasado' : 'Pendente'}
          </span>
        );
      },
    },
    {
      header: 'Ações',
      id: 'acoes',
      cell: info => (
        <div className="flex items-center justify-end space-x-2">
          {(info.row.original.status === 'pendente' || info.row.original.status === 'atrasado') && (
            <button onClick={() => handlePagar(info.row.original)} className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-all duration-200"><Check className="w-5 h-5" /></button>
          )}
          <button onClick={() => { setContaParaEditar(info.row.original); setModalAberto(true); }} className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all duration-200"><Pencil className="w-5 h-5" /></button>
          <button onClick={() => handleDeletar(info.row.original)} className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-all duration-200"><Trash2 className="w-5 h-5" /></button>
        </div>
      ),
    },
  ], [setContaParaEditar, setModalAberto, handlePagar, handleDeletar]);

  const table = useReactTable({
    data: paginatedContas,
    columns,
    state: {
      globalFilter,
      pagination: { pageIndex: pagina, pageSize: itensPorPagina },
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPaginas,
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="responsive-page">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-red-200 dark:shadow-red-900/30"
            >
              <DollarSign className="w-7 h-7 text-white" />
            </motion.div>
            <div className="min-w-0">
              <h1 className="responsive-heading text-gradient">
                Contas a Pagar
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Gerencie suas despesas e vencimentos
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setContaParaEditar(undefined);
              setModalAberto(true);
            }}
            variant="primary"
            size="lg"
            className="w-full shadow-lg shadow-primary-200 dark:shadow-primary-900/30 sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span>Nova Conta</span>
          </Button>
        </motion.div>
        
        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6 mb-8">
          <Card variant="glass" hover className="border-l-4 border-red-500">
            <CardContent className="p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Total a Pagar
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
                    {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </p>
                  <motion.p 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-3xl font-bold text-red-600 dark:text-red-500"
                  >
                    {formatCurrency(totalMes)}
                  </motion.p>
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                    {quantidadeAPagarMes} conta(s) pendente(s) ou atrasada(s)
                  </p>
                </div>
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-200 dark:shadow-red-900/30"
                >
                  <TrendingDown className="w-7 h-7 text-white" />
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>

          <Card variant="glass" hover className="border-l-4 border-green-500">
            <CardContent className="p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Total Pago
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
                    {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </p>
                  <motion.p 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl font-bold text-green-600 dark:text-green-500"
                  >
                    {formatCurrency(totalPagoMes)}
                  </motion.p>
                </div>
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: -10 }}
                  className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200 dark:shadow-green-900/30"
                >
                  <Check className="w-7 h-7 text-white" />
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>

          <Card variant="glass" hover className="border-l-4 border-amber-500">
            <CardContent className="p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Contas Atrasadas
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
                    Requer atenção
                  </p>
                  <motion.p 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-3xl font-bold text-amber-600 dark:text-amber-500"
                  >
                    {contasAtrasadas.length}
                  </motion.p>
                </div>
                <motion.div 
                  whileHover={{ scale: 1.1 }}
                  animate={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-200 dark:shadow-amber-900/30"
                >
                  <AlertTriangle className="w-7 h-7 text-white" />
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>
        </div>

        {/* Calendário de Contas */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <div className="glass dark:glass-dark rounded-xl sm:rounded-3xl p-4 sm:p-6 shadow-glass">
            <div className="flex flex-col items-stretch justify-between gap-4 mb-6 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-md">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Calendário de Vencimentos</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {contasCalendario.length} conta(s) cadastrada(s)
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Toggle de tipo de calendário */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <button
                    onClick={() => setCalendarType('custom')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      calendarType === 'custom'
                        ? 'gradient-primary text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Grade
                  </button>
                  <button
                    onClick={() => setCalendarType('modern')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      calendarType === 'modern'
                        ? 'gradient-primary text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Lista
                  </button>
                </div>

                <motion.button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="w-full sm:w-auto text-sm gradient-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {showCalendar ? 'Ocultar' : 'Mostrar'}
                </motion.button>
              </div>
            </div>
            
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                {calendarType === 'custom' ? (
                  <CustomCalendarBills
                    bills={contasCalendario}
                    onEventClick={(conta) => {
                      setContaParaEditar(conta);
                      setModalAberto(true);
                    }}
                    onUpdate={() => {
                      buscarContasCalendario();
                      buscarDados();
                    }}
                    onMonthChange={(date) => {
                      setCurrentDate(date);
                    }}
                    loading={loading}
                  />
                ) : (
                  <ModernCalendarBills
                    bills={contasCalendario}
                    onEventClick={(conta) => {
                      setContaParaEditar(conta);
                      setModalAberto(true);
                    }}
                    onUpdate={() => {
                      buscarContasCalendario();
                      buscarDados();
                    }}
                    onMonthChange={(date) => {
                      setCurrentDate(date);
                    }}
                    loading={loading}
                  />
                )}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Lista de Contas */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-primary-600" />
              Lista de Contas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filtros */}
            <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por descrição ou categoria..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all"
                />
              </div>

              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value as any)}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all lg:w-auto lg:min-w-[180px]"
              >
                <option value="todos">Todos os Status</option>
                <option value="pendente">Pendente</option>
                <option value="atrasado">Atrasado</option>
                <option value="pago">Pago</option>
              </select>

              <select
                value={buscaCategoria}
                onChange={(e) => setBuscaCategoria(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all lg:w-auto lg:min-w-[200px]"
              >
                <option value="">Todas as Categorias</option>
                {categorias
                  .filter(c => c.tipo === 'despesa')
                  .map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </option>
                  ))}
              </select>
            </div>

            {/* Tabela */}
            <div className="responsive-table-wrap rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full min-w-[760px]">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th key={header.id} className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={table.getVisibleFlatColumns().length} className="px-6 py-12 text-center">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="inline-block w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full"
                        />
                        <p className="mt-4 text-gray-500 dark:text-gray-400">Carregando...</p>
                      </td>
                    </tr> 
                  ) : paginatedContas.length === 0 ? (
                    <tr>
                      <td colSpan={table.getVisibleFlatColumns().length} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        <DollarSign className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                        <p className="font-medium">Nenhuma conta encontrada</p>
                        <p className="text-sm mt-1">Tente ajustar os filtros de busca</p>
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row, index) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                Mostrando <span className="font-bold text-primary-600">{paginatedContas.length}</span> de <span className="font-bold text-primary-600">{filteredContas.length}</span> resultados
              </p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  variant="ghost"
                  size="sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium px-3 py-1 bg-white dark:bg-gray-800 rounded-lg">
                  Página <span className="font-bold text-primary-600">{pagina + 1}</span> de {totalPaginas || 1}
                </span>
                <Button
                  onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                  disabled={pagina >= totalPaginas - 1}
                  variant="ghost"
                  size="sm"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ContaPagarModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setContaParaEditar(undefined);
        }}
        contaParaEditar={contaParaEditar}
        categorias={categorias}
        onSuccess={async () => {
          await buscarDados();
          await buscarContasCalendario();
        }}
      />
    </div>
  );
}
