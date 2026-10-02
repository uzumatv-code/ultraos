import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarCheck, CheckCircle2, ClipboardCheck, Clock, Download, FileText, Hourglass, Pencil, Plus, RotateCcw, Search, Send, ThumbsDown, Trash2, TrendingUp, X,
} from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { useLiveRefresh } from '../lib/live-events';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { formatCurrency } from '../utils/formatters';
import { todayLocalDate } from '../utils/dates';
import { WhatsAppService } from '../utils/whatsapp-service';
import { addDays, downloadQuotePdf, formatDateBR, loadQuote, QUOTE_STATUS_LABEL, sendQuoteToCustomer, type Orcamento, type QuoteStatus } from '../utils/quotes';
import { Badge, EmptyState, Kpi, PageHeader, Segmented, Skeleton, UIButton } from '../components/ui';
import type { Tone } from '../components/ui';
import type { OrdemServico } from '../types/database';

type Filter = 'abertos' | 'aprovados' | 'perdidos' | 'todos';

const STATUS_TONE: Record<QuoteStatus, Tone> = {
  rascunho: 'neutral', enviado: 'info', convertendo: 'warning', convertido: 'success', recusado: 'danger', cancelado: 'neutral', expirado: 'warning',
};

const isOpen = (quote: Orcamento) => quote.status_efetivo === 'rascunho' || quote.status_efetivo === 'enviado';
const isLost = (quote: Orcamento) => ['recusado', 'expirado', 'cancelado'].includes(quote.status_efetivo);

function daysLeft(quote: Orcamento) {
  if (!quote.validade) return null;
  return Math.round((new Date(`${quote.validade.slice(0, 10)}T12:00:00`).getTime() - new Date(`${todayLocalDate()}T12:00:00`).getTime()) / 86_400_000);
}

function validityLabel(quote: Orcamento) {
  const left = daysLeft(quote);
  if (left === null || !isOpen(quote) && quote.status_efetivo !== 'expirado') return null;
  if (left < 0) return { text: `Venceu há ${Math.abs(left)} dia${Math.abs(left) === 1 ? '' : 's'}`, tone: 'warning' as Tone };
  if (left === 0) return { text: 'Vence hoje', tone: 'warning' as Tone };
  if (left <= 3) return { text: `Vence em ${left} dia${left === 1 ? '' : 's'}`, tone: 'warning' as Tone };
  return { text: `Válido até ${formatDateBR(quote.validade)}`, tone: 'neutral' as Tone };
}

