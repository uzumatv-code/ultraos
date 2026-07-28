import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, FilePlus2, MessageCircle, Plus, Send, ShieldCheck, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import type { OsAditivo, OsAditivoItem, OsOcorrencia, OrdemServico } from '../types/database';
import { NFSeService } from '../utils/nfse-service';

type HistoryPayload = {
  order: OrdemServico & { cliente_nome: string; cliente_telefone?: string; instrumento_nome?: string; marca_nome?: string };
  occurrences: OsOcorrencia[];
  addenda: OsAditivo[];
  history: Array<{ id: string; evento: string; descricao: string; created_at: string }>;
  invoices: Array<{ id: string; aditivo_id?: string; numero_nfse?: string; valor_servicos: number; status: string }>;
};

const emptyItem: OsAditivoItem = { descricao: '', quantidade: 1, valor_unitario: 0 };

export function OrdemHistorico() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [occurrence, setOccurrence] = useState({ titulo: '', descricao: '', tipo: 'novo_problema' });
  const [addendum, setAddendum] = useState({ titulo: '', justificativa: '', ocorrencia_id: '', prazo_novo: '' });
  const [items, setItems] = useState<OsAditivoItem[]>([{ ...emptyItem }]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiRequest<HistoryPayload>(`/api/ordens/${id}/historico`)); }
    catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const additionalTotal = useMemo(() => items.reduce((total, item) => total + Number(item.quantidade || 0) * Number(item.valor_unitario || 0), 0), [items]);

  async function createOccurrence(event: React.FormEvent) {
    event.preventDefault(); setBusy('occurrence');
    try {
      await apiRequest(`/api/ordens/${id}/ocorrencias`, { method: 'POST', body: JSON.stringify(occurrence) });
      setOccurrence({ titulo: '', descricao: '', tipo: 'novo_problema' });
      toast.success('Ocorrência registrada sem alterar o diagnóstico original');
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setBusy(''); }
  }

  async function createAddendum(event: React.FormEvent) {
    event.preventDefault(); setBusy('addendum');
    try {
      await apiRequest(`/api/ordens/${id}/aditivos`, { method: 'POST', body: JSON.stringify({ ...addendum, itens: items }) });
      setAddendum({ titulo: '', justificativa: '', ocorrencia_id: '', prazo_novo: '' });
      setItems([{ ...emptyItem }]);
      toast.success('Aditivo criado. O valor da OS só mudará após a aprovação');
      await load();
    } catch (error: any) { toast.error(error.message); } finally { setBusy(''); }
  }

  async function act(path: string, success: string, key: string, body: object = {}) {
    setBusy(key);
    try { await apiRequest(path, { method: 'POST', body: JSON.stringify(body) }); toast.success(success); await load(); }
    catch (error: any) { toast.error(error.message); } finally { setBusy(''); }
  }

  async function issueAdditionalInvoice(item: OsAditivo) {
    setBusy(`nf-${item.id}`);
    try { await NFSeService.gerarNFSe(id, { aditivoId: item.id }); toast.success('Rascunho da NFS-e adicional criado'); await load(); }
    catch (error: any) { toast.error(error.message); } finally { setBusy(''); }
  }

  if (loading) return <div className="p-8 text-slate-500">Carregando histórico da OS…</div>;
  if (!data) return <div className="p-8 text-slate-500">Ordem não encontrada.</div>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button onClick={() => navigate('/ordens')} className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600"><ArrowLeft className="h-4 w-4" /> Voltar para ordens</button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-violet-600">OS #{data.order.numero}</p><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Histórico, ocorrências e aditivos</h1><p className="mt-1 text-sm text-slate-500">{data.order.cliente_nome} · {data.order.instrumento_nome} {data.order.marca_nome}</p></div>
          <div className="rounded-xl bg-slate-50 px-5 py-3 text-right dark:bg-slate-800"><p className="text-xs text-slate-500">Valor atual</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(data.order.valor_total)}</p></div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={createOccurrence} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-700"><FilePlus2 className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900 dark:text-white">Registrar novo achado</h2><p className="text-xs text-slate-500">Preserva o problema e o orçamento originais.</p></div></div>
          <div className="space-y-3">
            <select value={occurrence.tipo} onChange={(e) => setOccurrence({ ...occurrence, tipo: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700"><option value="novo_problema">Novo problema</option><option value="diagnostico_complementar">Diagnóstico complementar</option><option value="observacao_tecnica">Observação técnica</option></select>
            <input required maxLength={255} value={occurrence.titulo} onChange={(e) => setOccurrence({ ...occurrence, titulo: e.target.value })} placeholder="Ex.: Traste solto identificado após desmontagem" className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" />
            <textarea required rows={4} value={occurrence.descricao} onChange={(e) => setOccurrence({ ...occurrence, descricao: e.target.value })} placeholder="Descreva o achado, a causa provável e o impacto…" className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" />
            <button disabled={busy === 'occurrence'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" /> Registrar ocorrência</button>
          </div>
        </form>

        <form onSubmit={createAddendum} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-violet-100 p-2 text-violet-700"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900 dark:text-white">Novo aditivo de orçamento</h2><p className="text-xs text-slate-500">A cobrança entra na OS somente depois da aprovação.</p></div></div>
          <div className="space-y-3">
            <select value={addendum.ocorrencia_id} onChange={(e) => setAddendum({ ...addendum, ocorrencia_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700"><option value="">Vincular a uma ocorrência (opcional)</option>{data.occurrences.map((item) => <option key={item.id} value={item.id}>{item.titulo}</option>)}</select>
            <input required value={addendum.titulo} onChange={(e) => setAddendum({ ...addendum, titulo: e.target.value })} placeholder="Título do procedimento adicional" className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" />
            <textarea required rows={3} value={addendum.justificativa} onChange={(e) => setAddendum({ ...addendum, justificativa: e.target.value })} placeholder="Por que o serviço não fazia parte do orçamento original?" className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" />
            {items.map((item, index) => <div key={index} className="grid grid-cols-12 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><input required value={item.descricao} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, descricao: e.target.value } : current))} placeholder="Serviço" className="col-span-12 rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 sm:col-span-7" /><input type="number" min="0.01" step="0.01" required value={item.valor_unitario || ''} onChange={(e) => setItems(items.map((current, i) => i === index ? { ...current, valor_unitario: Number(e.target.value) } : current))} placeholder="Valor" className="col-span-9 rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 sm:col-span-4" /><button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))} className="col-span-3 rounded-lg text-red-500 disabled:opacity-30 sm:col-span-1"><X className="mx-auto h-4 w-4" /></button></div>)}
            <button type="button" onClick={() => setItems([...items, { ...emptyItem }])} className="text-sm font-semibold text-violet-600">+ Adicionar item</button>
            <div className="grid gap-3 sm:grid-cols-2"><input type="date" value={addendum.prazo_novo} onChange={(e) => setAddendum({ ...addendum, prazo_novo: e.target.value })} className="rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" /><div className="rounded-xl bg-emerald-50 p-3 text-right dark:bg-emerald-950/30"><p className="text-xs text-slate-500">Valor adicional</p><p className="font-bold text-emerald-600">{formatCurrency(additionalTotal)}</p></div></div>
            <button disabled={busy === 'addendum'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" /> Criar aditivo</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Aditivos</h2>
        <div className="space-y-4">{data.addenda.length === 0 && <p className="text-sm text-slate-500">Nenhum aditivo criado.</p>}{data.addenda.map((item) => {
          const invoice = data.invoices.find((note) => note.aditivo_id === item.id && note.status !== 'cancelado');
          return <article key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-3"><div><div className="flex items-center gap-2"><strong>Aditivo #{item.numero} — {item.titulo}</strong><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'aprovado' ? 'bg-emerald-100 text-emerald-700' : item.status === 'recusado' ? 'bg-red-100 text-red-700' : item.status === 'enviado' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{item.status}</span></div><p className="mt-1 text-sm text-slate-500">{item.justificativa}</p></div><div className="text-right"><p className="font-bold text-emerald-600">+ {formatCurrency(item.valor_adicional)}</p><p className="text-xs text-slate-500">Novo total {formatCurrency(item.valor_total_novo)}</p></div></div><ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">{item.itens.map((detail, index) => <li key={detail.id || index}>• {detail.descricao} — {formatCurrency(Number(detail.valor_total ?? detail.quantidade * detail.valor_unitario))}</li>)}</ul><div className="mt-4 flex flex-wrap gap-2">{['rascunho', 'enviado'].includes(item.status) && <button disabled={busy === `send-${item.id}`} onClick={() => act(`/api/ordens/${id}/aditivos/${item.id}/enviar`, 'Aditivo enviado e registrado na conversa', `send-${item.id}`)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><Send className="h-4 w-4" /> Enviar no WhatsApp</button>}{can('financeiro.write') && ['rascunho', 'enviado'].includes(item.status) && <button onClick={() => act(`/api/ordens/${id}/aditivos/${item.id}/aprovar`, 'Aditivo aprovado e financeiro atualizado', `approve-${item.id}`, { metodo_aprovacao: 'sistema', aprovado_por_nome: data.order.cliente_nome, aprovado_por_telefone: data.order.cliente_telefone })} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white"><Check className="h-4 w-4" /> Registrar aprovação</button>}{['rascunho', 'enviado'].includes(item.status) && <button onClick={() => act(`/api/ordens/${id}/aditivos/${item.id}/recusar`, 'Recusa registrada', `refuse-${item.id}`)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"><X className="h-4 w-4" /> Recusar</button>}{item.status === 'aprovado' && can('nfse.manage') && !invoice && <button disabled={busy === `nf-${item.id}`} onClick={() => issueAdditionalInvoice(item)} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-600"><FilePlus2 className="h-4 w-4" /> Gerar NFS-e adicional</button>}{invoice && <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">NFS-e {invoice.numero_nfse || invoice.status}</span>}{item.status === 'enviado' && <button onClick={() => navigate('/conversas')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><MessageCircle className="h-4 w-4" /> Abrir conversa</button>}</div></article>;
        })}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Clock3 className="h-5 w-5 text-violet-600" /> Linha do tempo</h2><div className="space-y-4">{data.history.map((item) => <div key={item.id} className="border-l-2 border-violet-200 pl-4"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.descricao}</p><p className="text-xs text-slate-500">{formatDate(item.created_at)} · {item.evento.replaceAll('_', ' ')}</p></div>)}</div></section>
    </main>
  );
}
