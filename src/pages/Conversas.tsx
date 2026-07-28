import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Plus, Search, Send } from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { supabase } from '../lib/supabase';
import type { Cliente, WhatsAppConversa, WhatsAppMensagem } from '../types/database';

export function Conversas() {
  const [conversations, setConversations] = useState<WhatsAppConversa[]>([]);
  const [selected, setSelected] = useState<WhatsAppConversa | null>(null);
  const [messages, setMessages] = useState<WhatsAppMensagem[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const rows = await apiRequest<WhatsAppConversa[]>(`/api/whatsapp/conversations?search=${encodeURIComponent(search)}`);
      setConversations(rows);
      setSelected((current) => current ? rows.find((item) => item.id === current.id) || current : rows[0] || null);
    } catch (error: any) { toast.error(error.message); }
  }, [search]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const rows = await apiRequest<WhatsAppMensagem[]>(`/api/whatsapp/conversations/${conversationId}/messages`);
      setMessages(rows);
      await apiRequest(`/api/whatsapp/conversations/${conversationId}/read`, { method: 'POST' });
    } catch (error: any) { toast.error(error.message); }
  }, []);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 8000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setClients(data || []));
  }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    void loadMessages(selected.id);
    const timer = window.setInterval(() => void loadMessages(selected.id), 5000);
    return () => window.clearInterval(timer);
  }, [selected?.id, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function startConversation() {
    if (!newClientId) return;
    try {
      const conversation = await apiRequest<WhatsAppConversa>('/api/whatsapp/conversations', { method: 'POST', body: JSON.stringify({ cliente_id: newClientId }) });
      setNewClientId(''); await loadConversations(); setSelected(conversation);
    } catch (error: any) { toast.error(error.message); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    const content = draft.trim(); setDraft(''); setSending(true);
    try {
      const message = await apiRequest<WhatsAppMensagem>(`/api/whatsapp/conversations/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ conteudo: content }) });
      setMessages((current) => [...current, message]); await loadConversations();
    } catch (error: any) { setDraft(content); toast.error(error.message); } finally { setSending(false); }
  }

  return (
    <main className="mx-auto h-[calc(100vh-5rem)] max-w-7xl p-3 sm:p-6">
      <div className="grid h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[320px_1fr]">
        <aside className={`${selected ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-slate-200 dark:border-slate-800`}>
          <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800"><div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Conversas</h1><p className="text-xs text-slate-500">Histórico armazenado no UltraOS</p></div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou telefone" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800" /></div><div className="flex gap-2"><select value={newClientId} onChange={(e) => setNewClientId(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"><option value="">Nova conversa…</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select><button onClick={startConversation} disabled={!newClientId} className="rounded-xl bg-violet-600 p-2 text-white disabled:opacity-40" title="Iniciar conversa"><Plus className="h-5 w-5" /></button></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto">{conversations.map((item) => <button key={item.id} onClick={() => setSelected(item)} className={`flex w-full gap-3 border-b border-slate-100 p-4 text-left transition dark:border-slate-800 ${selected?.id === item.id ? 'bg-violet-50 dark:bg-violet-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><MessageCircle className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{item.cliente_nome || item.nome_contato || item.telefone}</p>{Number(item.nao_lidas) > 0 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">{item.nao_lidas}</span>}</div><p className="truncate text-xs text-slate-500">{item.ultima_mensagem || 'Conversa sem mensagens'}</p>{item.ordem_numero && <p className="mt-1 text-[10px] font-semibold text-violet-600">OS #{item.ordem_numero}</p>}</div></button>)}{conversations.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhuma conversa arquivada ainda.</p>}</div>
        </aside>

        <section className={`${selected ? 'flex' : 'hidden md:flex'} min-h-0 flex-col`}>{selected ? <><header className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800"><button onClick={() => setSelected(null)} className="text-sm font-semibold text-violet-600 md:hidden">Voltar</button><div><h2 className="font-bold">{selected.cliente_nome || selected.nome_contato || selected.telefone}</h2><p className="text-xs text-slate-500">+{selected.telefone}{selected.ordem_numero ? ` · OS #${selected.ordem_numero}` : ''}</p></div></header><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">{messages.map((message) => <div key={message.id} className={`flex ${message.direcao === 'saida' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-2 text-sm shadow-sm ${message.direcao === 'saida' ? 'rounded-br-md bg-emerald-600 text-white' : 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}><p className="whitespace-pre-wrap break-words">{message.conteudo || `[${message.tipo}]`}</p><p className={`mt-1 text-right text-[10px] ${message.direcao === 'saida' ? 'text-emerald-100' : 'text-slate-400'}`}>{new Date(message.enviada_em).toLocaleString('pt-BR')} · {message.status}</p></div></div>)}<div ref={bottomRef} /></div><form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Digite uma mensagem…" className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm dark:border-slate-700" /><button disabled={sending || !draft.trim()} className="rounded-xl bg-emerald-600 px-4 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button></form></> : <div className="m-auto text-center text-slate-400"><MessageCircle className="mx-auto mb-3 h-12 w-12" /><p>Selecione uma conversa</p></div>}</section>
      </div>
    </main>
  );
}
