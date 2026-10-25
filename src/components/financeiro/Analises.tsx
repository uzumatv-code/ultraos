/** Blocos de leitura do financeiro: categorias, idade da carteira, projeção e DRE. */

import type { ReactNode } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { Meter, toneText, type Tone } from '../ui';
import type { Resumo } from './types';

export function FinPanel({
  id,
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  id: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-panel ui-panel-flush flex flex-col ${className}`} aria-labelledby={id}>
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id={id} className="dash-section-title">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="-mr-2 shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Ranking de categorias com a participação de cada uma no total. */
export function CategoryBars({ items, empty }: { items: Array<{ nome: string; cor: string; valor: number }>; empty: string }) {
  const total = items.reduce((sum, item) => sum + item.valor, 0);
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-ink-subtle">{empty}</p>;
  return (
    <ul className="space-y-3 px-4 py-4 sm:px-5">
      {items.map((item) => {
        const share = total > 0 ? (item.valor / total) * 100 : 0;
        return (
          <li key={item.nome}>
            <div className="mb-1 flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.cor }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink-muted">{item.nome}</span>
              <span className="tabular-nums text-ink-subtle">{share.toFixed(0)}%</span>
              <strong className="w-24 shrink-0 text-right tabular-nums text-ink">{formatCurrency(item.valor)}</strong>
            </div>
            <div className="ui-meter">
              <span style={{ width: `${Math.max(3, share)}%`, backgroundColor: item.cor }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const agingTone: Record<string, Tone> = { a_vencer: 'info', d1_15: 'warning', d16_30: 'warning', d31_60: 'danger', d60_mais: 'danger' };

export function AgingBars({ aging }: { aging: Resumo['recebiveis']['aging'] }) {
  const max = Math.max(...aging.map((item) => item.valor), 1);
  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      {aging.map((item) => (
        <div key={item.chave}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="text-ink-muted">
              {item.label}
              {item.quantidade > 0 && <span className="ml-1.5 text-ink-subtle">· {item.quantidade}</span>}
            </span>
            <strong className="tabular-nums text-ink">{formatCurrency(item.valor)}</strong>
          </div>
          <Meter value={item.valor} max={max} tone={agingTone[item.chave] ?? 'neutral'} />
        </div>
      ))}
      <p className="border-t border-hairline pt-3 text-xs text-ink-muted">Acima de 60 dias raramente entra sem contato direto. Comece a cobrança pela faixa mais antiga.</p>
    </div>
  );
}

/** Saldo previsto por janela, acumulado, a partir do que já está registrado. */
export function ProjectionList({ projecao }: { projecao: Resumo['projecao'] }) {
  let running = 0;
  return (
    <>
      <ul className="divide-y divide-hairline">
        {projecao.map((item) => {
          running = Number((running + item.saldo).toFixed(2));
          return (
            <li key={item.chave} className="px-4 py-2.5 sm:px-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{item.label}</span>
                <strong className={`text-sm font-semibold tabular-nums ${item.saldo < 0 ? 'text-signal-danger' : 'text-ink'}`}>
                  {item.saldo >= 0 ? '+' : '−'} {formatCurrency(Math.abs(item.saldo))}
                </strong>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-ink-subtle">
                <span className="tabular-nums">
                  <span className="text-signal-success">+{formatCurrency(item.entradas)}</span> · −{formatCurrency(item.saidas)}
                </span>
                <span className="tabular-nums">acum. {formatCurrency(running)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto border-t border-hairline px-4 py-2.5 text-2xs text-ink-subtle sm:px-5">
        Considera só o que já está registrado e supõe que tudo entra e sai na data. Recorrências ainda não geradas ficam de fora.
      </p>
    </>
  );
}

export function DreTable({ competencia }: { competencia: Resumo['competencia'] }) {
  const find = (key: string) => competencia.grupos.find((group) => group.chave === key)?.valor ?? 0;
  const custo = find('custo_direto');
  const investimento = find('investimento');

  const rows: Array<{ label: string; value: number; kind: 'entrada' | 'saida' | 'subtotal' | 'total'; hint?: string }> = [
    { label: 'Receita de serviços', value: find('receita_servico'), kind: 'entrada' },
    { label: 'Outras receitas', value: find('receita_outras'), kind: 'entrada' },
    { label: 'Receita bruta', value: competencia.receita, kind: 'subtotal' },
    { label: 'Custos diretos', value: -custo, kind: 'saida', hint: 'Peças, materiais e insumos aplicados no serviço' },
    { label: 'Margem bruta', value: Number((competencia.receita - custo).toFixed(2)), kind: 'subtotal' },
    { label: 'Despesas operacionais', value: -find('despesa_operacional'), kind: 'saida', hint: 'Aluguel, energia, ferramentas de trabalho' },
    { label: 'Despesas administrativas', value: -find('despesa_administrativa'), kind: 'saida', hint: 'Impostos, contabilidade, pró-labore' },
    { label: 'Despesas financeiras', value: -find('despesa_financeira'), kind: 'saida', hint: 'Tarifas, juros e taxas de cartão' },
    { label: 'Resultado operacional', value: competencia.resultado, kind: 'total' },
  ];
  if (investimento > 0) rows.push({ label: 'Investimentos', value: -investimento, kind: 'saida', hint: 'Fora do resultado operacional' });

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th className="w-40 text-right">Valor</th>
            <th className="w-24 text-right">% receita</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const summary = row.kind === 'subtotal' || row.kind === 'total';
            const share = competencia.receita > 0 ? (Math.abs(row.value) / competencia.receita) * 100 : 0;
            const valueClass =
              row.kind === 'total'
                ? `text-base font-bold ${row.value >= 0 ? toneText.success : toneText.danger}`
                : row.kind === 'subtotal'
                  ? 'font-semibold text-ink'
                  : row.value < 0
                    ? 'text-ink-muted'
                    : toneText.success;
            return (
              <tr key={row.label} className={summary ? 'bg-surface-muted/60' : undefined}>
                <td>
                  <span className={summary ? 'font-semibold text-ink' : 'text-ink-muted'}>{row.label}</span>
                  {row.hint && <p className="text-xs text-ink-subtle">{row.hint}</p>}
                </td>
                <td className="ui-num">
                  <span className={valueClass}>{formatCurrency(row.value)}</span>
                </td>
                <td className="ui-num">
                  <span className="text-xs text-ink-subtle">{competencia.receita > 0 ? `${share.toFixed(1)}%` : '—'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
