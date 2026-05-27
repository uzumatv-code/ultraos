import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Wand2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface MessageTemplate {
  id?: string;
  template_type: string;
  template_name: string;
  template_content: string;
  variables: string[];
  is_active: boolean;
}

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TEMPLATE_TYPES = [
  {
    type: 'nova_ordem',
    name: 'Nova Ordem Criada',
    description: 'Mensagem enviada quando uma nova ordem é criada',
    variables: ['{cliente}', '{instrumento}', '{marca}', '{modelo}', '{numero}', '{acessorios}', '{servicos}', '{problemas}', '{valor}', '{forma_pagamento}', '{data_criacao}', '{previsao_entrega}', '{observacoes}', '{nome_empresa}', '{telefone_empresa}', '{endereco_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
    defaultContent: `Olá {cliente}! 😊

Recebemos seu {instrumento} para reparo/manutenção.

📋 *ORDEM DE SERVIÇO #{numero}*
📅 Data de Entrada: {data_criacao}
🎸 Instrumento: {instrumento} {marca} {modelo}
📦 Acessórios: {acessorios}
⚙️ Serviços: {servicos}
🔧 Problemas Reportados: {problemas}
💰 Valor: {valor}
💳 Forma de Pagamento: {forma_pagamento}
📅 Previsão de Entrega: {previsao_entrega}

{observacoes}

Manteremos você informado sobre o andamento!

📍 {nome_empresa}
📞 {telefone_empresa}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}`
  },
  {
    type: 'servico_finalizado',
    name: 'Serviço Finalizado',
    description: 'Mensagem enviada quando um serviço é finalizado',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{cnpj}', '{horario_funcionamento}', '{dias_funcionamento}'],
    defaultContent: `Olá {cliente}, seu {instrumento} ficou pronto! 🎸

Pode retirar entre:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

📍 {nome_empresa}
CNPJ: {cnpj}

Ordem de Serviço: #{numero}`
  },
  {
    type: 'servico_andamento',
    name: 'Serviço em Andamento',
    description: 'Mensagem informando que o serviço está em andamento',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
    defaultContent: `Olá {cliente}, informamos que seu {instrumento} está em andamento! 🔧

📋 Ordem de Serviço: #{numero}
⚙️ Nossos técnicos estão trabalhando no seu instrumento

📍 {nome_empresa}
📞 Entre em contato se tiver dúvidas

Horário de atendimento:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}`
  },
  {
    type: 'servico_atraso',
    name: 'Contratempo/Atraso',
    description: 'Mensagem informando sobre atrasos no serviço',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
    defaultContent: `Olá {cliente}, informamos sobre um contratempo no seu {instrumento} ⏰

📋 Ordem de Serviço: #{numero}
⚠️ Houve um pequeno atraso no cronograma

Entraremos em contato em breve com nova previsão de entrega.

📍 {nome_empresa}
📞 Entre em contato se tiver dúvidas

Horário de atendimento:
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

Pedimos desculpas pelo inconveniente.`
  },
  {
    type: 'lembrete_retirada',
    name: 'Lembrete de Retirada',
    description: 'Lembrete para clientes retirarem instrumentos prontos',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{nome_empresa}', '{horario_funcionamento}', '{dias_funcionamento}', '{dias_prontos}'],
    defaultContent: `Olá {cliente}! 👋

Lembramos que seu {instrumento} está pronto há {dias_prontos} dias para retirada.

📋 Ordem de Serviço: #{numero}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

📍 {nome_empresa}

Aguardamos você! 😊`
  },
  {
    type: 'cobranca_pagamento',
    name: 'Cobrança/Pagamento',
    description: 'Mensagem para cobrança ou confirmação de pagamento',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{valor}', '{valor_pendente}', '{forma_pagamento}', '{nome_empresa}'],
    defaultContent: `Olá {cliente}! 💳

Referente ao seu {instrumento}:

📋 Ordem de Serviço: #{numero}
💰 Valor total: {valor}
💵 Pendente: {valor_pendente}

Para finalizar, precisamos acertar o pagamento.

📍 {nome_empresa}
📞 Entre em contato para mais detalhes

Obrigado! 😊`
  },
  {
    type: 'lembrete_manutencao',
    name: 'Lembrete Manutenção Preventiva',
    description: 'Lembrete automático para manutenção preventiva (enviado após 6 meses)',
    variables: ['{cliente}', '{instrumento}', '{ultimo_servico}', '{meses_sem_manutencao}', '{nome_empresa}', '{telefone_empresa}', '{horario_funcionamento}', '{dias_funcionamento}'],
    defaultContent: `Olá {cliente}! 👋

Esperamos que você e seu {instrumento} estejam bem! 🎸

Notamos que já faz {meses_sem_manutencao} meses desde sua última manutenção ({ultimo_servico}).

🔧 Que tal agendar uma revisão preventiva?
- Troca de cordas
- Regulagem
- Limpeza e hidratação
- Verificação geral

Uma manutenção regular mantém seu instrumento sempre em perfeito estado! 

📍 {nome_empresa}
📞 {telefone_empresa}
⏰ {horario_funcionamento}
📅 {dias_funcionamento}

Entre em contato para agendar! 😊`
  },
  {
    type: 'orcamento_aprovado',
    name: 'Orçamento Aprovado',
    description: 'Confirmação quando cliente aprova o orçamento',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{servicos}', '{valor}', '{previsao_entrega}', '{nome_empresa}', '{telefone_empresa}'],
    defaultContent: `Olá {cliente}! ✅

Orçamento aprovado para seu {instrumento}!

📋 Ordem de Serviço: #{numero}
⚙️ Serviços autorizados: {servicos}
💰 Valor aprovado: {valor}
📅 Nova previsão: {previsao_entrega}

Iniciaremos os trabalhos imediatamente!

📍 {nome_empresa}
📞 {telefone_empresa}`
  },
  {
    type: 'diagnostico_concluido',
    name: 'Diagnóstico Concluído',
    description: 'Mensagem com resultado do diagnóstico e orçamento',
    variables: ['{cliente}', '{instrumento}', '{numero}', '{problemas_encontrados}', '{servicos_necessarios}', '{valor_orcamento}', '{nome_empresa}', '{telefone_empresa}'],
    defaultContent: `Olá {cliente}! 🔍

Diagnóstico concluído para seu {instrumento}:

📋 Ordem de Serviço: #{numero}
🔧 Problemas encontrados: {problemas_encontrados}
⚙️ Serviços necessários: {servicos_necessarios}
💰 Orçamento: {valor_orcamento}

Aguardamos sua aprovação para prosseguir!

📍 {nome_empresa}
📞 {telefone_empresa}`
  },
  {
    type: 'avaliacao_google_instagram',
    name: 'Solicitação de Avaliação e Instagram',
    description: 'Pedido de avaliação no Google e convite para seguir no Instagram (enviado 7 dias após conclusão)',
    variables: ['{cliente}', '{instrumento}', '{marca}', '{modelo}', '{numero}', '{nome_empresa}', '{telefone_empresa}', '{google_review_link}', '{instagram_handle}'],
    defaultContent: `Olá {cliente}! 😊

Esperamos que esteja satisfeito(a) com o reparo do seu {instrumento} {marca} {modelo}!

🌟 *SUA OPINIÃO É MUITO IMPORTANTE*

Poderia nos ajudar avaliando nosso trabalho no Google? Sua avaliação ajuda outros músicos a nos conhecerem!

👍 Link para avaliar: {google_review_link}

📱 *SIGA-NOS NO INSTAGRAM*
Acompanhe dicas de manutenção, novos projetos e promoções: {instagram_handle}

Muito obrigado pela confiança! 🎸

📍 {nome_empresa}
📞 {telefone_empresa}

#Luthieria #ReparoInstrumentos #MúsicaBrasília`
  }
];

export function TemplatesModal({ isOpen, onClose }: TemplatesModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('nova_ordem');
  const [currentTemplate, setCurrentTemplate] = useState<MessageTemplate | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTemplate(selectedType);
    }
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

      if (error || !data) {
        // Usar template padrão se não existir
        const defaultTemplate = TEMPLATE_TYPES.find(t => t.type === templateType);
        if (defaultTemplate) {
          setCurrentTemplate({
            template_type: defaultTemplate.type,
            template_name: defaultTemplate.name,
            template_content: defaultTemplate.defaultContent,
            variables: defaultTemplate.variables,
            is_active: true
          });
        }
      } else {
        setCurrentTemplate(data);
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
    }
  }

  async function saveTemplate() {
    if (!currentTemplate) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const templateData = {
        user_id: user.id,
        template_type: currentTemplate.template_type,
        template_name: currentTemplate.template_name,
        template_content: currentTemplate.template_content,
        variables: currentTemplate.variables,
        is_active: true
      };

      const { error } = await supabase
        .from('message_templates')
        .upsert(templateData, {
          onConflict: 'user_id,template_type'
        });

      if (error) throw error;

      toast.success('Template salvo com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar template:', error);
      toast.error('Erro ao salvar template: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-2 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-6xl h-[calc(100dvh-1rem)] sm:h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 flex-shrink-0">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-3">
              <Wand2 className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Templates de Mensagens</h2>
                <p className="text-purple-100 text-sm">Personalize suas mensagens WhatsApp</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Sidebar - Lista de Templates */}
          <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col flex-shrink-0 max-h-48 lg:max-h-none">
            <div className="p-4 flex-1 overflow-y-auto">
              <h3 className="font-semibold text-gray-900 mb-4">Tipos de Templates</h3>
              <div className="space-y-2">
                {TEMPLATE_TYPES.map((type) => (
                  <button
                    key={type.type}
                    onClick={() => setSelectedType(type.type)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedType === type.type
                        ? 'bg-purple-100 border-purple-200 text-purple-900'
                        : 'hover:bg-gray-50 border-gray-200 text-gray-700'
                    } border`}
                  >
                    <div className="font-medium">{type.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content - Editor do Template */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Template Info */}
            {currentTemplate && (
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{currentTemplate.template_name}</h4>
                    <p className="text-sm text-gray-600">
                      {TEMPLATE_TYPES.find(t => t.type === selectedType)?.description}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const defaultTemplate = TEMPLATE_TYPES.find(t => t.type === selectedType);
                      if (defaultTemplate) {
                        setCurrentTemplate({
                          template_type: defaultTemplate.type,
                          template_name: defaultTemplate.name,
                          template_content: defaultTemplate.defaultContent,
                          variables: defaultTemplate.variables,
                          is_active: true
                        });
                      }
                    }}
                    className="px-3 py-2 text-sm bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </div>
            )}

            {/* Editor and Variables Area */}
            <div className="flex flex-1 min-h-0 flex-col xl:flex-row">
              {/* Editor */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Form Content */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {currentTemplate && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nome do Template
                        </label>
                        <input
                          type="text"
                          value={currentTemplate.template_name}
                          onChange={(e) => setCurrentTemplate({
                            ...currentTemplate,
                            template_name: e.target.value
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      <div className="flex flex-col" style={{minHeight: '300px'}}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Conteúdo da Mensagem
                        </label>
                        <textarea
                          value={currentTemplate.template_content}
                          onChange={(e) => setCurrentTemplate({
                            ...currentTemplate,
                            template_content: e.target.value
                          })}
                          className="flex-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                          placeholder="Digite sua mensagem aqui..."
                          rows={15}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Fixed Action Buttons */}
                <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={loading}
                      className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      <span>{loading ? 'Salvando...' : 'Salvar Template'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Variables Panel */}
              <div className="w-full xl:w-80 border-t xl:border-t-0 xl:border-l border-gray-200 flex flex-col flex-shrink-0 max-h-56 xl:max-h-none">
                <div className="p-4 flex-1 overflow-y-auto">
                  <h4 className="font-semibold text-gray-900 mb-4">Variáveis Disponíveis</h4>
                  <div className="space-y-2 mb-6">
                    {TEMPLATE_TYPES.find(t => t.type === selectedType)?.variables.map((variable) => (
                      <button
                        key={variable}
                        onClick={() => {
                          if (currentTemplate) {
                            const textarea = document.querySelector('textarea');
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const content = currentTemplate.template_content;
                              const newContent = content.substring(0, start) + variable + content.substring(end);
                              
                              setCurrentTemplate({
                                ...currentTemplate,
                                template_content: newContent
                              });

                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + variable.length, start + variable.length);
                              }, 0);
                            }
                          }
                        }}
                        className="w-full text-left p-2 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition-colors text-sm font-mono"
                      >
                        {variable}
                      </button>
                    ))}
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Preview</h4>
                    <div className="p-3 bg-gray-50 rounded-lg border text-sm max-h-60 overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans">
                        {currentTemplate?.template_content || 'Selecione um template...'}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
