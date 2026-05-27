import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Music2, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { InstrumentoModal } from '../components/InstrumentoModal';
import type { Instrumento } from '../types/database';

export function Instrumentos() {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [instrumentoParaEditar, setInstrumentoParaEditar] = useState<Instrumento>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalInstrumentos, setTotalInstrumentos] = useState(0);
  const itensPorPagina = 10;

  useEffect(() => {
    buscarInstrumentos();
  }, [pagina, busca]);

  async function buscarInstrumentos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let query = supabase
        .from('instrumentos')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('nome');

      if (busca) {
        query = query.ilike('nome', `%${busca}%`);
      }

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setInstrumentos(data || []);
      setTotalInstrumentos(count || 0);
    } catch (error) {
      console.error('Erro ao buscar instrumentos:', error);
      toast.error('Erro ao carregar instrumentos');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(instrumento: Instrumento) {
    if (!confirm(`Deseja realmente excluir o instrumento ${instrumento.nome}?`)) return;

    try {
      const { error } = await supabase
        .from('instrumentos')
        .delete()
        .eq('id', instrumento.id);

      if (error) throw error;

      toast.success('Instrumento excluído com sucesso!');
      buscarInstrumentos();
    } catch (error) {
      console.error('Erro ao excluir instrumento:', error);
      toast.error('Erro ao excluir instrumento');
    }
  }

  const totalPaginas = Math.ceil(totalInstrumentos / itensPorPagina);

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
                className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/30"
              >
                <Music2 className="w-6 h-6 text-white" />
              </motion.div>
              <h1 className="responsive-heading bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                Instrumentos
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
                  placeholder="Buscar instrumentos..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 dark:border-purple-500/20 rounded-lg focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:border-cyan-500 w-full sm:w-64 bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg transition-all duration-200 text-gray-900 dark:text-gray-100"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setInstrumentoParaEditar(undefined);
                  setModalAberto(true);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 dark:shadow-cyan-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Novo Instrumento</span>
              </motion.button>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass dark:glass-dark rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-100 dark:border-purple-500/10"
          >
            <div className="responsive-table-wrap">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/10 dark:to-blue-900/10">
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
                          <div className="w-2 h-2 bg-cyan-600 dark:bg-cyan-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </td>
                    </tr>
                  ) : instrumentos.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        Nenhum instrumento encontrado
                      </td>
                    </tr>
                  ) : (
                    instrumentos.map((instrumento, index) => (
                      <motion.tr
                        key={instrumento.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all duration-200"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {instrumento.nome}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-3">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                setInstrumentoParaEditar(instrumento);
                                setModalAberto(true);
                              }}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
                            >
                              <Pencil className="w-5 h-5" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleExcluir(instrumento)}
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

            {/* Paginação */}
            <div className="px-6 py-4 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {instrumentos.length} de {totalInstrumentos} resultados
              </p>
              <div className="flex items-center space-x-2">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  className="p-2 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
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
                  className="p-2 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <InstrumentoModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setInstrumentoParaEditar(undefined);
        }}
        instrumentoParaEditar={instrumentoParaEditar}
        onSuccess={buscarInstrumentos}
      />
    </>
  );
}
