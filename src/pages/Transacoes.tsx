import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Upload, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { formatCurrency } from '../utils/formatters';
import { Autocomplete } from '../components/Autocomplete';
import { TransacaoModal } from '../components/TransacaoModal';
import { CategoriaFinanceiraModal } from '../components/CategoriaFinanceiraModal';
import { ImportarCSVModal } from '../components/ImportarCSVModal';
import type { TransacaoFinanceira, CategoriaFinanceira } from '../types/database';

export function Transacoes() {
  const navigate = useNavigate();
  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTransacaoAberto, setModalTransacaoAberto] = useState(false);
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false);
  const [modalImportarCSVAberto, setModalImportarCSVAberto] = useState(false);
  const [transacaoParaEditar, setTransacaoParaEditar] = useState<TransacaoFinanceira>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalTransacoes, setTotalTransacoes] = useState(0);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'receita' | 'despesa'>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const itensPorPagina = 10;

  useEffect(() => {
    buscarDados();
  }, [pagina, busca, tipoFiltro, categoriaFiltro]);

  async function buscarDados() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Buscar categorias
      const { data: categoriasData } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome');

      setCategorias(categoriasData || []);

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
        query = query.ilike('descricao', `%${busca}%`);
      }

      if (tipoFiltro !== 'todos') {
        query = query.eq('tipo', tipoFiltro);
      }

      if (categoriaFiltro) {
        query = query.eq('categoria_id', categoriaFiltro);
      }

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setTransacoes(data || []);
      setTotalTransacoes(count || 0);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      toast.error('Erro ao carregar transações');
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
      buscarDados();
    } catch (error) {
      console.error('Erro ao excluir transação:', error);
      toast.error('Erro ao excluir transação');
    }
  }

  const totalPaginas = Math.ceil(totalTransacoes / itensPorPagina);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-violet-50 to-indigo-100 dark:from-gray-900 dark:via-purple-900/20 dark:to-indigo-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Cabeçalho Animado */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 dark:from-purple-600 dark:to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 dark:shadow-purple-500/20">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 dark:from-purple-400 dark:via-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Transações
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Visualize e gerencie todas as suas transações financeiras
              </p>
            </div>
          </div>
        </motion.div>

        {/* Filtros e Ações */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar transações..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg shadow-sm text-gray-900 dark:text-gray-100 transition-all"
              />
            </div>

            <div className="flex space-x-2 flex-wrap gap-2">
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as any)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg shadow-sm text-gray-900 dark:text-gray-100 transition-all"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>

              <Autocomplete
                value={categoriaFiltro}
                onChange={(value) => setCategoriaFiltro(value)}
                options={categorias.map(c => ({ id: c.id, nome: c.nome }))}
                placeholder="Todas as Categorias"
                className="w-48"
              />
            </div>

            <div className="flex space-x-2 flex-wrap gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setModalTransacaoAberto(true)}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 dark:from-purple-500 dark:to-indigo-500 text-white font-medium rounded-xl transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-purple-500/30 dark:shadow-purple-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Nova</span>
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
                <span>CSV</span>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Tabela de Transações */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    📅 Data
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    📝 Descrição
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    🏷️ Categoria
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    💰 Valor
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    ⚙️ Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white/50 dark:bg-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 dark:border-purple-400"></div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Carregando transações...</p>
                      </div>
                    </td>
                  </tr>
                ) : transacoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                          <DollarSign className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhuma transação encontrada</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Crie sua primeira transação clicando no botão "Nova"</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transacoes.map((transacao, index) => (
                    <motion.tr
                      key={transacao.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors duration-200 group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">
                        {new Date(transacao.data).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-medium">{transacao.descricao}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border-2 backdrop-blur-sm"
                          style={{
                            backgroundColor: `${transacao.categoria?.cor}15`,
                            borderColor: `${transacao.categoria?.cor}40`,
                            color: transacao.categoria?.cor
                          }}
                        >
                          {transacao.categoria?.nome}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${
                        transacao.tipo === 'receita' 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        <span className="inline-flex items-center gap-1">
                          {transacao.tipo === 'receita' ? '↗' : '↘'}
                          {transacao.tipo === 'despesa' && '-'}
                          {formatCurrency(transacao.valor)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setTransacaoParaEditar(transacao);
                              setModalTransacaoAberto(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleExcluir(transacao)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="px-6 py-4 bg-gradient-to-r from-purple-50 via-violet-50 to-indigo-50 dark:from-purple-900/20 dark:via-violet-900/20 dark:to-indigo-900/20 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
              Mostrando <span className="font-bold text-purple-600 dark:text-purple-400">{transacoes.length}</span> de <span className="font-bold text-purple-600 dark:text-purple-400">{totalTransacoes}</span> transações
            </p>
            <div className="flex items-center space-x-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-gray-700 dark:text-gray-300"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium px-3">
                Página <span className="font-bold text-purple-600 dark:text-purple-400">{pagina + 1}</span> de <span className="font-bold text-purple-600 dark:text-purple-400">{totalPaginas || 1}</span>
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1 || totalPaginas === 0}
                className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-gray-700 dark:text-gray-300"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            </div>
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
  );
}