/**
 * Vencimentos: o que já venceu e o que vence nos próximos 7 dias, a receber e
 * a pagar, numa lista só e com a ação ao lado. Independe do período escolhido,
 * porque responde "o que preciso resolver agora".
 */

import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { UIButton } from '../ui';
import { dueText } from './period';
import type { Payable, Receivable } from './types';

const WINDOW_DAYS = 7;
const LIMIT = 6;

type Item =
  | { kind: 'receber'; id: string; name: string; detail: string; value: number; days: number; source: Receivable }
  | { kind: 'pagar'; id: string; name: string; detail: string; value: number; days: number; source: Payable };

export function DueList({
  receivables,
  payables,
  busy,
  onReceive,
  onPay,
  onSeeAll,
}: {
  receivables: Receivable[];
  payables: Payable[];
  busy: string | null;
  onReceive: (item: Receivable) => void;
  onPay: (item: Payable) => void;
  onSeeAll: (kind: 'receber' | 'pagar') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { late, soon, inSoon, outSoon } = useMemo(() => {
    const items: Item[] = [
      ...receivables.map((row) => ({
        kind: 'receber' as const,
        id: `r-${row.id}`,
        name: row.cliente_nome || row.descricao,
        detail: row.ordem_numero ? `OS #${row.ordem_numero}` : row.descricao,
        value: Number(row.saldo),
        days: Number(row.dias_atraso),
        source: row,
      })),
      ...payables.map((row) => ({
        kind: 'pagar' as const,
        id: `p-${row.id}`,
        name: row.descricao,
        detail: row.categoria_nome || 'Conta a pagar',
        value: Number(row.valor),
        days: Number(row.dias_atraso),
        source: row,
      })),
    ].filter((item) => item.days >= -WINDOW_DAYS);
    const lateItems = items.filter((item) => item.days > 0).sort((a, b) => b.days - a.days);
    const soonItems = items.filter((item) => item.days <= 0).sort((a, b) => b.days - a.days);
    const sum = (list: Item[], kind: Item['kind']) => list.filter((item) => item.kind === kind).reduce((total, item) => total + item.value, 0);
    return { late: lateItems, soon: soonItems, inSoon: sum(soonItems, 'receber'), outSoon: sum(soonItems, 'pagar') };
  }, [receivables, payables]);

  const total = late.length + soon.length;
  let budget = expanded ? Infinity : LIMIT;
  const take = (list: Item[]) => {
    const slice = list.slice(0, Math.max(0, budget));
    budget -= slice.length;
    return slice;
  };
  const lateShown = take(late);
  const soonShown = take(soon);

  return (
    <section className="ui-panel ui-panel-flush flex flex-col" aria-labelledby="due-title">
      <header className="border-b border-hairline px-4 py-3.5 sm:px-5">
        <h2 id="due-title" className="dash-section-title">
          Vencimentos
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">Vencidos e próximos {WINDOW_DAYS} dias</p>
      </header>

      <dl className="grid grid-cols-2 divide-x divide-hairline border-b border-hairline">
        <div className="px-4 py-2.5 sm:px-5">
          <dt className="dash-eyebrow">Entra em 7 dias</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-signal-success">{formatCurrency(inSoon)}</dd>
        </div>
        <div className="px-4 py-2.5 sm:px-5">
          <dt className="dash-eyebrow">Sai em 7 dias</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{formatCurrency(outSoon)}</dd>
        </div>
      </dl>

      {total === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
          <span className="dash-sev" data-tone="success" aria-hidden>
            <CheckCircle2 />
          </span>
          <p className="text-sm text-ink-muted">Nada vencido e nada vencendo na semana.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lateShown.length > 0 && <Group title={`Vencidos · ${late.length}`} tone="danger" items={lateShown} busy={busy} onReceive={onReceive} onPay={onPay} />}
          {soonShown.length > 0 && <Group title={`Próximos dias · ${soon.length}`} items={soonShown} busy={busy} onReceive={onReceive} onPay={onPay} />}
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-hairline px-3 py-2 text-xs">
        {total > LIMIT ? (
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Mostrar menos' : `Mostrar todos (${total})`}
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-1">
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => onSeeAll('receber')}>
            A receber
          </button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => onSeeAll('pagar')}>
            A pagar
          </button>
        </span>
      </footer>
    </section>
  );
}

function Group({
  title,
  tone,
  items,
  busy,
  onReceive,
  onPay,
}: {
  title: string;
  tone?: 'danger';
  items: Item[];
  busy: string | null;
  onReceive: (item: Receivable) => void;
  onPay: (item: Payable) => void;
}) {
  return (
    <div>
      <p className={`fin-day ${tone === 'danger' ? 'text-signal-danger' : ''}`}>{title}</p>
      <ul className="divide-y divide-hairline">
        {items.map((item) => {
          const income = item.kind === 'receber';
          const Icon = income ? ArrowDownLeft : ArrowUpRight;
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="dash-sev" data-tone={income ? 'success' : 'neutral'} aria-label={income ? 'A receber' : 'A pagar'}>
                <Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                <span className={`block truncate text-xs ${item.days > 0 ? 'text-signal-danger' : 'text-ink-subtle'}`}>
                  {dueText(item.days)} · {item.detail}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <strong className={`text-sm font-semibold tabular-nums ${income ? 'text-signal-success' : 'text-ink'}`}>{formatCurrency(item.value)}</strong>
                {item.kind === 'receber' ? (
                  <UIButton
                    size="sm"
                    variant="ghost"
                    className="!h-6 !px-2 text-2xs"
                    loading={busy === item.source.id}
                    disabled={!item.source.ordem_servico_id || Boolean(busy)}
                    title={item.source.ordem_servico_id ? 'Registrar o recebimento do saldo' : 'Recebível sem OS: registre pela tela de lançamentos'}
                    onClick={() => onReceive(item.source)}
                  >
                    Receber
                  </UIButton>
                ) : (
                  <UIButton
                    size="sm"
                    variant="ghost"
                    className="!h-6 !px-2 text-2xs"
                    loading={busy === item.source.id}
                    disabled={Boolean(busy)}
                    onClick={() => onPay(item.source)}
                  >
                    Pagar
                  </UIButton>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
