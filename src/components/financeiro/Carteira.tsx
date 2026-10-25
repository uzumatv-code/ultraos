/**
 * Carteira: títulos a receber e contas a pagar em aberto, com busca, filtro
 * e a ação ao lado de cada linha. Não depende do período: é o que está em aberto hoje.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, MessageCircle, Search } from 'lucide-react';
import { formatCurrency, formatDateOnly, openWhatsApp } from '../../utils/formatters';
import { EmptyState, Segmented, Skeleton, UIButton } from '../ui';
import { dueText } from './period';
import type { Payable, Receivable } from './types';

type ReceberFiltro = 'todos' | 'vencidos' | 'a_vencer';
type PagarFiltro = 'todos' | 'vencidos' | 'semana';

function Toolbar({ busca, onBusca, placeholder, children }: { busca: string; onBusca: (value: string) => void; placeholder: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <label className="ui-search min-w-0 flex-1">
        <Search aria-hidden />
        <input className="ui-field" value={busca} onChange={(event) => onBusca(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      {children}
    </div>
  );
}

export function ReceberList({
  rows,
  loading,
  busy,
  onReceive,
}: {
  rows: Receivable[];
  loading: boolean;
  busy: string | null;
  onReceive: (item: Receivable) => void;
}) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<ReceberFiltro>('todos');

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filtro === 'todos' || (filtro === 'vencidos' ? row.dias_atraso > 0 : row.dias_atraso <= 0)) &&
        (!term || `${row.cliente_nome ?? ''} ${row.descricao} ${row.ordem_numero ?? ''}`.toLowerCase().includes(term)),
    );
  }, [rows, busca, filtro]);
  const total = filtered.reduce((sum, row) => sum + Number(row.saldo), 0);

  function charge(row: Receivable) {
    const first = (row.cliente_nome || '').trim().split(/\s+/)[0];
    const text = [
      `Olá${first ? `, ${first}` : ''}! Tudo bem?`,
      `Passando para lembrar do saldo de ${formatCurrency(Number(row.saldo))}${row.ordem_numero ? ` da OS #${row.ordem_numero}` : ''}, com vencimento em ${formatDateOnly(row.data_vencimento)}.`,
    ].join(' ');
    openWhatsApp(row.cliente_telefone || '', encodeURIComponent(text));
  }

  return (
    <section className="ui-panel ui-panel-flush" aria-labelledby="receber-title">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="receber-title" className="dash-section-title">
            Títulos a receber
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">Os mais antigos primeiro: é por onde a cobrança começa</p>
        </div>
        <strong className="shrink-0 text-sm tabular-nums text-ink">{formatCurrency(total)}</strong>
      </header>
      <Toolbar busca={busca} onBusca={setBusca} placeholder="Buscar cliente, descrição ou OS">
        <Segmented<ReceberFiltro>
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'vencidos', label: 'Vencidos' },
            { value: 'a_vencer', label: 'A vencer' },
          ]}
        />
      </Toolbar>
      {loading && !rows.length ? (
        <div className="space-y-2 p-4 sm:p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !filtered.length ? (
        <EmptyState icon={CheckCircle2} title={rows.length ? 'Nenhum título com esse filtro' : 'Nada a receber'} description={rows.length ? undefined : 'Toda a carteira está quitada.'} />
      ) : (
        <ul className="divide-y divide-hairline">
          {filtered.map((row) => (
            <li key={row.id} className="fin-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{row.cliente_nome || row.descricao}</span>
                <span className="block truncate text-xs text-ink-subtle">
                  {row.ordem_numero ? (
                    <button type="button" className="text-brand-soft hover:underline" onClick={() => navigate(`/ordens/${row.ordem_servico_id}/historico`)}>
                      OS #{row.ordem_numero}
                    </button>
                  ) : (
                    row.descricao
                  )}
                  {' · '}
                  <span className={row.dias_atraso > 0 ? 'text-signal-danger' : undefined}>{dueText(row.dias_atraso)}</span>
                  {Number(row.valor_recebido) > 0 && ` · ${formatCurrency(Number(row.valor_recebido))} já pago`}
                </span>
              </span>
              <strong className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatCurrency(Number(row.saldo))}</strong>
              <span className="flex shrink-0 items-center gap-1">
                {row.cliente_telefone && (
                  <button type="button" className="app-icon-button h-8 w-8" title="Cobrar pelo WhatsApp (abre a conversa com a mensagem pronta)" aria-label="Cobrar pelo WhatsApp" onClick={() => charge(row)}>
                    <MessageCircle className="h-4 w-4" />
                  </button>
                )}
                <UIButton
                  size="sm"
                  variant="success"
                  loading={busy === row.id}
                  disabled={!row.ordem_servico_id || Boolean(busy)}
                  title={row.ordem_servico_id ? 'Registrar o recebimento do saldo' : 'Recebível sem OS: registre pela tela de lançamentos'}
                  onClick={() => onReceive(row)}
                >
                  Receber
                </UIButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PagarList({
  rows,
  loading,
  busy,
  onPay,
}: {
  rows: Payable[];
  loading: boolean;
  busy: string | null;
  onPay: (item: Payable) => void;
}) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<PagarFiltro>('todos');

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filtro === 'todos' || (filtro === 'vencidos' ? row.dias_atraso > 0 : row.dias_atraso <= 0 && row.dias_atraso >= -7)) &&
        (!term || `${row.descricao} ${row.categoria_nome ?? ''}`.toLowerCase().includes(term)),
    );
  }, [rows, busca, filtro]);
  const total = filtered.reduce((sum, row) => sum + Number(row.valor), 0);

  return (
    <section className="ui-panel ui-panel-flush" aria-labelledby="pagar-title">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="pagar-title" className="dash-section-title">
            Contas a pagar
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">Em aberto, por vencimento</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <strong className="text-sm tabular-nums text-ink">{formatCurrency(total)}</strong>
          <UIButton size="sm" variant="ghost" onClick={() => navigate('/contas')}>
            Gerenciar contas
          </UIButton>
        </div>
      </header>
      <Toolbar busca={busca} onBusca={setBusca} placeholder="Buscar conta ou categoria">
        <Segmented<PagarFiltro>
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'todos', label: 'Todas' },
            { value: 'vencidos', label: 'Vencidas' },
            { value: 'semana', label: 'Próximos 7 dias' },
          ]}
        />
      </Toolbar>
      {loading && !rows.length ? (
        <div className="space-y-2 p-4 sm:p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !filtered.length ? (
        <EmptyState icon={CheckCircle2} title={rows.length ? 'Nenhuma conta com esse filtro' : 'Nenhuma conta em aberto'} description={rows.length ? undefined : 'Nada pendente de pagamento.'} />
      ) : (
        <ul className="divide-y divide-hairline">
          {filtered.map((row) => (
            <li key={row.id} className="fin-row">
              <span className="fin-cat-dot" style={{ background: row.categoria_cor || 'rgb(var(--ui-text-subtle))' }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{row.descricao}</span>
                <span className="block truncate text-xs text-ink-subtle">
                  {row.categoria_nome || 'Sem categoria'}
                  {' · '}
                  <span className={row.dias_atraso > 0 ? 'text-signal-danger' : undefined}>{dueText(row.dias_atraso)}</span>
                  {Number(row.recorrente) === 1 && ' · Recorrente'}
                </span>
              </span>
              <strong className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatCurrency(Number(row.valor))}</strong>
              <UIButton size="sm" icon={CheckCircle2} loading={busy === row.id} disabled={Boolean(busy)} onClick={() => onPay(row)}>
                Pagar
              </UIButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
