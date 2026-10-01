import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Bot, CalendarClock, CheckCircle2, Clock, Copy, FileText, Hammer, Heart, MessageCircle, RotateCcw,
  Save, Search, Sparkles, Star, Wallet, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import {
  MESSAGE_TEMPLATE_BY_TYPE,
  MESSAGE_TEMPLATE_DEFINITIONS,
} from '../utils/message-template-definitions';
import { TemplateService, type MessageTemplate } from '../utils/template-service';
import { Badge, UIButton } from './ui';

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

const VARIABLE_GROUPS: Array<{ label: string; match: RegExp }> = [
  { label: 'Cliente e ordem', match: /cliente|numero|observacoes|termos/ },
  { label: 'Equipamento', match: /instrumento|marca|modelo|acessorios|servicos|problemas|ultimo_servico/ },
  { label: 'Valores', match: /valor|desconto|forma_pagamento/ },
  { label: 'Datas e prazos', match: /data|previsao|dias_prontos|meses/ },
  { label: 'Sua empresa', match: /empresa|cnpj|horario|dias_funcionamento|instagram|google/ },
];

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  nova_ordem: FileText,
  servico_finalizado: CheckCircle2,
  servico_andamento: Wrench,
  servico_atraso: Clock,
  lembrete_retirada: Bell,
  cobranca_pagamento: Wallet,
  lembrete_manutencao: Hammer,
  orcamento_aprovado: CheckCircle2,
  diagnostico_concluido: Sparkles,
  avaliacao_google_instagram: Star,
};

function groupOf(variable: string) {
  const key = variable.replace(/[{}]/g, '');
  return VARIABLE_GROUPS.find((group) => group.match.test(key))?.label ?? 'Outros';
}

