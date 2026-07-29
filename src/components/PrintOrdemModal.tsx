import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Printer, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { OrdemServico } from '../types/database';
import {
  buildOrderDocumentHtml,
  DEFAULT_ORDER_DOCUMENT_CONFIG,
  normalizeOrderDocumentConfig,
  type CompanyDocumentConfig,
  type OrderDocumentTemplateConfig,
} from '../utils/order-document-template';
import { listDocumentTemplates, loadBrandLogoDataUrl } from '../utils/tenant-customization-service';

interface PrintOrdemModalProps {
  isOpen: boolean;
  onClose: () => void;
  ordem: OrdemServico;
}

export function PrintOrdemModal({ isOpen, onClose, ordem }: PrintOrdemModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState<CompanyDocumentConfig>({});
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [templateName, setTemplateName] = useState('Padrão do sistema');
  const [config, setConfig] = useState<OrderDocumentTemplateConfig>(DEFAULT_ORDER_DOCUMENT_CONFIG);
  const [paymentConditions, setPaymentConditions] = useState<OrdemServico['condicoes_pagamento']>([]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      supabase.from('configuracoes_empresa').select('*').maybeSingle(),
      listDocumentTemplates<OrderDocumentTemplateConfig>(),
      loadBrandLogoDataUrl().catch(() => ''),
      supabase.from('os_condicoes_pagamento').select('*').eq('ordem_servico_id', ordem.id).neq('status', 'cancelado').order('ordem', { ascending: true }),
    ])
      .then(([companyResult, templates, logo, conditionsResult]) => {
        if (!active) return;
        if (companyResult.error && companyResult.error.code !== 'PGRST116') throw companyResult.error;
        const selected = templates.find((template) => template.is_default) || templates[0];
        setCompany(companyResult.data || {});
        setLogoDataUrl(logo);
        setTemplateName(selected?.name || 'Padrão do sistema');
        setConfig(normalizeOrderDocumentConfig(selected?.config_json));
        if (conditionsResult.error) throw conditionsResult.error;
        setPaymentConditions(conditionsResult.data || []);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message || 'Não foi possível carregar o modelo do documento.');
        setConfig(DEFAULT_ORDER_DOCUMENT_CONFIG);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [isOpen, ordem.id]);

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('O navegador bloqueou a janela de impressão. Autorize pop-ups para continuar.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildOrderDocumentHtml({ ordem: { ...ordem, condicoes_pagamento: paymentConditions }, company, logoDataUrl, config, autoPrint: true }));
    printWindow.document.close();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
          >
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Imprimir ordem de serviço</h2>
                  <p className="mt-1 text-xs text-gray-500">Modelo: {templateName}</p>
                </div>
                <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-600">
                  <Loader2 className="h-5 w-5 animate-spin" /> Carregando identidade e modelo…
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600">A ordem #{ordem.numero} será gerada com a identidade visual da sua empresa.</p>
                  {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                  <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Cancelar</button>
                    <button onClick={handlePrint} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700">
                      <Printer className="h-4 w-4" /> Imprimir / salvar PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
