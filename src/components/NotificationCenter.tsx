import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCheck, MessageCircle, PackageCheck, RefreshCw, Send, Wallet } from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { toast } from './ToastCustom';
import { openWhatsApp, formatCurrency } from '../utils/formatters';
import { toDateOnly, todayLocalDate } from '../utils/dates';
import { Badge, UIButton } from './ui';
import type { Tone } from './ui';
import type { ContaPagar, OrdemServico } from '../types/database';

export interface AlertSummary {
  entregas_hoje: number;
  atrasadas: number;
  contas_hoje: number;
  contas_vencidas: number;
  mensagens_nao_lidas: number;
  conversas_nao_lidas: number;
  ordens: OrdemServico[];
  contas: ContaPagar[];
}

type Filter = 'todas' | 'ordens' | 'financeiro' | 'mensagens';
const MAX_PER_GROUP = 5;

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);

const ago = (days: number) => (days <= 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`);

/** Total exibido no sino: é exatamente a soma dos grupos que o painel mostra. */
export function notificationTotal(summary: AlertSummary) {
  return summary.atrasadas + summary.entregas_hoje + summary.contas_vencidas + summary.contas_hoje + summary.conversas_nao_lidas;
}

interface Group {
  id: string;
  filter: Exclude<Filter, 'todas'>;
  title: string;
  tone: Tone;
  total: number;
  icon: typeof AlertTriangle;
  more: { label: string; to: string };
  items: React.ReactNode[];
}

export function NotificationCenter({ summary, onClose, onRefresh }: { summary: AlertSummary; onClose: () => void; onRefresh: () => Promise<void> | void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('todas');
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const today = todayLocalDate();

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  async function pay(conta: ContaPagar) {
    setBusy(conta.id);
    try {
      await apiRequest(`/api/financeiro/contas-pagar/${conta.id}/pagar`, { method: 'POST', body: JSON.stringify({ forma_pagamento: conta.forma_pagamento }) });
      toast.success(`${conta.descricao} paga e lançada no caixa.`);
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível pagar a conta.');
    } finally {
      setBusy(null);
    }
  }

  function notifyCustomer(ordem: OrdemServico) {
    if (!ordem.cliente?.telefone) return toast.error('Cliente sem telefone cadastrado.');
    const equipamento = [ordem.instrumento?.nome, ordem.modelo].filter(Boolean).join(' ');
    openWhatsApp(ordem.cliente.telefone, encodeURIComponent(`Olá ${ordem.cliente.nome}! Sobre o seu ${equipamento} (OS #${ordem.numero}): `));
  }

  const groups = useMemo<Group[]>(() => {
    const dueOf = (ordem: OrdemServico) => toDateOnly(ordem.data_previsao);
    const lateOrders = summary.ordens.filter((o) => dueOf(o) < today);
    const todayOrders = summary.ordens.filter((o) => dueOf(o) === today);
    const lateBills = summary.contas.filter((c) => toDateOnly(c.data_vencimento) < today);
    const todayBills = summary.contas.filter((c) => toDateOnly(c.data_vencimento) === today);

    const orderRow = (ordem: OrdemServico, tone: Tone) => {
      const days = daysBetween(dueOf(ordem), today);
      return (
        <li key={ordem.id} className="ui-notif-row">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go(`/ordens/${ordem.id}/historico`)}>
            <p className="truncate text-sm font-semibold text-ink">{ordem.cliente?.nome}</p>
            <p className="truncate text-xs text-ink-muted">OS #{ordem.numero} · {[ordem.instrumento?.nome, ordem.modelo].filter(Boolean).join(' ')}</p>
            <p className={`mt-0.5 text-xs font-medium ${tone === 'danger' ? 'text-signal-danger' : 'text-signal-info'}`}>
              {tone === 'danger' ? `Prevista ${ago(days)}` : 'Entrega prevista para hoje'}
            </p>
          </button>
          <UIButton size="sm" variant="ghost" icon={Send} aria-label="Avisar o cliente no WhatsApp" title="Avisar o cliente" onClick={() => notifyCustomer(ordem)} />
        </li>
      );
    };

    const billRow = (conta: ContaPagar, tone: Tone) => {
      const days = daysBetween(toDateOnly(conta.data_vencimento), today);
      return (
        <li key={conta.id} className="ui-notif-row">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go('/contas')}>
            <p className="truncate text-sm font-semibold text-ink">{conta.descricao}</p>
            <p className="ui-money text-xs text-ink-muted">{formatCurrency(Number(conta.valor))}{conta.parcela_total ? ` · parcela ${conta.parcela_numero}/${conta.parcela_total}` : ''}</p>
            <p className={`mt-0.5 text-xs font-medium ${tone === 'danger' ? 'text-signal-danger' : 'text-signal-warning'}`}>
              {tone === 'danger' ? `Venceu ${ago(days)}` : 'Vence hoje'}
            </p>
          </button>
          <UIButton size="sm" variant="success" loading={busy === conta.id} onClick={() => void pay(conta)}>Pagar</UIButton>
        </li>
      );
    };

    const list: Group[] = [
      { id: 'contas-vencidas', filter: 'financeiro', title: 'Contas vencidas', tone: 'danger', total: summary.contas_vencidas, icon: Wallet, more: { label: 'Ver contas vencidas', to: '/contas' }, items: lateBills.slice(0, MAX_PER_GROUP).map((c) => billRow(c, 'danger')) },
      { id: 'os-atrasadas', filter: 'ordens', title: 'Ordens atrasadas', tone: 'danger', total: summary.atrasadas, icon: AlertTriangle, more: { label: 'Ver ordens atrasadas', to: '/ordens' }, items: lateOrders.slice(0, MAX_PER_GROUP).map((o) => orderRow(o, 'danger')) },
      { id: 'contas-hoje', filter: 'financeiro', title: 'Vencem hoje', tone: 'warning', total: summary.contas_hoje, icon: CalendarClock, more: { label: 'Ver contas', to: '/contas' }, items: todayBills.slice(0, MAX_PER_GROUP).map((c) => billRow(c, 'warning')) },
      { id: 'os-hoje', filter: 'ordens', title: 'Entregas de hoje', tone: 'info', total: summary.entregas_hoje, icon: PackageCheck, more: { label: 'Ver ordens', to: '/ordens' }, items: todayOrders.slice(0, MAX_PER_GROUP).map((o) => orderRow(o, 'info')) },
      {
        id: 'conversas', filter: 'mensagens', title: 'Conversas não lidas', tone: 'accent', total: summary.conversas_nao_lidas, icon: MessageCircle, more: { label: 'Abrir conversas', to: '/conversas' },
        items: summary.conversas_nao_lidas > 0
          ? [(
            <li key="conv" className="ui-notif-row">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go('/conversas')}>
                <p className="text-sm font-semibold text-ink">{summary.mensagens_nao_lidas} mensagem{summary.mensagens_nao_lidas === 1 ? '' : 's'} em {summary.conversas_nao_lidas} conversa{summary.conversas_nao_lidas === 1 ? '' : 's'}</p>
                <p className="text-xs text-ink-muted">Clientes aguardando resposta no WhatsApp</p>
              </button>
            </li>
          )]
          : [],
      },
    ];
    return list.filter((group) => group.total > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, today, busy]);

  const counts = {
    todas: notificationTotal(summary),
    ordens: summary.atrasadas + summary.entregas_hoje,
    financeiro: summary.contas_vencidas + summary.contas_hoje,
    mensagens: summary.conversas_nao_lidas,
  };
  const visible = groups.filter((group) => filter === 'todas' || group.filter === filter);

  async function refresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <div className="flex max-h-[min(36rem,calc(100dvh-6rem))] flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-display text-base font-extrabold text-ink">Notificações</h3>
          {counts.todas > 0 && <Badge tone="danger">{counts.todas}</Badge>}
        </div>
        <UIButton size="sm" variant="ghost" icon={RefreshCw} aria-label="Atualizar" onClick={() => void refresh()} className={refreshing ? '[&_svg]:animate-spin' : ''} />
      </header>

      <div className="flex gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2">
        {([['todas', 'Todas'], ['ordens', 'Ordens'], ['financeiro', 'Financeiro'], ['mensagens', 'Mensagens']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="ui-notif-chip">
            {label}
            <span className="ui-notif-chip-count">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="ui-icon-tile ui-icon-tile-lg ui-tone-success mb-3"><CheckCheck /></span>
            <p className="text-sm font-bold text-ink">Tudo em dia</p>
            <p className="mt-1 text-xs text-ink-muted">Nenhum alerta {filter === 'todas' ? 'por enquanto' : 'nesta categoria'}.</p>
          </div>
        ) : (
          visible.map((group) => {
            const Icon = group.icon;
            const hidden = group.total - group.items.length;
            return (
              <section key={group.id}>
                <h4 className="ui-notif-title">
                  <span className={`ui-icon-tile ui-icon-tile-sm ui-tone-${group.tone}`}><Icon /></span>
                  {group.title}
                  <span className="ml-auto text-xs font-semibold text-ink-muted">{group.total}</span>
                </h4>
                <ul>{group.items}</ul>
                {hidden > 0 && (
                  <button type="button" onClick={() => go(group.more.to)} className="w-full px-4 py-2 text-left text-xs font-semibold text-brand-soft hover:underline">
                    + {hidden} {hidden === 1 ? 'outro' : 'outros'} — {group.more.label}
                  </button>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
