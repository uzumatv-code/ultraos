import { useEffect, useRef, useState } from 'react';
import { Save, Wand2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import {
  MESSAGE_TEMPLATE_BY_TYPE,
  MESSAGE_TEMPLATE_DEFINITIONS,
} from '../utils/message-template-definitions';
import { TemplateService, type MessageTemplate } from '../utils/template-service';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PREVIEW_VALUES: Record<string, string> = {
  cliente: 'João Silva',
  instrumento: 'Violão',
  marca: 'Takamine',
  modelo: 'GD20',
  numero: '123',
  acessorios: 'Capa acolchoada',
  servicos: 'Regulagem, troca de cordas e limpeza',
  problemas: 'Trastejamento nas primeiras casas',
  problemas_encontrados: 'Trastejamento e cordas oxidadas',
  servicos_necessarios: 'Nivelamento de trastes, regulagem e troca de cordas',
  valor: 'R$ 250,00',
  valor_servicos: 'R$ 250,00',
  desconto: 'R$ 0,00',
  valor_pendente: 'R$ 100,00',
  valor_orcamento: 'R$ 250,00',
  forma_pagamento: 'PIX',
  data_criacao: '06/06/2026',
  previsao_entrega: '13/06/2026',
  observacoes: '📝 Observações: Cliente pediu urgência se possível.',
  nome_empresa: 'Sua Empresa',
  telefone_empresa: '(61) 99999-9999',
  endereco_empresa: 'Brasília - DF',
  cnpj: '00.000.000/0001-00',
  horario_funcionamento: '10h às 13h | 14h às 18h',
  dias_funcionamento: 'Segunda a Sábado',
  dias_prontos: '3',
  ultimo_servico: 'Regulagem completa',
  meses_sem_manutencao: '6',
  google_review_link: 'https://g.page/r/seu-perfil/review',
  instagram_handle: '@sua_empresa',
  termos_de_uso: 'Termos de responsabilidade configurados pela empresa.',
};

function renderTemplatePreview(content?: string): string {
  if (!content) return 'Selecione um template...';
  return content.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => PREVIEW_VALUES[key] ?? match).trim();
}

function defaultTemplate(type: string): MessageTemplate | null {
  const definition = MESSAGE_TEMPLATE_BY_TYPE[type];
  if (!definition) return null;
  return {
    template_type: definition.type,
    template_name: definition.name,
    template_content: definition.defaultContent,
    variables: definition.variables,
    is_active: true,
  };
}

export function TemplatesModal({ isOpen, onClose }: TemplatesModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('nova_ordem');
  const [currentTemplate, setCurrentTemplate] = useState<MessageTemplate | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    void loadTemplate(selectedType);
  }, [isOpen, selectedType]);

  async function loadTemplate(templateType: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('template_type', templateType)
        .eq('is_active', true)
        .single();

      setCurrentTemplate(error || !data ? defaultTemplate(templateType) : data as MessageTemplate);
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      setCurrentTemplate(defaultTemplate(templateType));
    }
  }

  async function saveTemplate() {
    if (!currentTemplate) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase.from('message_templates').upsert({
        user_id: user.id,
        template_type: currentTemplate.template_type,
        template_name: currentTemplate.template_name,
        template_content: currentTemplate.template_content,
        variables: currentTemplate.variables,
        is_active: true,
      }, { onConflict: 'user_id,template_type' });

      if (error) throw error;
      TemplateService.clearCache(currentTemplate.template_type);
      toast.success('Template salvo e aplicado aos próximos envios!');
      await loadTemplate(currentTemplate.template_type);
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast.error(`Erro ao salvar template: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function insertVariable(variable: string) {
    if (!currentTemplate) return;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? currentTemplate.template_content.length;
    const end = textarea?.selectionEnd ?? start;
    const content = currentTemplate.template_content;
    setCurrentTemplate({
      ...currentTemplate,
      template_content: `${content.slice(0, start)}${variable}${content.slice(end)}`,
    });
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  if (!isOpen) return null;
  const selectedDefinition = MESSAGE_TEMPLATE_BY_TYPE[selectedType];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:h-[90vh] sm:rounded-2xl">
        <header className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-4 text-white">
          <div>
            <h2 className="text-xl font-bold">Templates de Mensagens</h2>
            <p className="text-sm text-purple-100">O conteúdo salvo será usado no próximo envio, sem cache antigo.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition hover:bg-white/10" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <aside className="w-full flex-shrink-0 overflow-y-auto border-b border-gray-200 p-4 xl:w-72 xl:border-b-0 xl:border-r">
            <h3 className="mb-3 font-semibold text-gray-900">Tipos de template</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {MESSAGE_TEMPLATE_DEFINITIONS.map((definition) => (
                <button
                  key={definition.type}
                  onClick={() => setSelectedType(definition.type)}
                  className={`rounded-lg border p-3 text-left text-sm transition ${selectedType === definition.type ? 'border-purple-300 bg-purple-50 text-purple-800' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="block font-medium">{definition.name}</span>
                  <span className="mt-1 hidden text-xs text-gray-500 xl:block">{definition.description}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {currentTemplate && selectedDefinition && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{currentTemplate.template_name}</h4>
                    <p className="text-sm text-gray-500">{selectedDefinition.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentTemplate(defaultTemplate(selectedType))}
                    className="flex items-center gap-2 rounded-lg border border-purple-200 px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
                  >
                    <Wand2 className="h-4 w-4" /> Restaurar padrão
                  </button>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Nome do template</span>
                  <input
                    value={currentTemplate.template_name}
                    onChange={(event) => setCurrentTemplate({ ...currentTemplate, template_name: event.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Conteúdo da mensagem</span>
                  <textarea
                    ref={textareaRef}
                    value={currentTemplate.template_content}
                    onChange={(event) => setCurrentTemplate({ ...currentTemplate, template_content: event.target.value })}
                    rows={16}
                    className="w-full resize-y rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-purple-500"
                  />
                </label>

                <button
                  onClick={() => void saveTemplate()}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 font-medium text-white transition hover:shadow-lg disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {loading ? 'Salvando...' : 'Salvar template'}
                </button>
              </div>
            )}
          </main>

          <aside className="w-full flex-shrink-0 overflow-y-auto border-t border-gray-200 p-4 xl:w-80 xl:border-l xl:border-t-0">
            <h4 className="mb-3 font-semibold text-gray-900">Variáveis disponíveis</h4>
            <div className="mb-6 grid grid-cols-2 gap-2 xl:grid-cols-1">
              {selectedDefinition?.variables.map((variable) => (
                <button key={variable} onClick={() => insertVariable(variable)} className="rounded-lg border border-gray-200 p-2 text-left font-mono text-xs hover:border-purple-200 hover:bg-purple-50">
                  {variable}
                </button>
              ))}
            </div>
            <h4 className="mb-2 font-semibold text-gray-900">Preview</h4>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-gray-50 p-3 font-sans text-sm">
              {renderTemplatePreview(currentTemplate?.template_content)}
            </pre>
          </aside>
        </div>
      </div>
    </div>
  );
}