function renderTemplatePreview(content?: string): string {
  if (!content) return '';
  return content.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => PREVIEW_VALUES[key] ?? match).trim();
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~) — o texto é escapado antes, então o HTML é seguro. */
function whatsappHtml(text: string) {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/\n/g, '<br/>');
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
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState('nova_ordem');
  const [currentTemplate, setCurrentTemplate] = useState<MessageTemplate | null>(null);
  const [savedContent, setSavedContent] = useState('');
  const [customized, setCustomized] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = Boolean(currentTemplate && currentTemplate.template_content !== savedContent);

  const loadCustomized = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('message_templates').select('template_type').eq('user_id', user.id).eq('is_active', true);
      setCustomized(new Set((data || []).map((row: { template_type: string }) => row.template_type)));
    } catch {
      /* o selo "personalizado" é só informativo */
    }
  }, []);

  const loadTemplate = useCallback(async (templateType: string) => {
    let template: MessageTemplate | null = defaultTemplate(templateType);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('message_templates')
          .select('*')
          .eq('user_id', user.id)
          .eq('template_type', templateType)
          .eq('is_active', true)
          .single();
        if (!error && data) template = data as MessageTemplate;
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
    }
    setCurrentTemplate(template);
    setSavedContent(template?.template_content ?? '');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadCustomized();
  }, [isOpen, loadCustomized]);

  useEffect(() => {
    if (!isOpen) return;
    void loadTemplate(selectedType);
  }, [isOpen, selectedType, loadTemplate]);

  const saveTemplate = useCallback(async () => {
    if (!currentTemplate) return;
    setSaving(true);
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
      setSavedContent(currentTemplate.template_content);
      setCustomized((current) => new Set(current).add(currentTemplate.template_type));
      toast.success('Template salvo — vale a partir do próximo envio.');
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }, [currentTemplate]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveTemplate();
      }
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, saveTemplate]);

  function insertVariable(variable: string) {
    if (!currentTemplate) return;
    const textarea = textareaRef.current;
    const content = currentTemplate.template_content;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? start;
    setCurrentTemplate({ ...currentTemplate, template_content: `${content.slice(0, start)}${variable}${content.slice(end)}` });
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function wrapSelection(mark: string) {
    if (!currentTemplate) return;
    const textarea = textareaRef.current;
    const content = currentTemplate.template_content;
    const start = textarea?.selectionStart ?? 0;
    const end = textarea?.selectionEnd ?? start;
    const selected = content.slice(start, end) || 'texto';
    setCurrentTemplate({ ...currentTemplate, template_content: `${content.slice(0, start)}${mark}${selected}${mark}${content.slice(end)}` });
    requestAnimationFrame(() => textarea?.focus());
  }

  async function copyContent() {
    if (!currentTemplate) return;
    await navigator.clipboard.writeText(currentTemplate.template_content).catch(() => undefined);
    toast.success('Texto copiado.');
  }

  const definitions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MESSAGE_TEMPLATE_DEFINITIONS.filter((definition) => !term || `${definition.name} ${definition.description}`.toLowerCase().includes(term));
  }, [query]);

  const selectedDefinition = MESSAGE_TEMPLATE_BY_TYPE[selectedType];
  const groupedVariables = useMemo(() => {
    const groups = new Map<string, string[]>();
    (selectedDefinition?.variables ?? []).forEach((variable) => {
      const label = groupOf(variable);
      groups.set(label, [...(groups.get(label) ?? []), variable]);
    });
    return [...groups.entries()];
  }, [selectedDefinition]);

  const preview = renderTemplatePreview(currentTemplate?.template_content);
  const usedVariables = useMemo(() => new Set((currentTemplate?.template_content.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])), [currentTemplate?.template_content]);
  const unknownVariables = [...usedVariables].filter((variable) => !selectedDefinition?.variables.includes(variable));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(event) => event.stopPropagation()}
        className="relative flex h-[100dvh] w-full max-w-[88rem] flex-col overflow-hidden border border-hairline bg-canvas shadow-glass-lg sm:h-[92vh] sm:rounded-2xl"
      >
        <header className="relative flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ui-brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><MessageCircle className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-extrabold text-ink">Mensagens automáticas</h2>
              <p className="truncate text-xs text-ink-muted">Personalize o que seus clientes recebem no WhatsApp. Ctrl+S salva.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty ? <Badge tone="warning" dot>Alterações não salvas</Badge> : <Badge tone="success" dot>Salvo</Badge>}
            <UIButton variant="ghost" size="sm" icon={X} aria-label="Fechar" onClick={onClose} />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[17rem_minmax(0,1fr)_21rem] lg:overflow-hidden">
          {/* Lista */}
          <aside className="border-b border-hairline p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="ui-search mb-3">
              <Search aria-hidden />
              <input className="ui-field" placeholder="Buscar mensagem" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              {definitions.map((definition) => {
                const Icon = TEMPLATE_ICONS[definition.type] ?? Sparkles;
                const active = selectedType === definition.type;
                return (
                  <li key={definition.type} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => setSelectedType(definition.type)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-brand/50 bg-brand/10 shadow-neon' : 'border-transparent hover:border-hairline hover:bg-surface-muted'}`}
                    >
                      <span className={`ui-icon-tile ui-icon-tile-sm ${active ? 'ui-tone-brand' : 'ui-tone-neutral'}`}><Icon /></span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                          <span className="truncate">{definition.name}</span>
                          {customized.has(definition.type) && <Heart className="h-3 w-3 shrink-0 fill-current text-signal-accent" aria-label="Personalizado" />}
                        </span>
                        <span className="mt-0.5 hidden text-xs leading-snug text-ink-muted lg:line-clamp-2">{definition.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {definitions.length === 0 && <li className="p-3 text-sm text-ink-muted">Nada encontrado.</li>}
            </ul>
            <p className="mt-3 hidden items-center gap-1.5 px-1 text-xs text-ink-subtle lg:flex"><Heart className="h-3 w-3 fill-current text-signal-accent" /> mensagem personalizada por você</p>
          </aside>

          {/* Editor */}
          <main className="min-w-0 p-4 sm:p-6 lg:overflow-y-auto">
            {currentTemplate && selectedDefinition && (
              <div className="mx-auto max-w-3xl space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="ui-page-eyebrow">Template</p>
                    <h3 className="mt-1 font-display text-xl font-bold text-ink">{currentTemplate.template_name}</h3>
                    <p className="text-sm text-ink-muted">{selectedDefinition.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <UIButton size="sm" icon={Copy} onClick={() => void copyContent()}>Copiar</UIButton>
                    <UIButton size="sm" icon={RotateCcw} onClick={() => setCurrentTemplate(defaultTemplate(selectedType))}>Restaurar padrão</UIButton>
                  </div>
                </div>

                <label className="block">
                  <span className="ui-label">Nome interno</span>
                  <input className="ui-field" value={currentTemplate.template_name} onChange={(event) => setCurrentTemplate({ ...currentTemplate, template_name: event.target.value })} />
                </label>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="ui-label !mb-0">Mensagem</span>
                    <div className="flex items-center gap-1">
                      {[['*', 'B', 'Negrito'], ['_', 'I', 'Itálico'], ['~', 'S', 'Riscado']].map(([mark, label, title]) => (
                        <button key={mark} type="button" title={title} onClick={() => wrapSelection(mark)} className="h-7 w-7 rounded-md border border-hairline text-xs font-bold text-ink-muted transition hover:border-brand/50 hover:text-ink">{label}</button>
                      ))}
                      <span className="ml-2 text-xs tabular-nums text-ink-subtle">{currentTemplate.template_content.length} caracteres</span>
                    </div>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={currentTemplate.template_content}
                    onChange={(event) => setCurrentTemplate({ ...currentTemplate, template_content: event.target.value })}
                    rows={17}
                    spellCheck
                    className="ui-field !h-auto resize-y !py-3 font-mono text-[0.8125rem] leading-relaxed"
                  />
                  {unknownVariables.length > 0 && (
                    <p className="mt-2 rounded-md border border-signal-warning/40 bg-signal-warning/10 px-3 py-2 text-xs text-signal-warning">
                      Variável desconhecida neste modelo: {unknownVariables.join(', ')}. Ela será enviada como texto, sem substituição.
                    </p>
                  )}
                </div>

                <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-hairline bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <p className="hidden text-xs text-ink-muted sm:block">{dirty ? 'Você tem alterações não salvas.' : 'Tudo salvo e em uso nos envios.'}</p>
                  <UIButton variant="primary" size="lg" icon={Save} loading={saving} disabled={!dirty} onClick={() => void saveTemplate()} className="w-full sm:w-auto">Salvar mensagem</UIButton>
                </div>
              </div>
            )}
          </main>

          {/* Variáveis + prévia */}
          <aside className="space-y-6 border-t border-hairline p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <section>
              <h4 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><Bot className="h-4 w-4 text-brand-soft" /> Prévia no WhatsApp</h4>
              <p className="mb-3 text-xs text-ink-muted">Com dados de exemplo. Clique numa variável para inserir no cursor.</p>
              <div className="ui-phone !max-w-[19rem]">
                <div className="ui-phone-head">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--ui-grad-brand)' }}><MessageCircle className="h-4 w-4 text-white" /></span>
                  <div className="leading-tight"><p>Sua empresa</p><p className="text-[0.65rem] font-normal text-[#8696a0]">comercial</p></div>
                </div>
                <div className="ui-phone-body max-h-[26rem] min-h-[10rem] overflow-y-auto">
                  {preview ? (
                    <div className="ui-bubble ui-bubble-in !max-w-[96%]" dangerouslySetInnerHTML={{ __html: whatsappHtml(preview) }} />
                  ) : (
                    <p className="text-center text-xs text-[#8696a0]">A prévia aparece aqui.</p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><CalendarClock className="h-4 w-4 text-brand-soft" /> Variáveis</h4>
              <div className="space-y-4">
                {groupedVariables.map(([label, variables]) => (
                  <div key={label}>
                    <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {variables.map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() => insertVariable(variable)}
                          className={`rounded-full border px-2.5 py-1 font-mono text-[0.7rem] transition hover:border-brand/60 hover:text-ink ${usedVariables.has(variable) ? 'border-brand/40 bg-brand/10 text-brand-soft' : 'border-hairline text-ink-muted'}`}
                        >
                          {variable}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </motion.div>
    </div>
  );
}
