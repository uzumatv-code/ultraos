import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import type { NotaFiscal } from '../types/database';

interface NFSeModalProps {
  nota: NotaFiscal;
  onClose: () => void;
  onSuccess: () => void;
}

export function NFSeModal({ nota, onClose, onSuccess }: NFSeModalProps) {
  const [formData, setFormData] = useState({
    discriminacao: nota.discriminacao || '',
    valor_servicos: nota.valor_servicos || 0,
    aliquota: nota.aliquota || 0,
    iss_retido: nota.iss_retido || false,
    item_lista_servico: nota.item_lista_servico || '',
    codigo_cnae: nota.codigo_cnae || '',
    valor_deducoes: nota.valor_deducoes || 0,
    desconto_incondicionado: nota.desconto_incondicionado || 0,
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Recalcular ISS quando valor ou alíquota mudar
    const valorServicos = Number(formData.valor_servicos) || 0;
    const aliquota = Number(formData.aliquota) || 0;
    const valorDeducoes = Number(formData.valor_deducoes) || 0;
    const valorBase = valorServicos - valorDeducoes;
    const valorISS = (valorBase * aliquota) / 100;
    
    setFormData(prev => ({
      ...prev,
      valor_iss: valorISS
    }));
  }, [formData.valor_servicos, formData.aliquota, formData.valor_deducoes]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.discriminacao.trim()) {
      toast.error('A discriminação dos serviços é obrigatória');
      return;
    }
    
    if (formData.valor_servicos <= 0) {
      toast.error('O valor dos serviços deve ser maior que zero');
      return;
    }
    
    if (!formData.item_lista_servico) {
      toast.error('O item da lista de serviços é obrigatório');
      return;
    }

    setSalvando(true);
    try {
      // Calcular valores
      const valorServicos = Number(formData.valor_servicos) || 0;
      const aliquota = Number(formData.aliquota) || 0;
      const valorDeducoes = Number(formData.valor_deducoes) || 0;
      const valorBase = valorServicos - valorDeducoes;
      const valorISS = (valorBase * aliquota) / 100;

      const { error } = await supabase
        .from('notas_fiscais')
        .update({
          discriminacao: formData.discriminacao,
          valor_servicos: valorServicos,
          aliquota: aliquota,
          valor_iss: valorISS,
          iss_retido: formData.iss_retido,
          item_lista_servico: formData.item_lista_servico,
          codigo_cnae: formData.codigo_cnae || null,
          valor_deducoes: valorDeducoes,
          desconto_incondicionado: formData.desconto_incondicionado || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', nota.id);

      if (error) throw error;

      toast.success('NFS-e atualizada com sucesso!');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao atualizar NFS-e:', error);
      toast.error('Erro ao atualizar NFS-e');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            Editar NFS-e RPS {nota.numero_rps}/{nota.serie_rps}
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-4">
            {/* Discriminação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discriminação dos Serviços *
              </label>
              <textarea
                name="discriminacao"
                value={formData.discriminacao}
                onChange={handleChange}
                rows={6}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Descrição detalhada dos serviços prestados"
                required
              />
            </div>

            {/* Valores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor dos Serviços (R$) *
                </label>
                <input
                  type="number"
                  name="valor_servicos"
                  value={formData.valor_servicos}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor de Deduções (R$)
                </label>
                <input
                  type="number"
                  name="valor_deducoes"
                  value={formData.valor_deducoes}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alíquota ISS (%) *
                </label>
                <input
                  type="number"
                  name="aliquota"
                  value={formData.aliquota}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  max="5"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor ISS (R$)
                </label>
                <input
                  type="number"
                  value={((Number(formData.valor_servicos) - Number(formData.valor_deducoes)) * Number(formData.aliquota) / 100).toFixed(2)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Desconto Incondicionado (R$)
                </label>
                <input
                  type="number"
                  name="desconto_incondicionado"
                  value={formData.desconto_incondicionado}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* Códigos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Lista de Serviços *
                </label>
                <input
                  type="text"
                  name="item_lista_servico"
                  value={formData.item_lista_servico}
                  onChange={handleChange}
                  maxLength={5}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Ex: 14.01"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Código do serviço conforme LC 116/2003
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código CNAE
                </label>
                <input
                  type="text"
                  name="codigo_cnae"
                  value={formData.codigo_cnae}
                  onChange={handleChange}
                  maxLength={7}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Ex: 9529100"
                />
              </div>
            </div>

            {/* ISS Retido */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="iss_retido"
                name="iss_retido"
                checked={formData.iss_retido}
                onChange={handleChange}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="iss_retido" className="text-sm font-medium text-gray-700">
                ISS Retido pelo Tomador
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
