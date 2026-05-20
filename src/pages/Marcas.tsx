import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { MarcaModal } from '../components/MarcaModal';
import type { Marca } from '../types/database';

export function Marcas() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [marcaParaEditar, setMarcaParaEditar] = useState<Marca>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalMarcas, setTotalMarcas] = useState(0);
  const itensPorPagina = 10;

  useEffect(() => {
    buscarMarcas();
  }, [pagina, busca]);

  async function buscarMarcas() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let query = supabase
        .from('marcas')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('nome');

      if (busca) {
        query = query.ilike('nome', `%${busca}%`);
      }

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setMarcas(data || []);
      setTotalMarcas(count || 0);
    } catch (error) {
      console.error('Erro ao buscar marcas:', error);
      toast.error('Erro ao carregar marcas');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(marca: Marca) {
    if (!confirm(`Deseja realmente excluir a marca ${marca.nome}?`)) return;

    try {
      const { error } = await supabase
        .from('marcas')
        .delete()
        .eq('id', marca.id);

      if (error) throw error;

      toast.success('Marca excluída com sucesso!');
      buscarMarcas();
    } catch (error) {
      console.error('Erro ao excluir marca:', error);
      toast.error('Erro ao excluir marca');
    }
  }

  const totalPaginas = Math.ceil(totalMarcas / itensPorPagina);

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
                className="w-12 h-12 bg-gradient-to-br from-orange-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30"
              >
                <Bookmark className="w-6 h-6 text-white" />
              </motion.div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 dark:from-orange-400 dark:to-pink-400 bg-clip-text text-transparent">
                Marcas
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
                  placeholder="Buscar marcas..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 dark:border-purple-500/20 rounded-lg focus:ring-2 focus:ring-orange-500 dark:focus:ring-orange-400 focus:border-orange-500 w-full sm:w-64 bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg transition-all duration-200 text-gray-900 dark:text-gray-100"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setMarcaParaEditar(undefined);
                  setModalAberto(true);
                }}
                className="px-4 py-2 bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-700 hover:to-pink-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-orange-500/30 dark:shadow-orange-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Nova Marca</span>
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
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-orange-50/50 to-pink-50/50 dark:from-orange-900/10 dark:to-pink-900/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-2 h-2 bg-orange-600 dark:bg-orange-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-pink-600 dark:bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-red-600 dark:bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </td>
                    </tr>
                  ) : marcas.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        Nenhuma marca encontrada
                      </td>
                    </tr>
                  ) : (
                    marcas.map((marca, index) => (
                      <motion.tr
                        key={marca.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-all duration-200"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {marca.nome}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-3">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                setMarcaParaEditar(marca);
                                setModalAberto(true);
                              }}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
                            >
                              <Pencil className="w-5 h-5" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleExcluir(marca)}
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
                  <div className="w-2 h-2 bg-orange-600 dark:bg-orange-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-pink-600 dark:bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-red-600 dark:bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            ) : marcas.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma marca encontrada</div>
            ) : (
              marcas.map((marca, index) => (
                <motion.div
                  key={marca.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass dark:glass-dark rounded-xl shadow-lg dark:shadow-2xl border border-gray-100 dark:border-purple-500/10 p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{marca.nome}</h3>
                  </div>

                  <div className="flex items-center space-x-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setMarcaParaEditar(marca);
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
                      onClick={() => handleExcluir(marca)}
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
          {totalMarcas > itensPorPagina && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 px-4 py-3 glass dark:glass-dark rounded-lg flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {marcas.length} de {totalMarcas} resultados
              </p>
              <div className="flex items-center space-x-2">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  className="p-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
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
                  className="p-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <MarcaModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setMarcaParaEditar(undefined);
        }}
        marcaParaEditar={marcaParaEditar}
        onSuccess={buscarMarcas}
      />
    </>
  );
}