import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, Bot, CheckCircle2, Crown, Mic, PhoneCall, Plus, Save, Send, ShieldCheck, Smartphone, Sparkles, Trash2, Undo2, X, Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { Badge, EmptyState, Panel, Skeleton, UIButton } from '../components/ui';
import type { Tone } from '../components/ui';
import type { FinanceiroIAAutorizado, FinanceiroIALog } from '../types/database';

const MAX_NUMBERS = 5;

const emptyForm = {
  nome: '',
  telefone: '',
  proprietario: true,
  permissao: 'admin' as FinanceiroIAAutorizado['permissao'],
  receber_avisos: true,
  hora_resumo: '08:00',
  hora_lembrete: '16:00',
  ativo: true,
};

type Form = typeof emptyForm;

const logTone: Record<string, { label: string; tone: Tone }> = {
  lancamento_rapido: { label: 'Gasto lançado', tone: 'success' },
  executado: { label: 'Executado', tone: 'success' },
  respondido: { label: 'Respondido', tone: 'info' },
  aguardando_confirmacao: { label: 'Aguardando', tone: 'warning' },
  desfeito: { label: 'Desfeito', tone: 'neutral' },
  negado: { label: 'Negado', tone: 'danger' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  erro: { label: 'Erro', tone: 'danger' },
};

const demoChat: Array<{ from: 'in' | 'out'; text: string }> = [
  { from: 'in', text: 'comprei um café 10,00' },
  { from: 'out', text: '✅ <b>Café</b> — R$ 10,00 lançado\n🏷️ Alimentação\n💸 Hoje: R$ 10,00\n<i>Errou? Responda desfazer.</i>' },
  { from: 'in', text: '🎤 “paguei a conta de luz”' },
  { from: 'out', text: '✅ Baixa feita: <b>Conta de luz</b> — R$ 238,40. A despesa já entrou no caixa.' },
  { from: 'out', text: '☀️ <b>Bom dia! Resumo de hoje</b>\n🔴 Atrasadas (1) — R$ 89,90\n🟠 Vencem hoje (2) — R$ 412,00' },
];

const abilities = [
  { icon: Zap, tone: 'warning' as Tone, title: 'Lance gastos falando', text: 'Texto ou áudio: “gastei 50 no mercado”. Categoria é identificada sozinha.' },
  { icon: Bell, tone: 'danger' as Tone, title: 'Avisos proativos', text: 'Resumo toda manhã e lembrete à tarde com contas atrasadas e a vencer.' },
  { icon: CheckCircle2, tone: 'success' as Tone, title: 'Baixa de contas', text: '“Paguei a internet” — a conta é quitada e vira despesa no caixa.' },
  { icon: Undo2, tone: 'info' as Tone, title: 'Desfazer na hora', text: 'Lançou errado? Responda “desfazer” e o lançamento some.' },
];

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function withCountry(value: string) {
  const clean = digits(value);
  return clean.length === 10 || clean.length === 11 ? `55${clean}` : clean;
}

function formatPhone(value: string) {
  const clean = digits(value).replace(/^55(?=\d{10,11}$)/, '');
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return value;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="ui-switch" onClick={() => onChange(!checked)} />
  );
}

/** Conteúdo estático da demonstração (nunca vem do usuário), por isso o HTML inline é seguro. */
function Bubble({ from, text, delay }: { from: 'in' | 'out'; text: string; delay: number }) {
  return <div className={`ui-bubble ui-bubble-${from}`} style={{ animationDelay: `${delay}ms` }} dangerouslySetInnerHTML={{ __html: text }} />;
}

