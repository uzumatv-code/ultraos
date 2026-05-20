import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { capitalize } from '../utils/formatters';
import type { Marca } from '../types/database';

interface MarcaModalProps {
  isOpen: boolean;
  onClose: () => void;
  marcaParaEditar?: Marca;
  onSuccess: () => void;
}

export function MarcaModal({ isOpen, onClose, marcaParaEditar, onSuccess }: MarcaModalProps) {
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);

  function formatarNomeAoDigitar(value: string) {
    return capitalize(value);
  }

  useEffect(() => {
    if (marcaParaEditar) {
      setNome(marcaParaEditar.nome);
    }
  }, [marcaParaEditar]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const nomeFormatado = formatarNomeAoDigitar(nome);

      if (marcaParaEditar) {
        const { error } = await supabase
          .from('marcas')
          .update({ nome: nomeFormatado })
          .eq('id', marcaParaEditar.id)
          .eq('user_id', user.id);

        if (error) throw error;
        toast.success('Marca atualizada com sucesso! 🎸');
      } else {
        const { error } = await supabase
          .from('marcas')
          .insert([{
            nome: nomeFormatado,
            user_id: user.id,
          }]);

        if (error) throw error;
        toast.success('Marca cadastrada com sucesso! 🎸');
      }

      onSuccess();
      onClose();
      limparFormulario();
    } catch (error) {
      console.error('Erro ao salvar marca:', error);
      toast.error('Erro ao salvar marca. Tente novamente! ⚠️');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setNome('');
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
                  {marcaParaEditar ? 'Editar Marca' : 'Nova Marca'}
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
                    Nome da Marca
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(formatarNomeAoDigitar(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="Yamaha"
                    required
                  />
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
                    {loading ? 'Salvando...' : marcaParaEditar ? 'Atualizar' : 'Cadastrar'}
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