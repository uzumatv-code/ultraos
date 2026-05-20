import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { capitalize } from '../utils/formatters';
import type { Servico } from '../types/database';

interface ServicoModalProps {
  isOpen: boolean;
  onClose: () => void;
  servicoParaEditar?: Servico;
  onSuccess: () => void;
}

export function ServicoModal({ isOpen, onClose, servicoParaEditar, onSuccess }: ServicoModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);

  function formatarNomeAoDigitar(value: string) {
    return capitalize(value);
  }

  function formatarValor(value: string) {
    value = value.replace(/\D/g, '');
    value = value.replace(/(\d)(\d{2})$/, '$1,$2');
    value = value.replace(/(?=(\d{3})+(\D))\B/g, '.');
    return value;
  }

  useEffect(() => {
    if (servicoParaEditar) {
      setNome(servicoParaEditar.nome);
      setDescricao(servicoParaEditar.descricao || '');
      setValor(servicoParaEditar.valor.toFixed(2).replace('.', ','));
    }
  }, [servicoParaEditar]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const nomeFormatado = formatarNomeAoDigitar(nome);
      const valorNumerico = parseFloat(valor.replace('.', '').replace(',', '.'));

      if (servicoParaEditar) {
        const { error } = await supabase
          .from('servicos')
          .update({
            nome: nomeFormatado,
            descricao,
            valor: valorNumerico
          })
          .eq('id', servicoParaEditar.id)
          .eq('user_id', user.id);

        if (error) throw error;
        toast.success('Serviço atualizado com sucesso! 🛠️');
      } else {
        const { error } = await supabase
          .from('servicos')
          .insert([{
            nome: nomeFormatado,
            descricao,
            valor: valorNumerico,
            user_id: user.id,
          }]);

        if (error) throw error;
        toast.success('Serviço cadastrado com sucesso! 🛠️');
      }

      onSuccess();
      onClose();
      limparFormulario();
    } catch (error) {
      console.error('Erro ao salvar serviço:', error);
      toast.error('Erro ao salvar serviço. Tente novamente! ⚠️');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setNome('');
    setDescricao('');
    setValor('');
  }

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
                  {servicoParaEditar ? 'Editar Serviço' : 'Novo Serviço'}
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
                    Nome do Serviço
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(formatarNomeAoDigitar(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="Regulagem Básica"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="Detalhes do serviço..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      R$
                    </span>
                    <input
                      type="text"
                      value={valor}
                      onChange={(e) => setValor(formatarValor(e.target.value))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                      placeholder="0,00"
                      required
                    />
                  </div>
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
                    {loading ? 'Salvando...' : servicoParaEditar ? 'Atualizar' : 'Cadastrar'}
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