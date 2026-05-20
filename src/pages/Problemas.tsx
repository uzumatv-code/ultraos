import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { ProblemaModal } from '../components/ProblemaModal';
import type { Problema } from '../types/database';

export function Problemas() {
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [problemaParaEditar, setProblemaParaEditar] = useState<Problema>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalProblemas, setTotalProblemas] = useState(0);
  const itensPorPagina = 10;

  useEffect(() => {
    buscarProblemas();
  }, [pagina, busca]);

  async function buscarProblemas() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let query = supabase
        .from('problemas')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('nome');

      if (busca) {
        query = query.ilike('nome', `%${busca}%`);
      }

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setProblemas(data || []);
      setTotalProblemas(count || 0);
    } catch (error) {
      console.error('Erro ao buscar problemas:', error);
      toast.error('Erro ao carregar problemas');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(problema: Problema) {
    if (!confirm(`Deseja realmente excluir o problema ${problema.nome}?`)) return;

    try {
      const { error } = await supabase
        .from('problemas')
        .delete()
        .eq('id', problema.id);

      if (error) throw error;

      toast.success('Problema excluído com sucesso!');
      buscarProblemas();
    } catch (error) {
      console.error('Erro ao excluir problema:', error);
      toast.error('Erro ao excluir problema');
    }
  }

  const totalPaginas = Math.ceil(totalProblemas / itensPorPagina);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 dark:from-transparent dark:via-transparent dark:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-3"
            >
              <motion.div 
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="w-12 h-12 bg-gradient-to-br from-amber-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30"
              >
                <AlertTriangle className="w-6 h-6 text-white" />
              </motion.div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-red-600 dark:from-amber-400 dark:to-red-400 bg-clip-text text-transparent">
                Problemas
              </h1>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex space-x-4"
            >
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar problemas..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 dark:border-purple-500/20 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 focus:border-amber-500 w-full sm:w-64 bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg transition-all duration-200 text-gray-900 dark:text-gray-100"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setProblemaParaEditar(undefined);
                  setModalAberto(true);
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-amber-500/30 dark:shadow-amber-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Novo Problema</span>
              </motion.button>
            </motion.div>
          </div>

          {/* Desktop - Tabela */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden md:block glass dark:glass-dark rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-100 dark:border-purple-500/10"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-50/50 to-red-50/50 dark:from-amber-900/10 dark:to-red-900/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white/50 dark:bg-gray-900/20">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                            className="w-2 h-2 bg-amber-500 rounded-full"
                          />
                          <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                            className="w-2 h-2 bg-amber-500 rounded-full"
                          />
                          <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                            className="w-2 h-2 bg-amber-500 rounded-full"
                          />
                        </div>
                      </td>
                    </tr>
                  ) : problemas.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        Nenhum problema encontrado
                      </td>
                    </tr>
                  ) : (
                    problemas.map((problema) => (
                      <motion.tr
                        key={problema.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors duration-200"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {problema.nome}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-md">
                          <div className="line-clamp-2">{problema.descricao}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-3">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                setProblemaParaEditar(problema);
                                setModalAberto(true);
                              }}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
                            >
                              <Pencil className="w-5 h-5" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleExcluir(problema)}
                              className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                            >
                              <Trash2 className="w-5 h-5" />
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Mobile - Cards */}
          <div className="md:hidden space-y-4">
            {loading ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center space-x-2">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    className="w-3 h-3 bg-amber-500 rounded-full"
                  />
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                    className="w-3 h-3 bg-amber-500 rounded-full"
                  />
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                    className="w-3 h-3 bg-amber-500 rounded-full"
                  />
                </div>
              </div>
            ) : problemas.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhum problema encontrado</div>
            ) : (
              problemas.map((problema) => (
                <motion.div
                  key={problema.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  whileHover={{ scale: 1.02 }}
                  className="glass dark:glass-dark rounded-xl shadow-lg dark:shadow-2xl border border-gray-100 dark:border-purple-500/10 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{problema.nome}</h3>
                    </div>
                  </div>

                  {problema.descricao && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{problema.descricao}</p>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setProblemaParaEditar(problema);
                        setModalAberto(true);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Editar</span>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleExcluir(problema)}
                      className="flex-1 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir</span>
                    </motion.button>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* Paginação */}
          {totalProblemas > itensPorPagina && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 px-4 py-3 glass dark:glass-dark rounded-lg flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0 border border-gray-100 dark:border-purple-500/10"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {problemas.length} de {totalProblemas} resultados
              </p>
              <div className="flex items-center space-x-2">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:hover:bg-transparent transition-colors duration-200 text-gray-700 dark:text-gray-300"
                >
                  <ChevronLeft className="w-5 h-5" />
                </motion.button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Página {pagina + 1} de {totalPaginas}
                </span>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                  disabled={pagina >= totalPaginas - 1}
                  className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:hover:bg-transparent transition-colors duration-200 text-gray-700 dark:text-gray-300"
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <ProblemaModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setProblemaParaEditar(undefined);
        }}
        problemaParaEditar={problemaParaEditar}
        onSuccess={buscarProblemas}
      />
    </>
  );
}