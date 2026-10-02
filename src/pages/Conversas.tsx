import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Check, CheckCheck, CheckSquare, FileText, Image as ImageIcon, Loader2, Lock, MailOpen, MessageCircle, Mic, Plus, Search, Send,
  Sparkles, Square, Undo2, Video, X,
} from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { useLiveRefresh } from '../lib/live-events';
import { supabase } from '../lib/supabase';
import { Badge, EmptyState, Segmented, Skeleton, UIButton } from '../components/ui';
import type { Cliente, WhatsAppConversa, WhatsAppMensagem } from '../types/database';

type Message = WhatsAppMensagem & {
  anexo_mime?: string | null;
  anexo_tamanho?: number | null;
  entregue_em?: string | null;
  lida_em?: string | null;
  apagada_em?: string | null;
};
type Filter = 'todas' | 'nao_lidas';

/* ------------------------------------------------------------------ utilidades */

const authToken = () => {
  try {
    return JSON.parse(localStorage.getItem('mysql-auth-session') || 'null')?.access_token || '';
  } catch {
    return '';
  }
};

const mediaCache = new Map<string, Promise<string>>();
/** Baixa a mídia com o token da sessão (a rota é autenticada) e devolve uma URL local. */
function loadMedia(id: string) {
  let pending = mediaCache.get(id);
  if (!pending) {
    pending = fetch(`/api/whatsapp/attachments/${id}`, { headers: { Authorization: `Bearer ${authToken()}` } })
      .then((response) => {
        if (!response.ok) throw new Error('Mídia indisponível');
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    mediaCache.set(id, pending);
    pending.catch(() => mediaCache.delete(id));
  }
  return pending;
}

function useMediaUrl(id?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    if (!id) return undefined;
    loadMedia(id).then((value) => alive && setUrl(value)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id]);
  return { url, failed };
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

/** *negrito*, _itálico_, ~riscado~ e links, com o texto escapado antes (seguro contra HTML injetado). */
function richText(text: string) {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline decoration-dotted underline-offset-2 hover:opacity-80">$1</a>')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}

const dayKey = (iso: string) => String(iso).slice(0, 10) === '' ? '' : new Date(iso).toLocaleDateString('en-CA');
function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function shortTime(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const GRADIENTS = [
  'from-violet-500 to-indigo-600', 'from-cyan-500 to-blue-600', 'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600', 'from-rose-500 to-pink-600', 'from-fuchsia-500 to-purple-600',
];

function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const hash = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const initials = name.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '#';
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-md ${GRADIENTS[hash % GRADIENTS.length]} ${size === 'lg' ? 'h-11 w-11 text-sm' : 'h-12 w-12 text-sm'}`}>
      {initials}
    </span>
  );
}

function previewOf(item: WhatsAppConversa) {
  const text = item.ultima_mensagem || '';
  const media: Record<string, { icon: typeof ImageIcon; label: string }> = {
    '[imagem]': { icon: ImageIcon, label: 'Foto' },
    '[audio]': { icon: Mic, label: 'Áudio' },
    '[video]': { icon: Video, label: 'Vídeo' },
    '[documento]': { icon: FileText, label: 'Documento' },
    '[figurinha]': { icon: Sparkles, label: 'Figurinha' },
  };
  const found = media[text.trim()];
  if (found) {
    const Icon = found.icon;
    return <span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{found.label}</span>;
  }
  return text || 'Conversa sem mensagens';
}

const displayName = (item: WhatsAppConversa) => item.cliente_nome || item.nome_contato || `+${item.telefone}`;

/* ------------------------------------------------------------------ mensagens */

function Ticks({ message }: { message: Message }) {
  if (message.direcao !== 'saida') return null;
  if (message.status === 'erro') return <span className="text-signal-danger" title="Falha no envio">!</span>;
  if (message.status === 'processando') return <Loader2 className="h-3 w-3 animate-spin" />;
  if (message.lida_em) return <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Lida" />;
  if (message.entregue_em) return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />;
  return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
}

function MediaBlock({ message, onOpenImage, onTranscribed }: { message: Message; onOpenImage: (url: string) => void; onTranscribed: (id: string, text: string) => void }) {
  const { url, failed } = useMediaUrl(message.anexo_id);
  const [transcribing, setTranscribing] = useState(false);

  if (!message.anexo_id || failed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2 text-xs opacity-80">
        <Lock className="h-3.5 w-3.5" /> {message.tipo === 'audio' ? 'Áudio' : message.tipo === 'imagem' ? 'Foto' : 'Arquivo'} não arquivado
        <span className="opacity-70">(mensagens antigas são recuperadas aos poucos)</span>
      </div>
    );
  }
  if (!url) return <Skeleton className="h-40 w-56 !bg-white/10" />;

  if (message.tipo === 'imagem' || message.tipo === 'figurinha') {
    return (
      <button type="button" onClick={() => onOpenImage(url)} className="block overflow-hidden rounded-xl">
        <img src={url} alt={message.conteudo || 'Foto'} className={`max-h-80 w-full object-cover ${message.tipo === 'figurinha' ? 'max-w-[9rem]' : 'max-w-[18rem]'}`} loading="lazy" />
      </button>
    );
  }
  if (message.tipo === 'audio') {
    return (
      <div className="min-w-[14rem]">
        <audio controls src={url} preload="metadata" className="h-10 w-full" />
        {!message.conteudo && (
          <button
            type="button"
            disabled={transcribing}
            onClick={async () => {
              setTranscribing(true);
              try {
                const result = await apiRequest<{ conteudo: string }>(`/api/whatsapp/messages/${message.id}/transcribe`, { method: 'POST' });
                onTranscribed(message.id, result.conteudo);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Não foi possível transcrever.');
              } finally {
                setTranscribing(false);
              }
            }}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold opacity-80 hover:opacity-100"
          >
            {transcribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Transcrever áudio
          </button>
        )}
      </div>
    );
  }
  if (message.tipo === 'video') return <video controls src={url} className="max-h-80 max-w-[18rem] rounded-xl" preload="metadata" />;
  return (
    <a href={url} download={message.anexo_nome || 'arquivo'} className="flex items-center gap-3 rounded-xl bg-black/15 px-3 py-2.5 text-sm hover:bg-black/25">
      <FileText className="h-5 w-5 shrink-0" />
      <span className="min-w-0"><span className="block truncate font-semibold">{message.anexo_nome || 'Documento'}</span><span className="text-xs opacity-70">{message.anexo_tamanho ? `${(message.anexo_tamanho / 1024).toFixed(0)} KB` : 'Baixar'}</span></span>
    </a>
  );
}

/* ------------------------------------------------------------------ página */

export function Conversas() {
  const [conversations, setConversations] = useState<WhatsAppConversa[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [filter, setFilter] = useState<Filter>('todas');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newClientId, setNewClientId] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) ?? null, [conversations, selectedId]);
  const unreadConversations = useMemo(() => conversations.filter((item) => Number(item.nao_lidas) > 0), [conversations]);
  const unreadMessages = unreadConversations.reduce((sum, item) => sum + Number(item.nao_lidas), 0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadConversations = useCallback(async () => {
    try {
      const rows = await apiRequest<WhatsAppConversa[]>(`/api/whatsapp/conversations?search=${encodeURIComponent(debouncedSearch)}${filter === 'nao_lidas' ? '&filtro=nao_lidas' : ''}`);
      setConversations(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar conversas.');
    } finally {
      setLoadingList(false);
    }
  }, [debouncedSearch, filter]);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    if (!quiet) setLoadingMessages(true);
    try {
      const rows = await apiRequest<Message[]>(`/api/whatsapp/conversations/${conversationId}/messages`);
      setMessages(rows);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : 'Erro ao carregar mensagens.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const markRead = useCallback(async (conversationId: string) => {
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, nao_lidas: 0 } : item)));
    await apiRequest(`/api/whatsapp/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => undefined);
  }, []);

  // Lista: atualiza a cada 8 s, só com a aba visível.
  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => { if (!document.hidden) void loadConversations(); }, 8000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useLiveRefresh(['conversas'], () => {
    void loadConversations();
    if (selectedId) void loadMessages(selectedId, true);
  });

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setClients((data as Cliente[]) || []));
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return undefined; }
    stickToBottom.current = true;
    void loadMessages(selectedId);
    void markRead(selectedId);
    const timer = window.setInterval(() => { if (!document.hidden) { void loadMessages(selectedId, true); } }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadMessages, markRead]);

  // Conversa aberta nunca acumula "não lidas" enquanto está na tela.
  useEffect(() => {
    if (selected && Number(selected.nao_lidas) > 0 && !document.hidden) void markRead(selected.id);
  }, [selected, markRead]);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  function onScroll() {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function markAllRead() {
    try {
      await apiRequest('/api/whatsapp/conversations/read-all', { method: 'POST' });
      setConversations((current) => current.map((item) => ({ ...item, nao_lidas: 0 })));
      toast.success('Todas as conversas foram marcadas como lidas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao marcar como lidas.');
    }
  }

  async function bulk(action: 'read' | 'unread' | 'close' | 'open') {
    const ids = [...checked];
    if (!ids.length) return;
    try {
      await apiRequest('/api/whatsapp/conversations/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) });
      toast.success(`${ids.length} conversa${ids.length === 1 ? '' : 's'} atualizada${ids.length === 1 ? '' : 's'}.`);
      setChecked(new Set());
      setSelectMode(false);
      await loadConversations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro na ação em massa.');
    }
  }

  async function startConversation() {
    if (!newClientId) return;
    try {
      const conversation = await apiRequest<WhatsAppConversa>('/api/whatsapp/conversations', { method: 'POST', body: JSON.stringify({ cliente_id: newClientId }) });
      setNewClientId('');
      setShowNew(false);
      await loadConversations();
      setSelectedId(conversation.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar a conversa.');
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending) return;
    const content = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const message = await apiRequest<Message>(`/api/whatsapp/conversations/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ conteudo: content }) });
      stickToBottom.current = true;
      setMessages((current) => [...current, message]);
      await loadConversations();
    } catch (error) {
      setDraft(content);
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar.');
    } finally {
      setSending(false);
    }
  }

  async function toggleUnread() {
    if (!selected) return;
    await apiRequest(`/api/whatsapp/conversations/${selected.id}/unread`, { method: 'POST' });
    setConversations((current) => current.map((item) => (item.id === selected.id ? { ...item, nao_lidas: 1 } : item)));
    setSelectedId(null);
  }

  async function toggleStatus() {
    if (!selected) return;
    const next = selected.status === 'fechada' ? 'aberta' : 'fechada';
    await apiRequest(`/api/whatsapp/conversations/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ ordem_servico_id: selected.ordem_servico_id || null, status: next }) });
    toast.success(next === 'fechada' ? 'Conversa fechada.' : 'Conversa reaberta.');
    await loadConversations();
  }

  const toggleChecked = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const grouped = useMemo(() => {
    const out: Array<{ key: string; label: string; items: Message[] }> = [];
    for (const message of messages) {
      const key = dayKey(message.enviada_em);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(message);
      else out.push({ key, label: dayLabel(message.enviada_em), items: [message] });
    }
    return out;
  }, [messages]);

  return (
    <div className="mx-auto h-[calc(100dvh-4rem-4.5rem)] w-full max-w-[96rem] p-2 sm:p-4 lg:h-[calc(100dvh-4rem)] lg:p-6">
      <div className="ui-panel grid h-full overflow-hidden !rounded-2xl md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
        {/* ----------------------------------------------------------- lista */}
        <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-hairline`}>
          <div className="space-y-3 border-b border-hairline p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="font-display text-xl font-extrabold text-ink">Conversas</h1>
                <p className="text-xs text-ink-muted">{unreadMessages > 0 ? `${unreadMessages} mensagem${unreadMessages === 1 ? '' : 's'} em ${unreadConversations.length} conversa${unreadConversations.length === 1 ? '' : 's'}` : 'Tudo lido'}</p>
              </div>
              <div className="flex gap-1">
                <UIButton size="sm" variant="ghost" icon={MailOpen} title="Marcar todas como lidas" aria-label="Marcar todas como lidas" disabled={unreadConversations.length === 0} onClick={() => void markAllRead()} />
                <UIButton size="sm" variant={selectMode ? 'secondary' : 'ghost'} icon={CheckSquare} title="Selecionar várias" aria-label="Selecionar várias" onClick={() => { setSelectMode((v) => !v); setChecked(new Set()); }} />
                <UIButton size="sm" variant="primary" icon={Plus} title="Nova conversa" aria-label="Nova conversa" onClick={() => setShowNew((v) => !v)} />
              </div>
            </div>

            {showNew && (
              <div className="flex gap-2 rounded-xl border border-hairline bg-surface-muted p-2">
                <select value={newClientId} onChange={(e) => setNewClientId(e.target.value)} className="ui-field min-w-0 flex-1" aria-label="Cliente">
                  <option value="">Escolha o cliente…</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}
                </select>
                <UIButton variant="primary" disabled={!newClientId} onClick={() => void startConversation()}>Abrir</UIButton>
              </div>
            )}

            <div className="ui-search">
              <Search aria-hidden />
              <input className="ui-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou telefone" />
            </div>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[{ value: 'todas', label: 'Todas' }, { value: 'nao_lidas', label: `Não lidas${unreadConversations.length ? ` (${unreadConversations.length})` : ''}` }]}
              className="w-full [&>button]:flex-1"
            />
          </div>

          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-brand/10 px-4 py-2.5 text-xs">
              <button type="button" className="font-semibold text-brand-soft" onClick={() => setChecked(checked.size === conversations.length ? new Set() : new Set(conversations.map((c) => c.id)))}>
                {checked.size === conversations.length ? 'Limpar' : 'Selecionar todas'}
              </button>
              <span className="text-ink-muted">{checked.size} selecionada{checked.size === 1 ? '' : 's'}</span>
              <span className="ml-auto flex gap-1">
                <UIButton size="sm" disabled={!checked.size} onClick={() => void bulk('read')}>Lidas</UIButton>
                <UIButton size="sm" disabled={!checked.size} onClick={() => void bulk('unread')}>Não lidas</UIButton>
                <UIButton size="sm" disabled={!checked.size} onClick={() => void bulk('close')}>Fechar</UIButton>
              </span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[4.5rem]" />)}</div>
            ) : conversations.length === 0 ? (
              <EmptyState icon={MessageCircle} title={filter === 'nao_lidas' ? 'Nenhuma conversa não lida' : 'Nenhuma conversa'} description={filter === 'nao_lidas' ? 'Você está em dia com os clientes.' : 'As conversas do WhatsApp aparecem aqui assim que chegarem.'} />
            ) : (
              conversations.map((item) => {
                const active = selectedId === item.id;
                const unread = Number(item.nao_lidas) > 0;
                const isChecked = checked.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => (selectMode ? toggleChecked(item.id) : setSelectedId(item.id))}
                    className={`relative flex w-full items-center gap-3 border-b border-hairline/60 px-4 py-3 text-left transition ${active ? 'bg-brand/15' : isChecked ? 'bg-brand/10' : 'hover:bg-surface-muted'}`}
                  >
                    {active && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-brand shadow-neon" aria-hidden />}
                    {selectMode ? (isChecked ? <CheckSquare className="h-5 w-5 shrink-0 text-brand-soft" /> : <Square className="h-5 w-5 shrink-0 text-ink-subtle" />) : <Avatar name={displayName(item)} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${unread ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{displayName(item)}</span>
                        <span className={`shrink-0 text-[0.7rem] ${unread ? 'font-bold text-brand-soft' : 'text-ink-subtle'}`}>{shortTime(item.ultima_mensagem_em)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`truncate text-xs ${unread ? 'text-ink' : 'text-ink-muted'}`}>{previewOf(item)}</span>
                        {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[0.65rem] font-bold text-white">{item.nao_lidas}</span>}
                      </span>
                      {(item.ordem_numero || item.status === 'fechada') && (
                        <span className="mt-1 flex gap-1.5">
                          {item.ordem_numero && <Badge tone="brand">OS #{item.ordem_numero}</Badge>}
                          {item.status === 'fechada' && <Badge tone="neutral">Fechada</Badge>}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ------------------------------------------------------------ chat */}
        <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col`}>
          {selected ? (
            <>
              <header className="flex items-center gap-3 border-b border-hairline px-3 py-3 sm:px-5">
                <UIButton size="sm" variant="ghost" icon={ArrowLeft} aria-label="Voltar" className="md:hidden" onClick={() => setSelectedId(null)} />
                <Avatar name={displayName(selected)} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-base font-bold text-ink">{displayName(selected)}</h2>
                  <p className="truncate text-xs text-ink-muted">+{selected.telefone}{selected.cliente_nome && selected.nome_contato && selected.nome_contato !== selected.cliente_nome ? ` · ${selected.nome_contato}` : ''}</p>
                </div>
                {selected.ordem_servico_id && (
                  <Link to={`/ordens/${selected.ordem_servico_id}/historico`} className="ui-btn ui-btn-secondary ui-btn-sm hidden sm:inline-flex">OS #{selected.ordem_numero}</Link>
                )}
                <UIButton size="sm" variant="ghost" icon={Undo2} title="Marcar como não lida" aria-label="Marcar como não lida" onClick={() => void toggleUnread()} />
                <UIButton size="sm" variant="ghost" icon={selected.status === 'fechada' ? MailOpen : Check} title={selected.status === 'fechada' ? 'Reabrir conversa' : 'Fechar conversa'} aria-label="Alternar status" onClick={() => void toggleStatus()} />
              </header>

              <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto bg-black/20 px-3 py-4 sm:px-6">
                {loadingMessages && messages.length === 0 && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className={`h-14 ${i % 2 ? 'ml-auto w-2/3' : 'w-1/2'}`} />)}</div>}
                {grouped.map((group) => (
                  <div key={group.key} className="mb-2">
                    <div className="sticky top-0 z-[1] my-3 flex justify-center"><span className="rounded-full border border-hairline bg-surface-raised/90 px-3 py-1 text-[0.7rem] font-semibold capitalize text-ink-muted backdrop-blur">{group.label}</span></div>
                    <div className="space-y-1.5">
                      {group.items.map((message) => {
                        const out = message.direcao === 'saida';
                        const isMedia = ['imagem', 'audio', 'video', 'documento', 'figurinha'].includes(message.tipo);
                        const text = message.conteudo && !/^\[(imagem|audio|video|documento|figurinha)\]$/.test(message.conteudo.trim()) ? message.conteudo : '';
                        return (
                          <div key={message.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${out ? 'rounded-br-md bg-emerald-600 text-white' : 'rounded-bl-md border border-hairline bg-surface-raised text-ink'}`}>
                              {message.apagada_em ? (
                                <p className="italic opacity-70">Mensagem apagada</p>
                              ) : (
                                <>
                                  {isMedia && <div className="mb-1"><MediaBlock message={message} onOpenImage={setLightbox} onTranscribed={(id, value) => setMessages((current) => current.map((m) => (m.id === id ? { ...m, conteudo: value } : m)))} /></div>}
                                  {text && <p className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: richText(text) }} />}
                                  {!isMedia && !text && <p className="italic opacity-70">[{message.tipo}]</p>}
                                </>
                              )}
                              <p className={`mt-1 flex items-center justify-end gap-1 text-[0.65rem] ${out ? 'text-emerald-100' : 'text-ink-subtle'}`}>
                                {message.enviada_pelo_sistema ? <span title="Enviada pelo sistema">⚙</span> : null}
                                {new Date(message.enviada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                <Ticks message={message} />
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex items-end gap-2 border-t border-hairline p-3 sm:p-4">
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
                  placeholder="Digite uma mensagem…  (Enter envia, Shift+Enter quebra a linha)"
                  className="ui-field !h-auto max-h-32 min-h-11 flex-1 resize-none !py-2.5"
                />
                <UIButton type="submit" variant="primary" size="lg" icon={Send} loading={sending} disabled={!draft.trim()} aria-label="Enviar" />
              </form>
            </>
          ) : (
            <div className="m-auto max-w-xs px-6 text-center">
              <span className="ui-icon-tile ui-icon-tile-lg ui-tone-brand mx-auto mb-4"><MessageCircle /></span>
              <p className="font-display text-lg font-bold text-ink">Selecione uma conversa</p>
              <p className="mt-1 text-sm text-ink-muted">Fotos, áudios e documentos dos clientes ficam arquivados aqui.</p>
            </div>
          )}
        </section>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <UIButton variant="secondary" size="sm" icon={X} aria-label="Fechar" className="absolute right-4 top-4" onClick={() => setLightbox(null)} />
          <img src={lightbox} alt="Foto ampliada" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
