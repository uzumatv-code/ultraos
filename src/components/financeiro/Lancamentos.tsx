/**
 * Extrato do período: todos os lançamentos do caixa, agrupados por dia.
 *
 * Busca, tipo e categoria filtram na hora (o período inteiro vem de uma vez,
 * até 1.000 lançamentos). Lançamentos avulsos podem ser editados e excluídos;
 * os que nasceram de um pagamento de OS ou de uma conta paga ficam travados
 * aqui, porque excluí-los deixaria a OS ou a conta marcada como paga sem o
 * dinheiro correspondente no caixa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Link2, Pencil, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLiveRefresh } from '../../lib/live-events';
import { alerts } from '../../utils/alerts';
import { formatCurrency } from '../../utils/formatters';
import { addDaysToDateOnly, parseLocalDate, toDateOnly } from '../../utils/dates';
import { toast } from '../ToastCustom';
import { EmptyState, Segmented, Skeleton, UIButton } from '../ui';
import type { CategoriaFinanceira, TransacaoFinanceira } from '../../types/database';
import type { DateRange } from './period';

const FETCH_LIMIT = 1000;
const PAGE = 60;

type Tipo = 'todos' | 'receita' | 'despesa';

const paymentLabel: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  credito: 'Crédito',
  debito: 'Débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
};

function dayHeading(day: string) {
  const date = parseLocalDate(day)!;
  const text = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function csvCell(value: string | number) {
  const text = String(value ?? '');
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function Lancamentos({
  range,
  categorias,
  onEdit,
  onChanged,
}: {
  range: DateRange;
  categorias: CategoriaFinanceira[];
  onEdit: (transacao: TransacaoFinanceira) => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TransacaoFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [categoria, setCategoria] = useState('');
  const [visible, setVisible] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transacoes_financeiras')
        .select('*,categoria:categorias_financeiras(*)')
        .gte('data', range.inicio)
        .lt('data', addDaysToDateOnly(range.fim, 1))
        .order('data', { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os lançamentos');
    } finally {
      setLoading(false);
    }
  }, [range.inicio, range.fim]);

  useEffect(() => {
    void load();
    setVisible(PAGE);
  }, [load]);

  useLiveRefresh(['financeiro'], () => void load());

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (tipo === 'todos' || row.tipo === tipo) &&
        (!categoria || row.categoria_id === categoria) &&
        (!term || `${row.descricao} ${row.categoria?.nome ?? ''}`.toLowerCase().includes(term)),
    );
  }, [rows, busca, tipo, categoria]);

  const totals = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const row of filtered) {
      if (row.tipo === 'receita') entradas += Number(row.valor);
      else saidas += Number(row.valor);
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, TransacaoFinanceira[]>();
    for (const row of filtered.slice(0, visible)) {
      const day = toDateOnly(row.data);
      const list = map.get(day);
      if (list) list.push(row);
      else map.set(day, [row]);
    }
    return [...map.entries()];
  }, [filtered, visible]);

  async function remove(row: TransacaoFinanceira) {
    const confirm = await alerts.confirm({
      title: 'Excluir lançamento',
      text: `"${row.descricao}" (${formatCurrency(Number(row.valor))}) sai do caixa. Confirma?`,
      icon: 'warning',
      confirmButtonText: 'Excluir',
    });
    if (!confirm.isConfirmed) return;
    const { error } = await supabase.from('transacoes_financeiras').delete().eq('id', row.id);
    if (error) {
      toast.error('Erro ao excluir o lançamento');
      return;
    }
    toast.success('Lançamento excluído.');
    onChanged();
    void load();
  }

  function exportCsv() {
    const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Forma de pagamento', 'Valor'];
    const lines = filtered.map((row) =>
      [
        toDateOnly(row.data),
        row.tipo === 'receita' ? 'Entrada' : 'Saída',
        row.descricao,
        row.categoria?.nome ?? '',
        row.forma_pagamento ? paymentLabel[row.forma_pagamento] ?? row.forma_pagamento : '',
        (row.tipo === 'receita' ? 1 : -1) * Number(row.valor),
      ]
        .map((cell) => (typeof cell === 'number' ? cell.toFixed(2).replace('.', ',') : csvCell(cell)))
        .join(';'),
    );
    // BOM no início para o Excel abrir os acentos corretamente.
    const blob = new Blob([String.fromCharCode(0xfeff), [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lancamentos-${range.inicio}-a-${range.fim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="ui-panel ui-panel-flush" aria-labelledby="lancamentos-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="lancamentos-title" className="dash-section-title">
            Lançamentos do período
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {loading ? 'Carregando…' : `${filtered.length} de ${rows.length} lançamento${rows.length === 1 ? '' : 's'}`}
            {rows.length >= FETCH_LIMIT && ' · mostrando os 1.000 mais recentes'}
          </p>
        </div>
        <UIButton variant="ghost" size="sm" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
          Exportar CSV
        </UIButton>
      </header>

      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
        <label className="ui-search min-w-0 flex-1">
          <Search aria-hidden />
          <input className="ui-field" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar descrição ou categoria" aria-label="Buscar lançamentos" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Tipo>
            value={tipo}
            onChange={setTipo}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'receita', label: 'Entradas' },
              { value: 'despesa', label: 'Saídas' },
            ]}
          />
          <select className="ui-field w-auto min-w-40" value={categoria} onChange={(event) => setCategoria(event.target.value)} aria-label="Filtrar por categoria">
            <option value="">Todas as categorias</option>
            {categorias
              .filter((item) => tipo === 'todos' || item.tipo === tipo)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
          </select>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-hairline border-b border-hairline text-center">
        <Total label="Entradas" value={totals.entradas} className="text-signal-success" />
        <Total label="Saídas" value={totals.saidas} className="text-signal-danger" />
        <Total label="Saldo" value={totals.saldo} className={totals.saldo < 0 ? 'text-signal-danger' : 'text-ink'} />
      </dl>

      {loading && !rows.length ? (
        <div className="space-y-2 p-4 sm:p-5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11" />
          ))}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title={rows.length ? 'Nenhum lançamento com esses filtros' : 'Nenhum lançamento neste período'}
          description={rows.length ? 'Limpe a busca ou troque o tipo e a categoria.' : 'Use “Entrada” ou “Saída” no topo para lançar.'}
        />
      ) : (
        <div>
          {groups.map(([day, list]) => {
            const net = list.reduce((sum, row) => sum + (row.tipo === 'receita' ? 1 : -1) * Number(row.valor), 0);
            return (
              <div key={day}>
                <div className="fin-day">
                  <span>{dayHeading(day)}</span>
                  <span className={`tabular-nums ${net < 0 ? 'text-signal-danger' : 'text-ink-muted'}`}>
                    {net >= 0 ? '+' : '−'} {formatCurrency(Math.abs(net))}
                  </span>
                </div>
                <ul className="divide-y divide-hairline">
                  {list.map((row) => {
                    const linked = Boolean(row.conta_pagar_id || row.ordem_servico_id);
                    const income = row.tipo === 'receita';
                    return (
                      <li key={row.id} className="fin-row group">
                        <span className="fin-cat-dot" style={{ background: row.categoria?.cor || 'rgb(var(--ui-text-subtle))' }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{row.descricao}</span>
                          <span className="block truncate text-xs text-ink-subtle">
                            {[row.categoria?.nome ?? 'Sem categoria', row.forma_pagamento ? paymentLabel[row.forma_pagamento] ?? row.forma_pagamento : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <strong className={`shrink-0 text-sm font-semibold tabular-nums ${income ? 'text-signal-success' : 'text-ink'}`}>
                          {income ? '+' : '−'} {formatCurrency(Number(row.valor))}
                        </strong>
                        <span className="fin-row-actions">
                          {linked ? (
                            <button
                              type="button"
                              className="app-icon-button h-8 w-8"
                              title={row.ordem_servico_id ? 'Pagamento de OS: ajuste pela OS' : 'Conta paga: ajuste em Contas a pagar'}
                              aria-label={row.ordem_servico_id ? 'Abrir a OS deste pagamento' : 'Abrir contas a pagar'}
                              onClick={() => navigate(row.ordem_servico_id ? `/ordens/${row.ordem_servico_id}/historico` : '/contas')}
                            >
                              <Link2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <>
                              <button type="button" className="app-icon-button h-8 w-8" aria-label="Editar lançamento" title="Editar" onClick={() => onEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="app-icon-button h-8 w-8 hover:!text-signal-danger"
                                aria-label="Excluir lançamento"
                                title="Excluir"
                                onClick={() => void remove(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {filtered.length > visible && (
            <button
              type="button"
              className="w-full border-t border-hairline px-5 py-3 text-sm font-semibold text-ink-muted transition hover:text-ink"
              onClick={() => setVisible((value) => value + PAGE)}
            >
              Mostrar mais {Math.min(PAGE, filtered.length - visible)} de {filtered.length - visible}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Total({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="dash-eyebrow">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${className}`}>{formatCurrency(value)}</dd>
    </div>
  );
}
