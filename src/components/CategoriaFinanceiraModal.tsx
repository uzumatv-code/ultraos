import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { capitalize } from '../utils/formatters';
import { toast } from './ToastCustom';
import type { CategoriaFinanceira } from '../types/database';

interface CategoriaFinanceiraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CategoriaFinanceiraModal({
  isOpen,
  onClose,
  onSuccess
}: CategoriaFinanceiraModalProps) {
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('receita');
  const [cor, setCor] = useState('#10B981');
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      buscarCategorias();
    }
  }, [isOpen]);

  async function buscarCategorias() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome');

      if (error) throw error;
      setCategorias(data || []);
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      toast.error('Erro ao carregar categorias');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      if (editando) {
        const { error } = await supabase
          .from('categorias_financeiras')
          .update({ nome, tipo, cor })
          .eq('id', editando)
          .eq('user_id', user.id);

        if (error) throw error;
        toast.success('Categoria atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('categorias_financeiras')
          .insert([{
            nome,
            tipo,
            cor,
            user_id: user.id
          }]);

        if (error) throw error;
        toast.success('Categoria cadastrada com sucesso!');
      }

      limparFormulario();
      buscarCategorias();
      onSuccess();
    } catch (error) {
      console.error('Erro ao salvar categoria:', error);
      toast.error('Erro ao salvar categoria');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir(categoria: CategoriaFinanceira) {
    if (!confirm(`Deseja realmente excluir a categoria ${categoria.nome}?`)) return;

    try {
      const { error } = await supabase
        .from('categorias_financeiras')
        .delete()
        .eq('id', categoria.id);

      if (error) throw error;

      toast.success('Categoria excluída com sucesso!');
      buscarCategorias();
      onSuccess();
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);
      toast.error('Erro ao excluir categoria');
    }
  }

  function handleEditar(categoria: CategoriaFinanceira) {
    setEditando(categoria.id);
    setNome(categoria.nome);
    setTipo(categoria.tipo);
    setCor(categoria.cor);
  }

  function limparFormulario() {
    setNome('');
    setTipo('receita');
    setCor('#10B981');
    setEditando(null);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl relative overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  Categorias Financeiras
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    {editando ? 'Editar Categoria' : 'Nova Categoria'}
                  </h3>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={nome}
                        onChange={(e) => setNome(capitalize(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="Ex: Material de Escritório"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setTipo('receita')}
                          className={`p-2 rounded-lg border text-center transition-colors ${
                            tipo === 'receita'
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Receita
                        </button>
                        <button
                          type="button"
                          onClick={() => setTipo('despesa')}
                          className={`p-2 rounded-lg border text-center transition-colors ${
                            tipo === 'despesa'
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                         Saída
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cor
                      </label>
                      <input
                        type="color"
                        value={cor}
                        onChange={(e) => setCor(e.target.value)}
                        className="w-full h-10 p-1 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      {editando && (
                        <button
                          type="button"
                          onClick={limparFormulario}
                          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {editando ? (
                          <>
                            <Pencil className="w-4 h-4" />
                            <span>Atualizar</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Adicionar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Categorias Existentes
                  </h3>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {categorias.map((categoria) => (
                      <div
                        key={categoria.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: categoria.cor }}
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {categoria.nome}
                          </span>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              categoria.tipo === 'receita'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {categoria.tipo === 'receita' ? 'Receita' : 'Despesa'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditar(categoria)}
                            className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExcluir(categoria)}
                            className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}