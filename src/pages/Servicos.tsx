import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { ServicoModal } from '../components/ServicoModal';
import type { Servico } from '../types/database';

export function Servicos() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [servicoParaEditar, setServicoParaEditar] = useState<Servico>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalServicos, setTotalServicos] = useState(0);
  const itensPorPagina = 10;

  useEffect(() => {
    buscarServicos();
  }, [pagina, busca]);

  async function buscarServicos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let query = supabase
        .from('servicos')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('nome');

      if (busca) {
        query = query.ilike('nome', `%${busca}%`);
      }

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setServicos(data || []);
      setTotalServicos(count || 0);
    } catch (error) {
      console.error('Erro ao buscar serviços:', error);
      toast.error('Erro ao carregar serviços');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(servico: Servico) {
    if (!confirm(`Deseja realmente excluir o serviço ${servico.nome}?`)) return;

    try {
      const { error } = await supabase
        .from('servicos')
        .delete()
        .eq('id', servico.id);

      if (error) throw error;

      toast.success('Serviço excluído com sucesso!');
      buscarServicos();
    } catch (error) {
      console.error('Erro ao excluir serviço:', error);
      toast.error('Erro ao excluir serviço');
    }
  }

  const totalPaginas = Math.ceil(totalServicos / itensPorPagina);

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 dark:from-transparent dark:via-transparent dark:to-transparent">
        <div className="responsive-page">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <motion.div 
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30"
              >
                <Wrench className="w-6 h-6 text-white" />
              </motion.div>
              <h1 className="responsive-heading bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                Serviços
              </h1>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
            >
              <div className="relative w-full sm:w-72">
                <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar serviços..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 dark:border-purple-500/20 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-emerald-500 w-full sm:w-64 bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg transition-all duration-200 text-gray-900 dark:text-gray-100"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setServicoParaEditar(undefined);
                  setModalAberto(true);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 dark:shadow-emerald-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Novo Serviço</span>
              </motion.button>
            </motion.div>
          </div>

          {/* Desktop - Tabela */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden md:block glass dark:glass-dark rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-100 dark:border-purple-500/10"
          >
            <div className="responsive-table-wrap">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-900/10 dark:to-teal-900/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-2 h-2 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-teal-600 dark:bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-cyan-600 dark:bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </td>
                    </tr>
                  ) : servicos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        Nenhum serviço encontrado
                      </td>
                    </tr>
                  ) : (
                    servicos.map((servico, index) => (
                      <motion.tr
                        key={servico.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all duration-200"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {servico.nome}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-md">
                          <div className="line-clamp-2">{servico.descricao}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 text-right">
                          {servico.valor.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-3">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                setServicoParaEditar(servico);
                                setModalAberto(true);
                              }}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
                            >
                              <Pencil className="w-5 h-5" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleExcluir(servico)}
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
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-teal-600 dark:bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-cyan-600 dark:bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            ) : servicos.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhum serviço encontrado</div>
            ) : (
              servicos.map((servico, index) => (
                <motion.div
                  key={servico.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass dark:glass-dark rounded-xl shadow-lg dark:shadow-2xl border border-gray-100 dark:border-purple-500/10 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{servico.nome}</h3>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        {servico.valor.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })}
                      </p>
                    </div>
                  </div>

                  {servico.descricao && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{servico.descricao}</p>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setServicoParaEditar(servico);
                        setModalAberto(true);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Editar</span>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleExcluir(servico)}
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
          {totalServicos > itensPorPagina && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 px-4 py-3 glass dark:glass-dark rounded-lg flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {servicos.length} de {totalServicos} resultados
              </p>
              <div className="flex items-center space-x-2">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
                >
                  <ChevronLeft className="w-5 h-5" />
                </motion.button>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  Página {pagina + 1} de {totalPaginas}
                </span>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                  disabled={pagina >= totalPaginas - 1}
                  className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <ServicoModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setServicoParaEditar(undefined);
        }}
        servicoParaEditar={servicoParaEditar}
        onSuccess={buscarServicos}
      />
    </>
  );
}
