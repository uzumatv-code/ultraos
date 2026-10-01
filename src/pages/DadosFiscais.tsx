import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Building2, CheckCircle2, FileKey2, FlaskConical, Landmark, Loader2, Receipt, Rocket,
  Save, Search, ShieldCheck, Trash2, UploadCloud, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { Badge, Meter, PageHeader, Panel, UIButton } from '../components/ui';
import type { Tone } from '../components/ui';

type Enquadramento = 'mei' | 'simples' | 'normal';
type Ambiente = 'homologacao' | 'producao';

interface Form {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_municipal: string;
  inscricao_estadual: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  uf: string;
  codigo_municipio: string;
  municipio_nome: string;
  telefone: string;
  email: string;
  enquadramento: Enquadramento;
  reg_ap_trib_sn: number;
  aliquota_iss: string;
  codigo_tributacao_nacional: string;
  item_lista_servico: string;
  codigo_cnae: string;
  codigo_tributacao_municipio: string;
  serie_rps: string;
  ultimo_numero_rps: string;
  ambiente: Ambiente;
}

interface CertStatus {
  titular: string;
  cnpj: string | null;
  valido_ate: string;
  expirado: boolean;
  cnpj_confere: boolean;
}

interface NfseStatus {
  empresa_configurada: boolean;
  campos_faltando: string[];
  ambiente: Ambiente;
  certificado: CertStatus | null;
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const SERVICE_PRESETS = [
  { code: '140101', item: '14.01', label: 'Conserto, manutenção e revisão de objetos e equipamentos (ex.: luthieria, regulagem)' },
  { code: '140501', item: '14.05', label: 'Restauração, recondicionamento, pintura, polimento e acabamento de objetos' },
  { code: '140201', item: '14.02', label: 'Assistência técnica' },
];

const empty: Form = {
  razao_social: '', nome_fantasia: '', cnpj: '', inscricao_municipal: '', inscricao_estadual: '', cep: '', endereco: '', numero: '',
  complemento: '', bairro: '', uf: '', codigo_municipio: '', municipio_nome: '', telefone: '', email: '',
  enquadramento: 'simples', reg_ap_trib_sn: 1, aliquota_iss: '5.00', codigo_tributacao_nacional: '140101', item_lista_servico: '14.01',
  codigo_cnae: '', codigo_tributacao_municipio: '', serie_rps: '1', ultimo_numero_rps: '0', ambiente: 'homologacao',
};

const digits = (value: string) => value.replace(/\D/g, '');
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function maskCnpj(value: string) {
  const d = digits(value).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCep(value: string) {
  return digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

function isValidCnpj(value: string) {
  const d = digits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let i = 0; i < length; i += 1) {
      sum += Number(d[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

interface City { id: number; nome: string }
const cityCache = new Map<string, City[]>();
async function citiesOf(uf: string): Promise<City[]> {
  if (!uf) return [];
  const cached = cityCache.get(uf);
  if (cached) return cached;
  const list = await getJson<City[]>(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
  cityCache.set(uf, list);
  return list;
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="ui-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>}
    </label>
  );
}

function Step({ icon: Icon, title, done, text }: { icon: LucideIcon; title: string; done: boolean; text: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${done ? 'border-signal-success/40 bg-signal-success/5' : 'border-hairline'}`}>
      <span className={`ui-icon-tile ui-icon-tile-md ${done ? 'ui-tone-success' : 'ui-tone-neutral'}`}>{done ? <CheckCircle2 /> : <Icon />}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="text-xs leading-snug text-ink-muted">{text}</p>
      </div>
    </div>
  );
}

export function DadosFiscais() {
  const [form, setForm] = useState<Form>(empty);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [status, setStatus] = useState<NfseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await apiRequest<NfseStatus>('/api/nfse/status'));
    } catch {
      /* o painel de prontidão é complementar */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('empresa_fiscal').select('*').eq('user_id', user.id).maybeSingle();
          if (data) {
            setRecordId(data.id);
            setForm({
              ...empty,
              ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === null || value === undefined ? (empty as unknown as Record<string, unknown>)[key] ?? '' : value])),
              cnpj: maskCnpj(String(data.cnpj || '')),
              cep: maskCep(String(data.cep || '')),
              aliquota_iss: Number(data.aliquota_iss ?? 5).toFixed(2),
              ultimo_numero_rps: String(data.ultimo_numero_rps ?? 0),
              enquadramento: (data.enquadramento as Enquadramento) || (data.optante_simples_nacional ? 'simples' : 'normal'),
            } as Form);
          }
        }
      } finally {
        setLoading(false);
      }
      void loadStatus();
    })();
  }, [loadStatus]);

  useEffect(() => {
    let alive = true;
    citiesOf(form.uf).then((list) => alive && setCities(list)).catch(() => alive && setCities([]));
    return () => { alive = false; };
  }, [form.uf]);

  async function lookupCnpj() {
    if (!isValidCnpj(form.cnpj)) return toast.error('CNPJ inválido. Confira os números.');
    setLookingUp(true);
    try {
      const data = await getJson<Record<string, string | number | null>>(`https://brasilapi.com.br/api/cnpj/v1/${digits(form.cnpj)}`);
      const uf = String(data.uf || '');
      const list = await citiesOf(uf).catch(() => [] as City[]);
      setCities(list);
      const ibge = String(data.codigo_municipio_ibge || '');
      const byName = list.find((city) => normalize(city.nome) === normalize(String(data.municipio || '')));
      const phone = String(data.ddd_telefone_1 || '').trim();
      setForm((current) => ({
        ...current,
        razao_social: String(data.razao_social || current.razao_social),
        nome_fantasia: String(data.nome_fantasia || current.nome_fantasia || ''),
        cep: maskCep(String(data.cep || current.cep)),
        endereco: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(' ') || current.endereco,
        numero: String(data.numero || current.numero),
        complemento: String(data.complemento || current.complemento || ''),
        bairro: String(data.bairro || current.bairro),
        uf,
        codigo_municipio: ibge.length === 7 ? ibge : byName ? String(byName.id) : current.codigo_municipio,
        municipio_nome: String(data.municipio || current.municipio_nome),
        telefone: phone || current.telefone,
        email: String(data.email || current.email || '').toLowerCase(),
      }));
      toast.success('Dados preenchidos pela Receita Federal. Confira e complete a inscrição municipal.');
    } catch {
      toast.error('Não consegui consultar o CNPJ agora. Preencha manualmente.');
    } finally {
      setLookingUp(false);
    }
  }

  async function lookupCep() {
    const cep = digits(form.cep);
    if (cep.length !== 8) return;
    try {
      const data = await getJson<Record<string, string>>(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      const list = await citiesOf(data.state).catch(() => [] as City[]);
      setCities(list);
      const city = list.find((item) => normalize(item.nome) === normalize(data.city));
      setForm((current) => ({
        ...current,
        endereco: data.street || current.endereco,
        bairro: data.neighborhood || current.bairro,
        uf: data.state || current.uf,
        municipio_nome: data.city || current.municipio_nome,
        codigo_municipio: city ? String(city.id) : current.codigo_municipio,
      }));
    } catch {
      /* CEP não encontrado: o usuário preenche manualmente */
    }
  }

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!isValidCnpj(form.cnpj)) list.push('CNPJ válido');
    if (!form.razao_social.trim()) list.push('Razão social');
    if (digits(form.cep).length !== 8) list.push('CEP');
    if (!form.endereco.trim() || !form.numero.trim() || !form.bairro.trim()) list.push('Endereço completo');
    if (digits(form.codigo_municipio).length !== 7) list.push('Município');
    if (digits(form.codigo_tributacao_nacional).length !== 6) list.push('Código do serviço (6 dígitos)');
    if (form.enquadramento === 'normal' && !(Number(form.aliquota_iss) > 0)) list.push('Alíquota de ISS');
    return list;
  }, [form]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (problems.length) return toast.error(`Falta preencher: ${problems.join(', ')}.`);
    if (form.ambiente === 'producao' && status?.ambiente !== 'producao') {
      const result = await alerts.confirm({
        title: 'Emitir notas de verdade?',
        text: 'Em Produção, cada nota emitida tem valor fiscal e gera obrigações. Teste antes em Homologação.',
        icon: 'warning',
        confirmButtonText: 'Sim, usar Produção',
      });
      if (!result.isConfirmed) return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      const payload = {
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim() || null,
        cnpj: digits(form.cnpj),
        inscricao_municipal: form.inscricao_municipal.trim(),
        inscricao_estadual: form.inscricao_estadual.trim() || null,
        cep: digits(form.cep),
        endereco: form.endereco.trim(),
        numero: form.numero.trim(),
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim(),
        uf: form.uf,
        codigo_municipio: digits(form.codigo_municipio),
        municipio_nome: form.municipio_nome || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        enquadramento: form.enquadramento,
        reg_ap_trib_sn: form.reg_ap_trib_sn,
        regime_tributacao: form.enquadramento === 'mei' ? 5 : form.enquadramento === 'simples' ? 6 : 1,
        optante_simples_nacional: form.enquadramento !== 'normal',
        aliquota_iss: Number(form.aliquota_iss) || 0,
        codigo_tributacao_nacional: digits(form.codigo_tributacao_nacional),
        item_lista_servico: form.item_lista_servico.trim() || '14.01',
        codigo_cnae: form.codigo_cnae.trim() || null,
        codigo_tributacao_municipio: form.codigo_tributacao_municipio.trim() || null,
        serie_rps: digits(form.serie_rps) || '1',
        ultimo_numero_rps: Math.max(0, Number(form.ultimo_numero_rps) || 0),
        ambiente: form.ambiente,
        updated_at: new Date().toISOString(),
      };
      const { error } = recordId
        ? await supabase.from('empresa_fiscal').update(payload).eq('id', recordId)
        : await supabase.from('empresa_fiscal').insert([{ ...payload, user_id: user.id, created_at: new Date().toISOString() }]);
      if (error) throw error;
      toast.success('Dados fiscais salvos.');
      if (!recordId) {
        const { data } = await supabase.from('empresa_fiscal').select('id').eq('user_id', user.id).maybeSingle();
        setRecordId(data?.id ?? null);
      }
      await loadStatus();
    } catch (error) {
      console.error('Erro ao salvar dados fiscais:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar os dados fiscais.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadCertificate() {
    if (!certFile) return toast.error('Escolha o arquivo do certificado (.pfx ou .p12).');
    if (!certPassword) return toast.error('Informe a senha do certificado.');
    if (!recordId) return toast.error('Salve os dados da empresa primeiro: o certificado precisa do CNPJ para ser conferido.');
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(certFile);
      });
      const next = await apiRequest<NfseStatus>('/api/nfse/certificado', { method: 'POST', body: JSON.stringify({ base64, senha: certPassword }) });
      setStatus(next);
      setCertFile(null);
      setCertPassword('');
      if (fileInput.current) fileInput.current.value = '';
      toast.success('Certificado digital instalado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível instalar o certificado.');
    } finally {
      setUploading(false);
    }
  }

  async function removeCertificate() {
    const result = await alerts.confirm({ title: 'Remover certificado?', text: 'Sem certificado não é possível emitir notas.', icon: 'warning' });
    if (!result.isConfirmed) return;
    try {
      setStatus(await apiRequest<NfseStatus>('/api/nfse/certificado', { method: 'DELETE' }));
      toast.success('Certificado removido.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover o certificado.');
    }
  }

  const cert = status?.certificado ?? null;
  const certOk = Boolean(cert && !cert.expirado && cert.cnpj_confere);
  const companyOk = problems.length === 0 && Boolean(recordId);
  const ready = companyOk && certOk;
  const progress = [companyOk, digits(form.codigo_tributacao_nacional).length === 6 && Boolean(recordId), certOk, ready].filter(Boolean).length;
  const certDays = cert ? Math.ceil((new Date(cert.valido_ate).getTime() - Date.now()) / 86_400_000) : null;

  if (loading) {
    return <div className="ui-page"><div className="flex items-center gap-3 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" /> Carregando dados fiscais…</div></div>;
  }

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Notas fiscais"
        title="Dados fiscais da empresa"
        description="Tudo que a NFS-e precisa para ser emitida em qualquer município do Brasil, pelo Padrão Nacional."
        actions={<Link to="/notas-fiscais" className="ui-btn ui-btn-secondary ui-btn-md"><Receipt className="h-4 w-4" />Ver notas fiscais</Link>}
      />

      <section className="ui-hero mb-6 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`ui-icon-tile ui-icon-tile-lg ${ready ? 'ui-tone-success' : 'ui-tone-warning'}`}>{ready ? <Rocket /> : <AlertTriangle />}</span>
            <div>
              <h2 className="font-display text-lg font-extrabold text-ink">{ready ? 'Pronto para emitir notas' : 'Falta pouco para emitir'}</h2>
              <p className="text-sm text-ink-muted">{ready ? `Ambiente: ${form.ambiente === 'producao' ? 'Produção (valor fiscal)' : 'Homologação (testes, sem valor fiscal)'}.` : 'Complete os passos abaixo.'}</p>
            </div>
          </div>
          <Badge tone={form.ambiente === 'producao' ? 'danger' : 'info'} dot>{form.ambiente === 'producao' ? 'Produção' : 'Homologação'}</Badge>
        </div>
        <Meter value={progress} max={4} tone={ready ? 'success' : 'brand'} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Step icon={Building2} title="Empresa" done={companyOk} text={companyOk ? 'CNPJ, endereço e município completos.' : problems.length ? `Falta: ${problems.slice(0, 3).join(', ')}${problems.length > 3 ? '…' : ''}` : 'Salve para confirmar.'} />
          <Step icon={Landmark} title="Serviço e impostos" done={digits(form.codigo_tributacao_nacional).length === 6 && Boolean(recordId)} text="Enquadramento, código do serviço e ISS." />
          <Step icon={FileKey2} title="Certificado A1" done={certOk} text={cert ? (cert.expirado ? 'Vencido — envie outro.' : !cert.cnpj_confere ? 'CNPJ diferente da empresa.' : `Válido por ${certDays} dias.`) : 'Ainda não enviado.'} />
          <Step icon={ShieldCheck} title="Emissão" done={ready} text={ready ? 'Emita pela tela de Notas fiscais.' : 'Libera quando os passos anteriores estiverem ok.'} />
        </div>
      </section>

      <form onSubmit={save} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          <Panel title="Empresa" subtitle="Como aparece na nota e como a prefeitura identifica você" icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="CNPJ" className="sm:col-span-3" hint={form.cnpj && !isValidCnpj(form.cnpj) && digits(form.cnpj).length === 14 ? 'CNPJ inválido' : undefined}>
                <div className="flex gap-2">
                  <input className="ui-field" inputMode="numeric" value={form.cnpj} onChange={(e) => set('cnpj', maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" required />
                  <UIButton type="button" icon={Search} loading={lookingUp} onClick={() => void lookupCnpj()}>Buscar</UIButton>
                </div>
              </Field>
              <Field label="Inscrição municipal" className="sm:col-span-3" hint="Obrigatória para ME/EPP; MEI normalmente não tem."><input className="ui-field" value={form.inscricao_municipal} onChange={(e) => set('inscricao_municipal', e.target.value)} /></Field>
              <Field label="Razão social" className="sm:col-span-4"><input className="ui-field" value={form.razao_social} onChange={(e) => set('razao_social', e.target.value)} required /></Field>
              <Field label="Nome fantasia" className="sm:col-span-2"><input className="ui-field" value={form.nome_fantasia} onChange={(e) => set('nome_fantasia', e.target.value)} /></Field>
              <Field label="CEP" className="sm:col-span-2"><input className="ui-field" inputMode="numeric" value={form.cep} onChange={(e) => set('cep', maskCep(e.target.value))} onBlur={() => void lookupCep()} required /></Field>
              <Field label="Endereço" className="sm:col-span-3"><input className="ui-field" value={form.endereco} onChange={(e) => set('endereco', e.target.value)} required /></Field>
              <Field label="Número" className="sm:col-span-1"><input className="ui-field" value={form.numero} onChange={(e) => set('numero', e.target.value)} required /></Field>
              <Field label="Complemento" className="sm:col-span-2"><input className="ui-field" value={form.complemento} onChange={(e) => set('complemento', e.target.value)} /></Field>
              <Field label="Bairro" className="sm:col-span-2"><input className="ui-field" value={form.bairro} onChange={(e) => set('bairro', e.target.value)} required /></Field>
              <Field label="Estado" className="sm:col-span-1">
                <select className="ui-field" value={form.uf} onChange={(e) => setForm((c) => ({ ...c, uf: e.target.value, codigo_municipio: '', municipio_nome: '' }))} required>
                  <option value="">UF</option>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </Field>
              <Field label="Município" className="sm:col-span-3" hint={form.codigo_municipio ? `Código IBGE ${form.codigo_municipio}` : 'Escolha o estado primeiro'}>
                <select
                  className="ui-field"
                  value={form.codigo_municipio}
                  onChange={(e) => {
                    const city = cities.find((item) => String(item.id) === e.target.value);
                    setForm((c) => ({ ...c, codigo_municipio: e.target.value, municipio_nome: city?.nome ?? '' }));
                  }}
                  disabled={!form.uf}
                  required
                >
                  <option value="">{form.uf ? (cities.length ? 'Selecione o município' : 'Carregando…') : '—'}</option>
                  {form.codigo_municipio && !cities.some((c) => String(c.id) === form.codigo_municipio) && <option value={form.codigo_municipio}>{form.municipio_nome || form.codigo_municipio}</option>}
                  {cities.map((city) => <option key={city.id} value={city.id}>{city.nome}</option>)}
                </select>
              </Field>
              <Field label="Telefone" className="sm:col-span-3"><input className="ui-field" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
              <Field label="E-mail" className="sm:col-span-3"><input type="email" className="ui-field" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            </div>
          </Panel>

          <Panel title="Serviço e tributação" subtitle="Define como o ISS é calculado e informado" icon={Landmark} tone="warning">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Enquadramento" className="sm:col-span-3">
                <select className="ui-field" value={form.enquadramento} onChange={(e) => set('enquadramento', e.target.value as Enquadramento)}>
                  <option value="mei">MEI — Microempreendedor Individual</option>
                  <option value="simples">Simples Nacional — ME/EPP</option>
                  <option value="normal">Lucro Presumido / Real (fora do Simples)</option>
                </select>
              </Field>
              {form.enquadramento === 'simples' && (
                <Field label="Apuração do ISS no Simples" className="sm:col-span-3">
                  <select className="ui-field" value={form.reg_ap_trib_sn} onChange={(e) => set('reg_ap_trib_sn', Number(e.target.value))}>
                    <option value={1}>Tudo pelo Simples Nacional (mais comum)</option>
                    <option value={2}>Tributos federais no SN e ISS pela NFS-e</option>
                    <option value={3}>Todos fora do Simples</option>
                  </select>
                </Field>
              )}
              {(form.enquadramento === 'normal' || (form.enquadramento === 'simples' && form.reg_ap_trib_sn > 1)) && (
                <Field label="Alíquota de ISS (%)" className="sm:col-span-2" hint="Consulte a lei do seu município (2% a 5%).">
                  <input className="ui-field" inputMode="decimal" value={form.aliquota_iss} onChange={(e) => set('aliquota_iss', e.target.value.replace(',', '.'))} />
                </Field>
              )}
              <div className="sm:col-span-6">
                <span className="ui-label">Serviço prestado (código de tributação nacional)</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {SERVICE_PRESETS.map((preset) => {
                    const active = form.codigo_tributacao_nacional === preset.code;
                    return (
                      <button
                        key={preset.code}
                        type="button"
                        onClick={() => setForm((c) => ({ ...c, codigo_tributacao_nacional: preset.code, item_lista_servico: preset.item }))}
                        className={`rounded-xl border p-3 text-left transition ${active ? 'border-brand/60 bg-brand/10' : 'border-hairline hover:border-brand/40'}`}
                      >
                        <span className="font-mono text-sm font-bold text-ink">{preset.code.replace(/(\d{2})(\d{2})(\d{2})/, '$1.$2.$3')}</span>
                        <span className="mt-1 block text-xs leading-snug text-ink-muted">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Código do serviço (6 dígitos)" className="sm:col-span-2" hint="Aceita outro código da tabela nacional."><input className="ui-field font-mono" inputMode="numeric" maxLength={8} value={form.codigo_tributacao_nacional} onChange={(e) => set('codigo_tributacao_nacional', digits(e.target.value).slice(0, 6))} /></Field>
              <Field label="Item da LC 116" className="sm:col-span-2"><input className="ui-field" value={form.item_lista_servico} onChange={(e) => set('item_lista_servico', e.target.value)} /></Field>
              <Field label="CNAE" className="sm:col-span-2" hint="Opcional."><input className="ui-field" value={form.codigo_cnae} onChange={(e) => set('codigo_cnae', e.target.value)} /></Field>
              <Field label="Código municipal do serviço" className="sm:col-span-3" hint="Só se a prefeitura exigir."><input className="ui-field" value={form.codigo_tributacao_municipio} onChange={(e) => set('codigo_tributacao_municipio', e.target.value)} /></Field>
              <Field label="Série da DPS" className="sm:col-span-1"><input className="ui-field" inputMode="numeric" value={form.serie_rps} onChange={(e) => set('serie_rps', digits(e.target.value).slice(0, 5))} /></Field>
              <Field label="Último número usado" className="sm:col-span-2" hint="A próxima nota usa este número + 1."><input className="ui-field" inputMode="numeric" value={form.ultimo_numero_rps} onChange={(e) => set('ultimo_numero_rps', digits(e.target.value))} /></Field>
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Ambiente" subtitle="Teste antes de valer" icon={FlaskConical} tone="info">
            <div className="space-y-2">
              {([
                ['homologacao', 'Homologação', 'Ambiente de testes do governo. As notas não têm valor fiscal.'],
                ['producao', 'Produção', 'Notas reais, com valor fiscal e impostos.'],
              ] as const).map(([value, title, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('ambiente', value)}
                  aria-pressed={form.ambiente === value}
                  className={`w-full rounded-xl border p-3 text-left transition ${form.ambiente === value ? (value === 'producao' ? 'border-signal-danger/60 bg-signal-danger/10' : 'border-brand/60 bg-brand/10') : 'border-hairline hover:border-brand/40'}`}
                >
                  <span className="flex items-center justify-between text-sm font-bold text-ink">{title}{form.ambiente === value && <BadgeCheck className="h-4 w-4 text-brand-soft" />}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{text}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Certificado digital A1" subtitle="Assina e autentica cada nota" icon={FileKey2} tone="accent">
            {cert ? (
              <div className="mb-4 rounded-xl border border-hairline p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{cert.titular || 'Certificado instalado'}</p>
                    <p className="text-xs text-ink-muted">CNPJ {cert.cnpj ? maskCnpj(cert.cnpj) : '—'}</p>
                  </div>
                  <Badge tone={(cert.expirado || !cert.cnpj_confere ? 'danger' : (certDays ?? 0) < 30 ? 'warning' : 'success') as Tone} dot>
                    {cert.expirado ? 'Vencido' : !cert.cnpj_confere ? 'CNPJ diferente' : `${certDays} dias`}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-ink-subtle">Válido até {new Date(cert.valido_ate).toLocaleDateString('pt-BR')}</p>
                <UIButton type="button" size="sm" variant="ghost" icon={Trash2} className="mt-2 hover:!text-signal-danger" onClick={() => void removeCertificate()}>Remover</UIButton>
              </div>
            ) : (
              <p className="mb-3 text-sm text-ink-muted">Envie o arquivo <b>.pfx</b> ou <b>.p12</b> do seu certificado A1 (e-CNPJ). Ele fica criptografado e só o servidor o usa.</p>
            )}
            <div className="space-y-3">
              <input ref={fileInput} type="file" accept=".pfx,.p12" className="hidden" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline-strong p-4 text-sm text-ink-muted transition hover:border-brand/50 hover:text-ink">
                <UploadCloud className="h-4 w-4" />{certFile ? certFile.name : cert ? 'Trocar certificado' : 'Escolher arquivo do certificado'}
              </button>
              <input type="password" className="ui-field" placeholder="Senha do certificado" autoComplete="new-password" value={certPassword} onChange={(e) => setCertPassword(e.target.value)} />
              <UIButton type="button" block icon={ShieldCheck} loading={uploading} onClick={() => void uploadCertificate()}>Instalar certificado</UIButton>
              {!recordId && <p className="text-xs text-signal-warning">Salve os dados da empresa antes: o CNPJ do certificado é conferido com o seu.</p>}
            </div>
          </Panel>

          <div className="sticky bottom-20 lg:bottom-4">
            <UIButton type="submit" variant="primary" size="lg" icon={Save} loading={saving} block>Salvar dados fiscais</UIButton>
            {problems.length > 0 && <p className="mt-2 text-center text-xs text-ink-muted">Falta: {problems.join(', ')}</p>}
          </div>
        </aside>
      </form>
    </div>
  );
}