export function Orcamentos() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('abertos');
  const [search, setSearch] = useState('');
  const [approving, setApproving] = useState<Orcamento | null>(null);
  const [rejecting, setRejecting] = useState<Orcamento | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQuotes(await apiRequest<Orcamento[]>('/api/orcamentos'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os orçamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useLiveRefresh(['ordens'], load);

  const stats = useMemo(() => {
    const open = quotes.filter(isOpen);
    const month = todayLocalDate().slice(0, 7);
    const won = quotes.filter((q) => q.status === 'convertido');
    const wonMonth = won.filter((q) => String(q.aprovado_em || '').startsWith(month));
    const closed = quotes.filter((q) => q.status === 'convertido' || isLost(q));
    return {
      openCount: open.length,
      openValue: open.reduce((sum, q) => sum + q.valor_total, 0),
      wonMonthValue: wonMonth.reduce((sum, q) => sum + q.valor_total, 0),
      wonMonthCount: wonMonth.length,
      rate: closed.length ? Math.round((won.length / closed.length) * 100) : null,
      expiring: open.filter((q) => (daysLeft(q) ?? 99) <= 3).length,
    };
  }, [quotes]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (filter === 'abertos' && !isOpen(quote)) return false;
      if (filter === 'aprovados' && quote.status !== 'convertido') return false;
      if (filter === 'perdidos' && !isLost(quote)) return false;
      if (term && !`${quote.cliente_nome} ${quote.equipamento || ''} ${quote.numero}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [quotes, filter, search]);

  async function send(quote: Orcamento) {
    setBusy(quote.id);
    try {
      await sendQuoteToCustomer(quote.id);
      toast.success(`Orçamento #${quote.numero} enviado para ${quote.cliente_nome}.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar o orçamento.');
    } finally {
      setBusy(null);
    }
  }

  async function pdf(quote: Orcamento) {
    setBusy(quote.id);
    try {
      await downloadQuotePdf(await loadQuote(quote.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function reopen(quote: Orcamento) {
    try {
      await apiRequest(`/api/orcamentos/${quote.id}/reabrir`, { method: 'POST', body: JSON.stringify({ validade_dias: 7 }) });
      toast.success('Orçamento reaberto por mais 7 dias.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao reabrir.');
    }
  }

  async function remove(quote: Orcamento) {
    const result = await alerts.confirm({ title: 'Excluir orçamento?', text: `O orçamento #${quote.numero} de ${quote.cliente_nome} será removido.`, icon: 'warning' });
    if (!result.isConfirmed) return;
    try {
      await apiRequest(`/api/orcamentos/${quote.id}`, { method: 'DELETE' });
      toast.success('Orçamento excluído.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir.');
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Operação"
        title="Orçamentos"
        description="Oriente o cliente antes de abrir a OS. Aprovou? Em poucos cliques vira ordem de serviço com a entrega marcada."
        actions={<UIButton variant="primary" icon={Plus} onClick={() => navigate('/orcamentos/novo')}>Novo orçamento</UIButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi label="Em aberto" value={loading ? '…' : String(stats.openCount)} context={formatCurrency(stats.openValue)} icon={Hourglass} tone="info" onClick={() => setFilter('abertos')} />
        <Kpi label="Aprovados no mês" value={loading ? '…' : formatCurrency(stats.wonMonthValue)} context={`${stats.wonMonthCount} virou OS`} icon={CheckCircle2} tone="success" onClick={() => setFilter('aprovados')} />
        <Kpi label="Taxa de aprovação" value={loading || stats.rate === null ? '—' : `${stats.rate}%`} context="dos orçamentos encerrados" icon={TrendingUp} tone="brand" />
        <Kpi label="Vencendo" value={loading ? '…' : String(stats.expiring)} context="em até 3 dias" icon={Clock} tone="warning" emphasis={stats.expiring > 0} />
      </div>

      <div className="ui-toolbar mt-5">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[{ value: 'abertos', label: 'Em aberto' }, { value: 'aprovados', label: 'Aprovados' }, { value: 'perdidos', label: 'Perdidos' }, { value: 'todos', label: 'Todos' }]}
        />
        <div className="ui-search min-w-48 flex-1">
          <Search aria-hidden />
          <input className="ui-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, equipamento ou número" />
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div>
        ) : visible.length === 0 ? (
          <div className="ui-panel">
            <EmptyState
              icon={ClipboardCheck}
              title={quotes.length === 0 ? 'Nenhum orçamento ainda' : 'Nada por aqui'}
              description={quotes.length === 0 ? 'Crie um orçamento sem precisar abrir uma OS. Quando o cliente aprovar, ele vira OS.' : 'Nenhum orçamento neste filtro.'}
              action={<UIButton variant="primary" icon={Plus} onClick={() => navigate('/orcamentos/novo')}>Novo orçamento</UIButton>}
            />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {visible.map((quote) => {
              const validity = validityLabel(quote);
              const open = isOpen(quote);
              const expired = quote.status_efetivo === 'expirado';
              return (
                <article key={quote.id} className="ui-panel flex flex-col p-5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-subtle">Orçamento #{quote.numero}</p>
                      <h3 className="mt-1 truncate font-display text-lg font-bold text-ink">{quote.cliente_nome}</h3>
                      <p className="truncate text-sm text-ink-muted">{quote.equipamento || 'Equipamento não informado'}</p>
                    </div>
                    <Badge tone={STATUS_TONE[quote.status_efetivo]} dot>{QUOTE_STATUS_LABEL[quote.status_efetivo]}</Badge>
                  </header>

                  <div className="mt-3 space-y-1.5 text-sm">
                    {quote.problema_descricao && <p className="line-clamp-2 text-ink-muted"><b className="text-ink">Problema:</b> {quote.problema_descricao}</p>}
                    {quote.servico_descricao && <p className="line-clamp-2 text-ink-muted"><b className="text-ink">Serviço:</b> {quote.servico_descricao}</p>}
                    {quote.status === 'recusado' && quote.motivo_recusa && <p className="text-signal-danger">Motivo: {quote.motivo_recusa}</p>}
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="ui-money font-display text-2xl font-extrabold text-ink">{formatCurrency(quote.valor_total)}</p>
                      {quote.desconto > 0 && <p className="text-xs text-ink-muted">com {formatCurrency(quote.desconto)} de desconto</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {validity && <Badge tone={validity.tone}>{validity.text}</Badge>}
                      {quote.status === 'convertido' && quote.ordem_numero && <Badge tone="success">OS #{quote.ordem_numero}</Badge>}
                    </div>
                  </div>

                  <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                    {open || expired ? (
                      <>
                        <UIButton variant="success" icon={CalendarCheck} onClick={() => setApproving(quote)}>Aprovar → OS</UIButton>
                        <UIButton icon={Send} loading={busy === quote.id} onClick={() => void send(quote)}>{quote.enviado_em ? 'Reenviar' : 'Enviar'}</UIButton>
                      </>
                    ) : quote.status === 'convertido' ? (
                      <UIButton icon={FileText} onClick={() => navigate(`/ordens/${quote.ordem_servico_id}/historico`)}>Ver OS #{quote.ordem_numero}</UIButton>
                    ) : (
                      <>
                        <UIButton icon={RotateCcw} onClick={() => void reopen(quote)}>Reabrir</UIButton>
                        <UIButton variant="success" icon={CalendarCheck} onClick={() => setApproving(quote)}>Aprovar → OS</UIButton>
                      </>
                    )}
                    <span className="ml-auto flex gap-1">
                      <UIButton size="sm" variant="ghost" icon={Download} aria-label="Baixar PDF" title="Baixar PDF" onClick={() => void pdf(quote)} />
                      {quote.status !== 'convertido' && <UIButton size="sm" variant="ghost" icon={Pencil} aria-label="Editar" title="Editar" onClick={() => navigate(`/orcamentos/editar/${quote.id}`)} />}
                      {open && <UIButton size="sm" variant="ghost" icon={ThumbsDown} aria-label="Cliente recusou" title="Cliente recusou" onClick={() => setRejecting(quote)} />}
                      {quote.status !== 'convertido' && <UIButton size="sm" variant="ghost" icon={Trash2} aria-label="Excluir" title="Excluir" className="hover:!text-signal-danger" onClick={() => void remove(quote)} />}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {approving && <ApproveModal quote={approving} onClose={() => setApproving(null)} onDone={async () => { setApproving(null); await load(); }} />}
        {rejecting && <RejectModal quote={rejecting} onClose={() => setRejecting(null)} onDone={async () => { setRejecting(null); await load(); }} />}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ aprovar → OS */

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-hairline bg-surface-raised p-5 shadow-glass-lg sm:rounded-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-extrabold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          <UIButton size="sm" variant="ghost" icon={X} aria-label="Fechar" onClick={onClose} />
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ApproveModal({ quote, onClose, onDone }: { quote: Orcamento; onClose: () => void; onDone: () => Promise<void> }) {
  const navigate = useNavigate();
  const today = todayLocalDate();
  const suggested = quote.data_previsao && quote.data_previsao.slice(0, 10) >= today ? quote.data_previsao.slice(0, 10) : addDays(today, 7);
  const [date, setDate] = useState(suggested);
  const [deposit, setDeposit] = useState('');
  const [method, setMethod] = useState('pix');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const depositValue = Number(deposit.replace(',', '.')) || 0;
  const invalidDeposit = depositValue < 0 || depositValue >= quote.valor_total;

  const chips = [
    { label: 'Amanhã', days: 1 }, { label: '3 dias', days: 3 }, { label: '1 semana', days: 7 }, { label: '15 dias', days: 15 },
  ];

  async function confirm() {
    if (invalidDeposit) return toast.error('O sinal precisa ser menor que o valor do orçamento.');
    setSaving(true);
    try {
      const result = await apiRequest<{ ordem_id: string; numero: number }>(`/api/orcamentos/${quote.id}/aprovar`, {
        method: 'POST',
        body: JSON.stringify({ data_previsao: date, sinal_valor: depositValue || 0, sinal_forma: method }),
      });
      toast.success(`Orçamento aprovado! OS #${result.numero} aberta, entrega em ${formatDateBR(date)}.`);
      if (notify) {
        try {
          const { data, error } = await supabase.from('ordens_servico').select('*,cliente:clientes(*),instrumento:instrumentos(*),marca:marcas(*)').eq('id', result.ordem_id).single();
          if (error) throw error;
          await WhatsAppService.sendOrderMessage({ ...(data as OrdemServico), condicoes_pagamento: [] });
          toast.success('OS enviada ao cliente.');
        } catch (error) {
          toast.error(`OS aberta, mas não consegui avisar o cliente: ${error instanceof Error ? error.message : 'erro'}.`);
        }
      }
      await onDone();
      navigate(`/ordens/${result.ordem_id}/historico`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aprovar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Aprovar e abrir OS" subtitle={`${quote.cliente_nome} · ${quote.equipamento || 'orçamento'} · ${formatCurrency(quote.valor_total)}`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="ui-label" htmlFor="entrega">Data de entrega combinada</label>
          <input id="entrega" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="ui-field" />
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button key={chip.label} type="button" onClick={() => setDate(addDays(today, chip.days))} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${date === addDays(today, chip.days) ? 'border-brand/60 bg-brand/15 text-brand-soft' : 'border-hairline text-ink-muted hover:border-brand/40'}`}>{chip.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="ui-label" htmlFor="sinal">Sinal recebido agora <span className="font-normal normal-case text-ink-subtle">(opcional)</span></label>
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <input id="sinal" inputMode="decimal" placeholder="0,00" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^\d.,]/g, ''))} className="ui-field" />
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="ui-field" aria-label="Forma do sinal">
              <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option>
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            {[30, 50].map((percent) => (
              <button key={percent} type="button" onClick={() => setDeposit(((quote.valor_total * percent) / 100).toFixed(2).replace('.', ','))} className="rounded-full border border-hairline px-3 py-1 text-xs font-semibold text-ink-muted hover:border-brand/40">{percent}% ({formatCurrency((quote.valor_total * percent) / 100)})</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-subtle">O restante ({formatCurrency(quote.valor_total - (invalidDeposit ? 0 : depositValue))}) fica para a retirada.</p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-hairline p-3 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-1 h-4 w-4" />
          <span><b className="text-ink">Avisar o cliente</b><br /><span className="text-ink-muted">Envia a OS (mensagem + PDF) com a data de entrega.</span></span>
        </label>

        <div className="flex justify-end gap-2">
          <UIButton variant="ghost" onClick={onClose} disabled={saving}>Cancelar</UIButton>
          <UIButton variant="primary" size="lg" icon={CalendarCheck} loading={saving} disabled={!date} onClick={() => void confirm()}>Abrir OS</UIButton>
        </div>
      </div>
    </ModalShell>
  );
}

function RejectModal({ quote, onClose, onDone }: { quote: Orcamento; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const quick = ['Achou caro', 'Vai pensar', 'Escolheu outro lugar', 'Desistiu do serviço'];
  async function confirm() {
    setSaving(true);
    try {
      await apiRequest(`/api/orcamentos/${quote.id}/recusar`, { method: 'POST', body: JSON.stringify({ motivo: reason }) });
      toast.success('Orçamento marcado como recusado.');
      await onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao recusar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalShell title="Cliente recusou" subtitle={`${quote.cliente_nome} · orçamento #${quote.numero}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {quick.map((item) => <button key={item} type="button" onClick={() => setReason(item)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${reason === item ? 'border-brand/60 bg-brand/15 text-brand-soft' : 'border-hairline text-ink-muted hover:border-brand/40'}`}>{item}</button>)}
        </div>
        <textarea className="ui-field" rows={3} placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <UIButton variant="ghost" onClick={onClose} disabled={saving}>Cancelar</UIButton>
          <UIButton variant="danger" icon={ThumbsDown} loading={saving} onClick={() => void confirm()}>Marcar como recusado</UIButton>
        </div>
      </div>
    </ModalShell>
  );
}
