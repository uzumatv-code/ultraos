import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { capitalize } from '../utils/formatters';
import type { Cliente } from '../types/database';

interface ClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteParaEditar?: Cliente;
  onSuccess: () => void;
}

export function ClienteModal({ isOpen, onClose, clienteParaEditar, onSuccess }: ClienteModalProps) {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [telefone, setTelefone] = useState('');
  const [loading, setLoading] = useState(false);

  function formatarNomeAoDigitar(value: string) {
    return capitalize(value);
  }

  function maskCPFCNPJ(value: string) {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return numbers
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function maskTelefone(value: string) {
    // Permite o + apenas no início
    const hasPlus = value.includes('+');
    
    // Se tem +, é número internacional
    if (hasPlus) {
      // Remove tudo exceto números
      const numbers = value.replace(/\D/g, '');
      
      // Se não tem números ainda, retorna só o +
      if (numbers.length === 0) {
        return '+';
      }
      
      // Formato internacional: +XX XX XXXXX-XXXX (código país + DDD + número)
      if (numbers.length <= 2) {
        return '+' + numbers;
      } else if (numbers.length <= 4) {
        return '+' + numbers.slice(0, 2) + ' ' + numbers.slice(2);
      } else if (numbers.length <= 9) {
        return '+' + numbers.slice(0, 2) + ' ' + numbers.slice(2, 4) + ' ' + numbers.slice(4);
      } else {
        return '+' + numbers.slice(0, 2) + ' ' + numbers.slice(2, 4) + ' ' + numbers.slice(4, 9) + '-' + numbers.slice(9, 13);
      }
    }
    
    // Formato brasileiro padrão
    const numbers = value.replace(/\D/g, '');
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  }

  function handleCPFCNPJChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setCpfCnpj(maskCPFCNPJ(value));
  }

  function handleTelefoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    // Permite digitar + no início para números internacionais
    const masked = maskTelefone(value);
    console.log('Telefone input:', value, '-> masked:', masked);
    setTelefone(masked);
  }

  useEffect(() => {
    if (clienteParaEditar) {
      setNome(clienteParaEditar.nome);
      setCpfCnpj(maskCPFCNPJ(clienteParaEditar.cpf_cnpj || ''));
      setTelefone(maskTelefone(clienteParaEditar.telefone || ''));
    } else {
      // Limpar formulário quando não há cliente para editar
      setNome('');
      setCpfCnpj('');
      setTelefone('');
    }
  }, [clienteParaEditar]);

  function formatarNome(nome: string) {
    return nome
      .toLowerCase()
      .split(' ')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
      .join(' ');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const nomeFormatado = formatarNome(nome);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      // Para telefone internacional (com +), preserva o + no início
      const telefoneFormatado = telefone.includes('+')
        ? '+' + telefone.replace(/\D/g, '')
        : telefone.replace(/\D/g, '');

      if (clienteParaEditar) {
        const { error } = await supabase
          .from('clientes')
          .update({
            nome: nomeFormatado,
            cpf_cnpj: cpfCnpj.replace(/\D/g, ''),
            telefone: telefoneFormatado,
          })
          .eq('id', clienteParaEditar.id)
          .eq('user_id', user.id);

        if (error) throw error;
        toast.success('Cliente atualizado com sucesso! 🎉');
      } else {
        const { error } = await supabase
          .from('clientes')
          .insert([{
            nome: nomeFormatado,
            cpf_cnpj: cpfCnpj.replace(/\D/g, ''),
            telefone: telefoneFormatado,
            user_id: user.id,
          }]);

        if (error) throw error;
        toast.success('Cliente cadastrado com sucesso! 🎉');
      }

      onSuccess();
      onClose();
      limparFormulario();
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      toast.error('Erro ao salvar cliente. Tente novamente! ⚠️');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setNome('');
    setCpfCnpj('');
    setTelefone('');
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
                  {clienteParaEditar ? 'Editar Cliente' : 'Novo Cliente'}
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
                    Nome e Sobrenome
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(formatarNomeAoDigitar(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="João Silva"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CPF/CNPJ
                  </label>
                  <input
                    type="text"
                    value={cpfCnpj}
                    onChange={handleCPFCNPJChange}
                    maxLength={18}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="000.000.000-00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={telefone}
                    onChange={handleTelefoneChange}
                    maxLength={20}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="(00) 00000-0000 ou +XX XX XXXXX-XXXX"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Para internacional, use + seguido do código do país</p>
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
                    {loading ? 'Salvando...' : clienteParaEditar ? 'Atualizar' : 'Cadastrar'}
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