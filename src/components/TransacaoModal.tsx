import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { capitalize } from '../utils/formatters';
import { toast } from './ToastCustom';
import type { TransacaoFinanceira, CategoriaFinanceira } from '../types/database';

interface TransacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  transacaoParaEditar?: TransacaoFinanceira;
  categorias: CategoriaFinanceira[];
  onSuccess: () => void;
}

export function TransacaoModal({
  isOpen,
  onClose,
  transacaoParaEditar,
  categorias,
  onSuccess
}: TransacaoModalProps) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('receita');
  const [data, setData] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (transacaoParaEditar) {
      setDescricao(transacaoParaEditar.descricao);
      setValor(transacaoParaEditar.valor.toString());
      setTipo(transacaoParaEditar.tipo);
      setData(new Date(transacaoParaEditar.data).toISOString().split('T')[0]);
      setCategoriaId(transacaoParaEditar.categoria_id);
    } else {
      limparFormulario();
    }
  }, [transacaoParaEditar]);

  function formatarValor(value: string) {
    value = value.replace(/\D/g, '');
    value = value.replace(/(\d)(\d{2})$/, '$1,$2');
    value = value.replace(/(?=(\d{3})+(\D))\B/g, '.');
    return value;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const valorNumerico = parseFloat(valor.replace('.', '').replace(',', '.'));

      if (transacaoParaEditar) {
        const { error } = await supabase
          .from('transacoes_financeiras')
          .update({
            descricao,
            valor: valorNumerico,
            tipo,
            data,
            categoria_id: categoriaId
          })
          .eq('id', transacaoParaEditar.id)
          .eq('user_id', user.id);

        if (error) throw error;
        toast.success('Transação atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('transacoes_financeiras')
          .insert([{
            descricao,
            valor: valorNumerico,
            tipo,
            data,
            categoria_id: categoriaId,
            user_id: user.id
          }]);

        if (error) throw error;
        toast.success('Transação cadastrada com sucesso!');
      }

      onSuccess();
      onClose();
      limparFormulario();
    } catch (error) {
      console.error('Erro ao salvar transação:', error);
      toast.error('Erro ao salvar transação');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setDescricao('');
    setValor('');
    setTipo('receita');
    setData(new Date().toISOString().split('T')[0]);
    setCategoriaId('');
  }

  const categoriasFiltradas = categorias.filter(c => c.tipo === tipo);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md relative overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  {transacaoParaEditar ? 'Editar Transação' : 'Nova Transação'}
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                          : 'border-gray-200 text-gray-600  <boltAction type="file" filePath="src/components/TransacaoModal.tsx" contentType="content">hover:bg-gray-50'
                      }`}
                    >
                      Despesa
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={descricao}
                    onChange={(e) => setDescricao(capitalize(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Ex: Compra de materiais"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      R$
                    </span>
                    <input
                      type="text"
                      value={valor}
                      onChange={(e) => setValor(formatarValor(e.target.value))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      placeholder="0,00"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="date"
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  >
                    <option value="">Selecione uma categoria</option>
                    {categoriasFiltradas.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : transacaoParaEditar ? 'Atualizar' : 'Cadastrar'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}