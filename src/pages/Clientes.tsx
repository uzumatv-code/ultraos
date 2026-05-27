import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { ClienteModal } from '../components/ClienteModal';
import type { Cliente } from '../types/database';

export function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteParaEditar, setClienteParaEditar] = useState<Cliente>();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalClientes, setTotalClientes] = useState(0);
  const itensPorPagina = 10;

  useEffect(() => {
    buscarClientes();
  }, [pagina, busca]);

  async function buscarClientes() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let query = supabase
        .from('clientes')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (busca) {
        query = query.ilike('nome', `%${busca}%`);
      }

      const { data, count, error } = await query
        .range(pagina * itensPorPagina, (pagina + 1) * itensPorPagina - 1);

      if (error) throw error;

      setClientes(data || []);
      setTotalClientes(count || 0);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(cliente: Cliente) {
    if (!confirm(`Deseja realmente excluir o cliente ${cliente.nome}?`)) return;

    try {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', cliente.id);

      if (error) throw error;

      toast.success('Cliente excluído com sucesso!');
      buscarClientes();
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      toast.error('Erro ao excluir cliente');
    }
  }

  function formatarCpfCnpj(valor: string) {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length === 11) {
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/g, '$1.$2.$3-$4');
    }
    return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/g, '$1.$2.$3/$4-$5');
  }

  function formatarTelefone(valor: string) {
    if (!valor) return '';
    
    // Se o número começa com +, é internacional
    const isInternational = valor.startsWith('+');
    const numeros = valor.replace(/\D/g, '');
    
    // Número internacional: +XX XX XXXXX-XXXX
    if (isInternational) {
      const codigoPais = numeros.slice(0, 2);
      const resto = numeros.slice(2);
      if (resto.length <= 2) {
        return `+${codigoPais} ${resto}`;
      } else if (resto.length <= 7) {
        return `+${codigoPais} ${resto.slice(0, 2)} ${resto.slice(2)}`;
      } else {
        return `+${codigoPais} ${resto.slice(0, 2)} ${resto.slice(2, 7)}-${resto.slice(7, 11)}`;
      }
    }
    
    // Formato brasileiro padrão: (XX) XXXXX-XXXX
    if (numeros.length === 11) {
      return numeros.replace(/(\d{2})(\d{5})(\d{4})/g, '($1) $2-$3');
    }
    
    // Telefone fixo: (XX) XXXX-XXXX
    if (numeros.length === 10) {
      return numeros.replace(/(\d{2})(\d{4})(\d{4})/g, '($1) $2-$3');
    }
    
    return valor;
  }

  const totalPaginas = Math.ceil(totalClientes / itensPorPagina);

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
              whileHover={{ scale: 1.1 }}
              className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30"
            >
              <Users className="w-6 h-6 text-white" />
            </motion.div>
            <h1 className="responsive-heading bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
              Clientes
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
                placeholder="Buscar clientes..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-200 dark:border-purple-500/20 rounded-lg focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 w-full sm:w-64 bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg transition-all duration-200 text-gray-900 dark:text-gray-100"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setClienteParaEditar(undefined);
                setModalAberto(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 dark:shadow-purple-500/20"
            >
              <Plus className="w-5 h-5" />
              <span>Novo Cliente</span>
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
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-900/10 dark:to-blue-900/10">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    CPF/CNPJ
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Telefone
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
                        <div className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </td>
                  </tr>
                ) : clientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      Nenhum cliente encontrado
                    </td>
                  </tr>
                ) : (
                  clientes.map((cliente, index) => (
                    <motion.tr
                      key={cliente.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all duration-200"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {cliente.nome}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatarCpfCnpj(cliente.cpf_cnpj)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatarTelefone(cliente.telefone)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-3">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              setClienteParaEditar(cliente);
                              setModalAberto(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
                          >
                            <Pencil className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleExcluir(cliente)}
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
                <div className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhum cliente encontrado</div>
          ) : (
            clientes.map((cliente, index) => (
              <motion.div
                key={cliente.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass dark:glass-dark rounded-xl shadow-lg dark:shadow-2xl border border-gray-100 dark:border-purple-500/10 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{cliente.nome}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{formatarCpfCnpj(cliente.cpf_cnpj)}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium min-w-[80px]">Telefone:</span>
                    <span>{formatarTelefone(cliente.telefone)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setClienteParaEditar(cliente);
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
                    onClick={() => handleExcluir(cliente)}
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
        {totalClientes > itensPorPagina && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 px-4 py-3 glass dark:glass-dark rounded-lg flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0"
          >
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Mostrando {clientes.length} de {totalClientes} resultados
            </p>
            <div className="flex items-center space-x-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
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
                className="p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50 transition-colors duration-200 text-gray-700 dark:text-gray-300"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      <ClienteModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setClienteParaEditar(undefined);
        }}
        clienteParaEditar={clienteParaEditar}
        onSuccess={buscarClientes}
      />
    </div>
    </>
  );
}
