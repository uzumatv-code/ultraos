import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Repeat, DollarSign, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { capitalize } from '../utils/formatters';
import type { ContaPagar, CategoriaFinanceira, Periodicidade } from '../types/database';

interface ContaPagarModalProps {
  isOpen: boolean;
  onClose: () => void;
  contaParaEditar?: ContaPagar;
  categorias: CategoriaFinanceira[];
  onSuccess: () => void;
}

export function ContaPagarModal({
  isOpen,
  onClose,
  contaParaEditar,
  categorias,
  onSuccess
}: ContaPagarModalProps) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [recorrente, setRecorrente] = useState(false);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal');
  const [observacoes, setObservacoes] = useState('');
  const [status, setStatus] = useState<'pendente' | 'atrasado' | 'pago'>('pendente');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contaParaEditar) {
      setDescricao(contaParaEditar.descricao);
      setValor(contaParaEditar.valor.toString());
      setDataVencimento(new Date(contaParaEditar.data_vencimento).toISOString().split('T')[0]);
      setCategoriaId(contaParaEditar.categoria_id || '');
      setRecorrente(contaParaEditar.recorrente);
      setPeriodicidade(contaParaEditar.periodicidade);
      setObservacoes(contaParaEditar.observacoes || '');
      setStatus(contaParaEditar.status as 'pendente' | 'atrasado' | 'pago');
    } else {
      limparFormulario();
    }
  }, [contaParaEditar]);

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

      if (contaParaEditar) {
        const { error } = await supabase
          .from('contas_pagar')
          .update({
            descricao: capitalize(descricao),
            valor: valorNumerico,
            data_vencimento: new Date(dataVencimento).toISOString(),
            categoria_id: categoriaId,
            recorrente,
            periodicidade,
            observacoes,
            status: status
          })
          .eq('id', contaParaEditar.id)
          .eq('user_id', user.id);

        if (error) throw error;
        toast.success('Conta atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('contas_pagar')
          .insert([{
            descricao: capitalize(descricao),
            valor: valorNumerico,
            data_vencimento: new Date(dataVencimento).toISOString(),
            categoria_id: categoriaId,
            recorrente,
            periodicidade,
            observacoes,
            user_id: user.id
          }]);

        if (error) throw error;
        toast.success('Conta cadastrada com sucesso!');
      }

      onSuccess();
      onClose();
      limparFormulario();
    } catch (error) {
      console.error('Erro ao salvar conta:', error);
      toast.error('Erro ao salvar conta');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setDescricao('');
    setValor('');
    setDataVencimento('');
    setCategoriaId('');
    setRecorrente(false);
    setPeriodicidade('mensal');
    setObservacoes('');
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
                  {contaParaEditar ? 'Editar Conta' : 'Nova Conta'}
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
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={descricao}
                    onChange={(e) => setDescricao(capitalize(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Ex: Aluguel"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
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
                    Data de Vencimento
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="date"
                      value={dataVencimento}
                      onChange={(e) => setDataVencimento(e.target.value)}
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
                    {categorias
                      .filter(c => c.tipo === 'despesa')
                      .map((categoria) => (
                        <option key={categoria.id} value={categoria.id}>
                          {categoria.nome}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Campo de Status - só aparece ao editar */}
                {contaParaEditar && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as 'pendente' | 'atrasado' | 'pago')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                      <option value="pendente">Pendente</option>
                      <option value="atrasado">Atrasado</option>
                      <option value="pago">Pago</option>
                    </select>
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Repeat className="w-5 h-5 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        Conta Recorrente
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={recorrente}
                        onChange={(e) => setRecorrente(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {recorrente && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Periodicidade
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <select
                          value={periodicidade}
                          onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        >
                          <option value="diaria">Diária</option>
                          <option value="semanal">Semanal</option>
                          <option value="quinzenal">Quinzenal</option>
                          <option value="mensal">Mensal</option>
                          <option value="bimestral">Bimestral</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="semestral">Semestral</option>
                          <option value="anual">Anual</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    rows={3}
                    placeholder="Observações adicionais..."
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
                    className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <span>{contaParaEditar ? 'Atualizar' : 'Cadastrar'}</span>
                    )}
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