import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, EyeOff, FilePlus2, GripVertical,
  Image, Loader2, Plus, RotateCcw, Save, Trash2, Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import {
  buildOrderDocumentHtml,
  DEFAULT_ORDER_DOCUMENT_CONFIG,
  normalizeOrderDocumentConfig,
  ORDER_BLOCK_LABELS,
  SAMPLE_ORDER_DOCUMENT,
  type CompanyDocumentConfig,
  type OrderDocumentBlock,
  type OrderDocumentTemplateConfig,
} from '../utils/order-document-template';
import {
  deleteBrandLogo,
  deleteDocumentTemplate,
  listDocumentTemplates,
  loadBrandLogoDataUrl,
  saveDocumentTemplate,
  uploadBrandLogo,
  type DocumentTemplateRecord,
} from '../utils/tenant-customization-service';

type CompanyForm = CompanyDocumentConfig & { id?: string; user_id?: string; nome_empresa: string };

const EMPTY_COMPANY: CompanyForm = {
  nome_empresa: 'Sua Empresa', cnpj: '', telefone: '', telefone_empresa: '', email: '', endereco: '',
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function DocumentoOSDesigner() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [company, setCompany] = useState<CompanyForm>(EMPTY_COMPANY);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [templates, setTemplates] = useState<DocumentTemplateRecord<OrderDocumentTemplateConfig>[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [templateName, setTemplateName] = useState('Modelo principal');
  const [config, setConfig] = useState<OrderDocumentTemplateConfig>(normalizeOrderDocumentConfig(DEFAULT_ORDER_DOCUMENT_CONFIG));
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const loadAll = useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      const [companyResult, templateRows, logo] = await Promise.all([
        supabase.from('configuracoes_empresa').select('*').maybeSingle(),
        listDocumentTemplates<OrderDocumentTemplateConfig>(),
        loadBrandLogoDataUrl().catch(() => ''),
      ]);
      if (companyResult.error && companyResult.error.code !== 'PGRST116') throw companyResult.error;
      const companyData = companyResult.data || {};
      setCompany({ ...EMPTY_COMPANY, ...companyData, nome_empresa: companyData.nome_empresa || 'Sua Empresa' });
      setLogoDataUrl(logo);
      setTemplates(templateRows);
      const selected = templateRows.find((item) => item.id === preferredId)
        || templateRows.find((item) => item.is_default)
        || templateRows[0];
      if (selected) {
        setSelectedId(selected.id);
        setTemplateName(selected.name);
        setConfig(normalizeOrderDocumentConfig(selected.config_json));
      } else {
        setSelectedId(undefined);
        setTemplateName('Modelo principal');
        setConfig(normalizeOrderDocumentConfig(DEFAULT_ORDER_DOCUMENT_CONFIG));
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Erro ao carregar personalização'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  function selectTemplate(template: DocumentTemplateRecord<OrderDocumentTemplateConfig>) {
    setSelectedId(template.id);
    setTemplateName(template.name);
    setConfig(normalizeOrderDocumentConfig(template.config_json));
  }

  function startNewTemplate(name = 'Novo modelo', source: OrderDocumentTemplateConfig = config) {
    setSelectedId(undefined);
    setTemplateName(name);
    setConfig(normalizeOrderDocumentConfig(JSON.parse(JSON.stringify(source))));
  }

  function updateConfig<K extends keyof OrderDocumentTemplateConfig>(key: K, value: OrderDocumentTemplateConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function updateBlock(index: number, patch: Partial<OrderDocumentBlock>) {
    setConfig((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block),
    }));
  }

  function moveBlock(from: number, to: number) {
    if (to < 0 || to >= config.blocks.length || from === to) return;
    setConfig((current) => {
      const blocks = [...current.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
      return { ...current, blocks };
    });
  }

  function addCustomText() {
    setConfig((current) => ({
      ...current,
      blocks: [...current.blocks, {
        id: `custom-${crypto.randomUUID()}`,
        type: 'custom_text',
        title: 'Texto personalizado',
        content: 'Digite seu texto. Você pode usar {empresa.nome}, {os.numero}, {cliente.nome}, {os.problemas}, {os.servicos} e {os.valor_total}.',
        visible: true,
      }],
    }));
  }

  async function handleLogoUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      setLogoDataUrl(await uploadBrandLogo(file));
      window.dispatchEvent(new Event('tenant-branding-updated'));
      toast.success('Logo atualizada com segurança para esta empresa');
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Erro ao enviar logo'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    if (!logoDataUrl) return;
    try {
      await deleteBrandLogo();
      setLogoDataUrl('');
      window.dispatchEvent(new Event('tenant-branding-updated'));
      toast.success('Logo removida');
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Erro ao remover logo'));
    }
  }

  async function handleSave() {
    if (!templateName.trim()) return toast.error('Informe o nome do modelo');
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      const companyPayload = {
        id: company.id,
        user_id: user.id,
        nome_empresa: company.nome_empresa.trim(),
        cnpj: company.cnpj || '',
        telefone: company.telefone || '',
        telefone_empresa: company.telefone_empresa || company.telefone || '',
        email: company.email || '',
        endereco: company.endereco || '',
        updated_at: new Date().toISOString(),
      };
      const { error: companyError } = await supabase.from('configuracoes_empresa').upsert(companyPayload, { onConflict: 'user_id' });
      if (companyError) throw companyError;
      const saved = await saveDocumentTemplate({ id: selectedId, name: templateName.trim(), config_json: config, is_default: true });
      window.dispatchEvent(new Event('tenant-branding-updated'));
      toast.success('Identidade e modelo padrão salvos');
      await loadAll(saved.id);
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Erro ao salvar personalização'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate() {
    const selected = templates.find((item) => item.id === selectedId);
    if (!selected) return;
    if (selected.is_default) return toast.error('Defina outro modelo como padrão antes de excluir este');
    if (!window.confirm(`Excluir o modelo “${selected.name}”?`)) return;
    try {
      await deleteDocumentTemplate(selected.id);
      toast.success('Modelo excluído');
      await loadAll();
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Erro ao excluir modelo'));
    }
  }

  const previewHtml = useMemo(() => buildOrderDocumentHtml({
    ordem: SAMPLE_ORDER_DOCUMENT,
    company,
    logoDataUrl,
    config,
  }), [company, config, logoDataUrl]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Carregando editor…</div>;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto max-w-[1600px] p-3 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/configuracoes')} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><ArrowLeft className="h-5 w-5" /></button>
            <div><h1 className="text-xl font-bold text-slate-950 dark:text-white">Identidade e documento da OS</h1><p className="text-sm text-slate-500">Personalização exclusiva desta empresa e compartilhada com sua equipe.</p></div>
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar e definir como padrão
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <aside className="space-y-5">
            <Panel title="Empresa e logo">
              <Field label="Nome da empresa" value={company.nome_empresa} onChange={(value) => setCompany((current) => ({ ...current, nome_empresa: value }))} />
              <div className="grid grid-cols-2 gap-3"><Field label="CNPJ" value={company.cnpj || ''} onChange={(value) => setCompany((current) => ({ ...current, cnpj: value }))} /><Field label="Telefone" value={company.telefone || ''} onChange={(value) => setCompany((current) => ({ ...current, telefone: value, telefone_empresa: value }))} /></div>
              <Field label="E-mail" type="email" value={company.email || ''} onChange={(value) => setCompany((current) => ({ ...current, email: value }))} />
              <Field label="Endereço" value={company.endereco || ''} onChange={(value) => setCompany((current) => ({ ...current, endereco: value }))} />
              <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800">{logoDataUrl ? <img src={logoDataUrl} alt="Logo da empresa" className="max-h-20 max-w-full object-contain" /> : <Image className="h-8 w-8 text-slate-400" />}</div>
                <div className="flex gap-2"><label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"><Upload className="h-4 w-4" />{uploading ? 'Enviando…' : 'Enviar logo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(event) => handleLogoUpload(event.target.files?.[0])} /></label>{logoDataUrl && <button onClick={handleRemoveLogo} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</div>
                <p className="mt-2 text-xs text-slate-500">PNG, JPEG ou WebP, até 2 MB. Armazenamento isolado por empresa.</p>
              </div>
            </Panel>

            <Panel title="Modelos">
              <div className="space-y-2">{templates.map((template) => <button key={template.id} onClick={() => selectTemplate(template)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${selectedId === template.id ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}><span className="truncate">{template.name}</span>{template.is_default && <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase">Padrão</span>}</button>)}</div>
              <Field label="Nome do modelo em edição" value={templateName} onChange={setTemplateName} />
              <div className="grid grid-cols-2 gap-2"><button onClick={() => startNewTemplate()} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"><FilePlus2 className="h-4 w-4" /> Novo</button><button onClick={() => startNewTemplate(`${templateName} - cópia`)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"><Copy className="h-4 w-4" /> Duplicar</button></div>
              {selectedId && <button onClick={handleDeleteTemplate} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"><Trash2 className="h-4 w-4" /> Excluir modelo</button>}
            </Panel>
          </aside>

          <main className="min-w-0 rounded-2xl border border-slate-200 bg-slate-300 p-3 shadow-inner dark:border-slate-800 dark:bg-slate-800 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Prévia em tempo real</span><span className="text-xs text-slate-500">Dados demonstrativos</span></div>
            <iframe title="Prévia do documento" srcDoc={previewHtml} className={`mx-auto block w-full rounded bg-white shadow-xl ${config.pageOrientation === 'landscape' ? 'aspect-[1.414/1]' : 'aspect-[1/1.414]'}`} />
          </main>

          <aside className="space-y-5">
            <Panel title="Aparência">
              <div className="grid grid-cols-2 gap-3"><ColorField label="Cor principal" value={config.primaryColor} onChange={(value) => updateConfig('primaryColor', value)} /><ColorField label="Fundo dos títulos" value={config.accentColor} onChange={(value) => updateConfig('accentColor', value)} /><ColorField label="Texto" value={config.textColor} onChange={(value) => updateConfig('textColor', value)} /><ColorField label="Texto secundário" value={config.mutedColor} onChange={(value) => updateConfig('mutedColor', value)} /></div>
              <SelectField label="Fonte" value={config.fontFamily} onChange={(value) => updateConfig('fontFamily', value as OrderDocumentTemplateConfig['fontFamily'])} options={['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana']} />
              <div className="grid grid-cols-2 gap-3"><SelectField label="Página" value={config.pageOrientation} onChange={(value) => updateConfig('pageOrientation', value as 'portrait' | 'landscape')} options={[['portrait', 'A4 retrato'], ['landscape', 'A4 paisagem']]} /><SelectField label="Posição da logo" value={config.logoPosition} onChange={(value) => updateConfig('logoPosition', value as 'left' | 'center' | 'right')} options={[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]} /></div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={config.showBorders} onChange={(event) => updateConfig('showBorders', event.target.checked)} /> Exibir bordas das seções</label>
              <label className="block text-sm"><span className="mb-1 block font-medium">Arredondamento: {config.borderRadius}px</span><input type="range" min="0" max="16" value={config.borderRadius} onChange={(event) => updateConfig('borderRadius', Number(event.target.value))} className="w-full" /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium">Texto do rodapé</span><textarea value={config.footerText} onChange={(event) => updateConfig('footerText', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></label>
            </Panel>

            <Panel title="Elementos e posição">
              <p className="text-xs text-slate-500">Arraste os blocos ou use as setas. O modelo mantém o fluxo da página para evitar sobreposição e cortes.</p>
              <div className="space-y-2">{config.blocks.map((block, index) => (
                <div key={block.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) moveBlock(dragIndex, index); setDragIndex(null); }} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center gap-1"><GripVertical className="h-4 w-4 cursor-grab text-slate-400" /><button onClick={() => updateBlock(index, { visible: !block.visible })} className="p-1 text-slate-500">{block.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><input value={block.title} onChange={(event) => updateBlock(index, { title: event.target.value })} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium focus:border-indigo-300" aria-label={`Título de ${ORDER_BLOCK_LABELS[block.type]}`} /><button onClick={() => moveBlock(index, index - 1)} disabled={index === 0} className="p-1 disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button><button onClick={() => moveBlock(index, index + 1)} disabled={index === config.blocks.length - 1} className="p-1 disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>{block.type === 'custom_text' && <button onClick={() => updateConfig('blocks', config.blocks.filter((_, itemIndex) => itemIndex !== index))} className="p-1 text-red-500"><Trash2 className="h-4 w-4" /></button>}</div>
                  {block.type === 'custom_text' && <textarea value={block.content || ''} onChange={(event) => updateBlock(index, { content: event.target.value })} rows={4} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />}
                </div>
              ))}</div>
              <button onClick={addCustomText} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700"><Plus className="h-4 w-4" /> Adicionar texto personalizado</button>
              <button onClick={() => setConfig(normalizeOrderDocumentConfig(DEFAULT_ORDER_DOCUMENT_CONFIG))} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><RotateCcw className="h-4 w-4" /> Restaurar layout padrão</button>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-bold text-slate-950 dark:text-white">{title}</h2>{children}</motion.section>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs"><span className="mb-1 block font-medium">{label}</span><div className="flex items-center gap-2 rounded-lg border border-slate-300 p-1.5 dark:border-slate-700"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-9 cursor-pointer border-0 bg-transparent" /><span className="font-mono text-[11px]">{value}</span></div></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<string | [string, string]> }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">{options.map((option) => { const [optionValue, labelText] = Array.isArray(option) ? option : [option, option]; return <option key={optionValue} value={optionValue}>{labelText}</option>; })}</select></label>;
}