export function FinanceiroIA() {
  const [authorized, setAuthorized] = useState<FinanceiroIAAutorizado[]>([]);
  const [logs, setLogs] = useState<FinanceiroIALog[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string>('verificando');

  const owner = useMemo(() => authorized.find((item) => item.proprietario && item.ativo), [authorized]);
  const activeCount = useMemo(() => authorized.filter((item) => item.ativo).length, [authorized]);
  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return logs.filter((log) => String(log.created_at).slice(0, 10) === today && log.status !== 'bloqueado').length;
  }, [logs]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [authResult, logResult] = await Promise.all([
        supabase.from('financeiro_ia_autorizados').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('financeiro_ia_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      ]);
      if (authResult.error) throw authResult.error;
      if (logResult.error) throw logResult.error;
      setAuthorized((authResult.data as FinanceiroIAAutorizado[]) || []);
      setLogs((logResult.data as FinanceiroIALog[]) || []);
    } catch (error) {
      console.error('Erro ao carregar o agente financeiro:', error);
      toast.error('Não foi possível carregar o agente financeiro.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Primeiro cadastro é o do proprietário; depois, equipe.
    if (!editingId && !form.nome && !form.telefone) {
      setForm((current) => ({ ...current, proprietario: !owner, permissao: owner ? 'escrita' : 'admin' }));
    }
  }, [owner, editingId, form.nome, form.telefone]);

  useEffect(() => {
    void loadData();
    apiRequest<{ status?: string }>('/api/whatsapp/connection')
      .then((data) => setWhatsapp(data?.status || 'nao_configurado'))
      .catch(() => setWhatsapp('indisponivel'));
  }, [loadData]);

  function startEdit(item: FinanceiroIAAutorizado) {
    setEditingId(item.id);
    setForm({
      nome: item.nome,
      telefone: formatPhone(item.telefone),
      proprietario: Boolean(item.proprietario),
      permissao: item.permissao,
      receber_avisos: item.receber_avisos !== false,
      hora_resumo: item.hora_resumo || '08:00',
      hora_lembrete: item.hora_lembrete || '16:00',
      ativo: Boolean(item.ativo),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, proprietario: !owner });
  }

  async function saveNumber(event: React.FormEvent) {
    event.preventDefault();
    const phone = withCountry(form.telefone);
    if (phone.length < 12 || phone.length > 13) {
      toast.error('Informe um celular válido com DDD.');
      return;
    }
    if (!editingId && authorized.length >= MAX_NUMBERS) {
      toast.error(`Limite de ${MAX_NUMBERS} números atingido.`);
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      const stamp = new Date().toISOString();
      const payload = {
        nome: form.nome.trim(),
        telefone: phone,
        proprietario: form.proprietario,
        permissao: form.proprietario ? 'admin' : form.permissao,
        nivel_acesso: form.proprietario || form.permissao === 'admin' ? 'admin' : form.permissao === 'escrita' ? 'gerente' : 'operador',
        receber_avisos: form.receber_avisos,
        hora_resumo: form.hora_resumo,
        hora_lembrete: form.hora_lembrete,
        ativo: form.ativo,
        updated_at: stamp,
        ...(!editingId ? { user_id: user.id, created_at: stamp } : {}),
      };

      if (form.proprietario) {
        // Só existe um proprietário: os demais viram equipe.
        const others = authorized.filter((item) => item.proprietario && item.id !== editingId);
        for (const other of others) {
          await supabase.from('financeiro_ia_autorizados').update({ proprietario: false }).eq('id', other.id).eq('user_id', user.id);
        }
      }

      const { error } = editingId
        ? await supabase.from('financeiro_ia_autorizados').update(payload).eq('id', editingId).eq('user_id', user.id)
        : await supabase.from('financeiro_ia_autorizados').insert([payload]);
      if (error) throw error;

      toast.success(form.proprietario ? 'Número do proprietário salvo.' : 'Número salvo.');
      setEditingId(null);
      setForm({ ...emptyForm, proprietario: false });
      await loadData();
    } catch (error) {
      console.error('Erro ao salvar número:', error);
      toast.error('Não foi possível salvar o número.');
    } finally {
      setSaving(false);
    }
  }

  async function removeNumber(item: FinanceiroIAAutorizado) {
    const result = await alerts.confirm({ title: 'Remover número?', text: `${item.nome} deixará de falar com o agente.`, icon: 'warning' });
    if (!result.isConfirmed) return;
    try {
      const { error } = await supabase.from('financeiro_ia_autorizados').delete().eq('id', item.id);
      if (error) throw error;
      toast.success('Número removido.');
      if (editingId === item.id) resetForm();
      await loadData();
    } catch {
      toast.error('Não foi possível remover o número.');
    }
  }

  async function sendSummary(item: FinanceiroIAAutorizado) {
    setSendingTo(item.id);
    try {
      await apiRequest('/api/financeiro/ia/enviar-resumo', { method: 'POST', body: JSON.stringify({ telefone: item.telefone }) });
      toast.success(`Resumo enviado para ${item.nome}.`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar o resumo.');
    } finally {
      setSendingTo(null);
    }
  }

  const connected = whatsapp === 'conectado';
  const whatsappBadge: { tone: Tone; label: string } =
    whatsapp === 'verificando' ? { tone: 'neutral', label: 'Verificando WhatsApp…' }
    : connected ? { tone: 'success', label: 'WhatsApp conectado' }
    : { tone: 'warning', label: 'WhatsApp desconectado' };

  return (
    <div className="ui-page">
      {/* Hero */}
      <section className="ui-hero mb-6 p-5 sm:p-8">
        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="brand" dot>Agente de IA</Badge>
              <Badge tone={whatsappBadge.tone} dot>{whatsappBadge.label}</Badge>
              {owner && <Badge tone="accent"><Crown className="h-3 w-3" />Proprietário: {formatPhone(owner.telefone)}</Badge>}
            </div>
            <h1 className="font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[2.6rem]">
              Suas finanças,<br />
              <span style={{ background: 'var(--ui-grad-brand)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                direto no WhatsApp.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
              Mande o gasto do dia por texto ou áudio, peça o resumo, dê baixa em contas e receba avisos de vencimentos e atrasos — tudo numa conversa com o seu agente financeiro.
            </p>
            <div className="mt-6 flex flex-wrap gap-6 text-sm">
              <div><p className="font-display text-2xl font-bold text-ink">{activeCount}<span className="text-ink-subtle">/{MAX_NUMBERS}</span></p><p className="text-xs text-ink-muted">números ativos</p></div>
              <div><p className="font-display text-2xl font-bold text-ink">{todayCount}</p><p className="text-xs text-ink-muted">mensagens hoje</p></div>
              <div className="flex items-center gap-2 text-xs text-ink-muted"><Mic className="h-4 w-4 text-brand-soft" />Aceita áudio</div>
            </div>
            {!connected && whatsapp !== 'verificando' && (
              <Link to="/configuracoes-whatsapp" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-soft hover:underline">
                <Smartphone className="h-4 w-4" /> Conectar o WhatsApp da oficina para ativar o agente →
              </Link>
            )}
          </div>

          <div className="ui-phone" aria-label="Exemplo de conversa com o agente">
            <div className="ui-phone-head">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--ui-grad-brand)' }}><Bot className="h-4 w-4 text-white" /></span>
              <div className="leading-tight"><p>Agente financeiro</p><p className="text-[0.65rem] font-normal text-[#8696a0]">online</p></div>
            </div>
            <div className="ui-phone-body">
              {demoChat.map((message, index) => (
                <Bubble key={index} from={message.from} text={message.text} delay={index * 260} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
        {/* Formulário */}
        <form onSubmit={saveNumber} className="ui-panel h-fit p-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="ui-icon-tile ui-icon-tile-md ui-tone-brand">{form.proprietario ? <Crown /> : <PhoneCall />}</span>
              <div>
                <h2 className="text-base font-bold text-ink">{editingId ? 'Editar número' : form.proprietario ? 'Número do proprietário' : 'Novo número da equipe'}</h2>
                <p className="text-xs text-ink-muted">{form.proprietario ? 'Recebe os avisos e fala com o agente.' : 'Acesso conforme a permissão.'}</p>
              </div>
            </div>
            {editingId && <UIButton variant="ghost" size="sm" icon={X} aria-label="Cancelar edição" onClick={resetForm} type="button" />}
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="ui-label">Nome</span>
              <input className="ui-field" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Seu nome" />
            </label>
            <label className="block">
              <span className="ui-label">Celular com DDD (WhatsApp)</span>
              <input className="ui-field" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required inputMode="tel" placeholder="(61) 99999-9999" />
            </label>

            <div className="flex items-center justify-between rounded-md border border-hairline px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-ink">É o proprietário</p>
                <p className="text-xs text-ink-muted">Acesso total e avisos financeiros</p>
              </div>
              <Switch label="Proprietário" checked={form.proprietario} onChange={(value) => setForm({ ...form, proprietario: value, permissao: value ? 'admin' : 'escrita' })} />
            </div>

            {!form.proprietario && (
              <label className="block">
                <span className="ui-label">Permissão</span>
                <select className="ui-field" value={form.permissao} onChange={(e) => setForm({ ...form, permissao: e.target.value as Form['permissao'] })}>
                  <option value="consulta">Somente consulta</option>
                  <option value="escrita">Consulta e lançamentos</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
            )}

            <div className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Bell className="h-4 w-4 text-brand-soft" />Avisos automáticos</p>
                  <p className="text-xs text-ink-muted">Contas a pagar, vencendo e atrasadas</p>
                </div>
                <Switch label="Receber avisos" checked={form.receber_avisos} onChange={(value) => setForm({ ...form, receber_avisos: value })} />
              </div>
              {form.receber_avisos && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block"><span className="ui-label">Resumo</span><input type="time" className="ui-field" value={form.hora_resumo} onChange={(e) => setForm({ ...form, hora_resumo: e.target.value })} /></label>
                  <label className="block"><span className="ui-label">Lembrete</span><input type="time" className="ui-field" value={form.hora_lembrete} onChange={(e) => setForm({ ...form, hora_lembrete: e.target.value })} /></label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-hairline px-3 py-2.5">
              <p className="text-sm font-semibold text-ink">Número ativo</p>
              <Switch label="Ativo" checked={form.ativo} onChange={(value) => setForm({ ...form, ativo: value })} />
            </div>

            <UIButton type="submit" variant="primary" size="lg" icon={Save} loading={saving} block>Salvar número</UIButton>
          </div>
        </form>

        <div className="min-w-0 space-y-5">
          {/* Números */}
          <Panel title="Números autorizados" subtitle="Somente estes celulares conversam com o agente" icon={ShieldCheck} tone="success" flush
            action={!editingId && <UIButton size="sm" icon={Plus} onClick={() => { setEditingId(null); setForm({ ...emptyForm, proprietario: false, permissao: 'escrita' }); }}>Equipe</UIButton>}>
            {loading ? (
              <div className="space-y-2 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
            ) : authorized.length === 0 ? (
              <EmptyState icon={Smartphone} title="Cadastre o número do proprietário" description="É por ele que o agente vai te avisar de contas e receber seus gastos." />
            ) : (
              <ul className="divide-y divide-hairline">
                {authorized.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                    <span className={`ui-icon-tile ui-icon-tile-md ${item.proprietario ? 'ui-tone-accent' : 'ui-tone-neutral'}`}>{item.proprietario ? <Crown /> : <PhoneCall />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{item.nome}</p>
                        {item.proprietario && <Badge tone="accent">Proprietário</Badge>}
                        {!item.ativo && <Badge tone="neutral">Inativo</Badge>}
                      </div>
                      <p className="ui-money text-sm text-ink-muted">
                        {formatPhone(item.telefone)} · {item.permissao === 'consulta' ? 'consulta' : item.permissao === 'escrita' ? 'lançamentos' : 'administrador'}
                        {item.receber_avisos !== false && <> · avisos {item.hora_resumo || '08:00'}/{item.hora_lembrete || '16:00'}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UIButton size="sm" icon={Send} loading={sendingTo === item.id} disabled={!item.ativo} onClick={() => sendSummary(item)}>
                        <span className="hidden sm:inline">Enviar resumo</span>
                      </UIButton>
                      <UIButton size="sm" variant="ghost" onClick={() => startEdit(item)}>Editar</UIButton>
                      <UIButton size="sm" variant="ghost" icon={Trash2} aria-label="Remover" className="hover:!text-signal-danger" onClick={() => removeNumber(item)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Capacidades */}
          <div className="grid gap-3 sm:grid-cols-2">
            {abilities.map(({ icon: Icon, tone, title, text }) => (
              <div key={title} className="ui-panel flex gap-3.5 p-4">
                <span className={`ui-icon-tile ui-icon-tile-md ui-tone-${tone}`}><Icon /></span>
                <div><h3 className="text-sm font-bold text-ink">{title}</h3><p className="mt-1 text-xs leading-relaxed text-ink-muted">{text}</p></div>
              </div>
            ))}
          </div>

          {/* Atividade */}
          <Panel title="Atividade recente" subtitle="O que o agente recebeu e respondeu" icon={Sparkles} tone="brand" flush>
            {loading ? (
              <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            ) : logs.length === 0 ? (
              <EmptyState icon={Bot} title="Nenhuma conversa ainda" description="Assim que você mandar a primeira mensagem pelo WhatsApp, ela aparece aqui." />
            ) : (
              <ul className="divide-y divide-hairline">
                {logs.map((log) => {
                  const meta = logTone[log.status] ?? { label: log.status, tone: 'neutral' as Tone };
                  return (
                    <li key={log.id} className="px-4 py-3.5 sm:px-5">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Badge tone={meta.tone} dot>{meta.label}</Badge>
                        {log.tipo_mensagem === 'audio' && <span className="inline-flex items-center gap-1"><Mic className="h-3 w-3" />áudio</span>}
                        <span className="ui-money">{formatPhone(log.telefone)}</span>
                        <span className="ml-auto">{new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {log.mensagem && <p className="truncate text-sm text-ink"><span className="text-ink-subtle">Você:</span> {log.mensagem}</p>}
                      {(log.resposta || log.erro) && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-ink-muted"><span className="text-ink-subtle">Agente:</span> {log.resposta || log.erro}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
