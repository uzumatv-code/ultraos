/**
 * Importar extrato bancário (OFX ou CSV).
 *
 * O servidor lê o arquivo e devolve a prévia com a decisão de cada movimento:
 * novo, já está no caixa (pagamento de OS, conta paga…), importado antes,
 * transferência entre contas do dono ou caixinha. Só os novos vêm marcados.
 * A pessoa revisa, ajusta categorias (a mudança vale para todos os movimentos
 * com a mesma descrição) e confirma. Nada é gravado antes disso.
 */

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, FileUp, Search, X } from 'lucide-react';
import { apiRequest } from '../../lib/api-client';
import { formatCurrency } from '../../utils/formatters';
import { formatLocalDate } from '../../utils/dates';
import { toast } from '../ToastCustom';
import { UIButton } from '../ui';
import { DashboardModal } from '../dashboard/OrderQuickView';

type Situacao = 'novo' | 'ja_lancado' | 'ja_importado' | 'conta_propria' | 'aplicacao';

type Linha = {
  chave: string;
  data: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  descricao: string;
  original: string;
  situacao: Situacao;
  correspondencia: { id: string; descricao: string; data: string } | null;
  categoria_id?: string;
  categoria_nome?: string;
  importar: boolean;
};

type Analise = {
  banco: string | null;
  formato: 'OFX' | 'CSV';
  periodo: { inicio: string; fim: string };
  avisos: string[];
  resumo: Partial<Record<Situacao, number>>;
  categorias: Array<{ id: string; nome: string; tipo: 'receita' | 'despesa'; cor: string }>;
  linhas: Linha[];
};

const MAX_BYTES = 5 * 1024 * 1024;

const situacaoInfo: Record<Situacao, { label: string; hint: string }> = {
  novo: { label: 'Novos', hint: 'Ainda não estão no caixa' },
  ja_lancado: { label: 'Já no caixa', hint: 'Mesmo valor já lançado (OS, conta paga ou manual) até 3 dias de diferença' },
  ja_importado: { label: 'Importados antes', hint: 'Vieram de um extrato já importado' },
  conta_propria: { label: 'Entre suas contas', hint: 'Transferências entre contas suas: não são receita nem despesa' },
  aplicacao: { label: 'Caixinha', hint: 'Aplicações e resgates: o dinheiro só mudou de lugar' },
};

const order: Situacao[] = ['novo', 'ja_lancado', 'conta_propria', 'aplicacao', 'ja_importado'];

/** OFX antigos vêm em Windows-1252; o resto em UTF-8. */
async function readStatement(file: File) {
  const buffer = await file.arrayBuffer();
  const head = new TextDecoder('ascii').decode(buffer.slice(0, 600));
  const latin = /CHARSET:\s*1252|ENCODING:\s*USASCII/i.test(head);
  let text = new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(buffer);
  if (!latin && text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
  return text;
}

function categoryValue(line: Linha) {
  return line.categoria_id ? `id:${line.categoria_id}` : line.categoria_nome ? `novo:${line.categoria_nome}` : '';
}

export function ImportarExtratoModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [filtro, setFiltro] = useState<Situacao | 'selecionados'>('novo');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  function reset() {
    setAnalise(null);
    setLinhas([]);
    setFileName('');
    setBusca('');
    setFiltro('novo');
  }

  function close() {
    if (saving) return;
    reset();
    onClose();
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Arquivo grande demais. Exporte um período menor (até 5 MB).');
      return;
    }
    setLoading(true);
    setFileName(file.name);
    try {
      const conteudo = await readStatement(file);
      const result = await apiRequest<Analise>('/api/financeiro/extrato/analisar', { method: 'POST', body: JSON.stringify({ nome: file.name, conteudo }) });
      setAnalise(result);
      setLinhas(result.linhas);
      setFiltro(result.resumo.novo ? 'novo' : order.find((key) => result.resumo[key]) ?? 'novo');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler o extrato');
      setFileName('');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  const visible = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return linhas.filter(
      (line) =>
        (filtro === 'selecionados' ? line.importar : line.situacao === filtro) &&
        (!term || `${line.descricao} ${line.original}`.toLowerCase().includes(term)),
    );
  }, [linhas, filtro, busca]);

  const selected = linhas.filter((line) => line.importar);
  const totals = selected.reduce(
    (acc, line) => {
      if (line.tipo === 'receita') acc.entradas += line.valor;
      else acc.saidas += line.valor;
      return acc;
    },
    { entradas: 0, saidas: 0 },
  );

  const toggle = (chave: string) => setLinhas((current) => current.map((line) => (line.chave === chave ? { ...line, importar: !line.importar } : line)));

  const selectable = visible.filter((line) => line.situacao !== 'ja_importado');
  const allVisibleSelected = selectable.length > 0 && selectable.every((line) => line.importar);
  function toggleVisible() {
    const keys = new Set(selectable.map((line) => line.chave));
    setLinhas((current) => current.map((line) => (keys.has(line.chave) ? { ...line, importar: !allVisibleSelected } : line)));
  }

  /** A categoria escolhida vale para todos os movimentos com a mesma descrição e o mesmo sentido. */
  function setCategory(target: Linha, value: string) {
    const patch = value.startsWith('id:') ? { categoria_id: value.slice(3), categoria_nome: undefined } : value.startsWith('novo:') ? { categoria_id: undefined, categoria_nome: value.slice(5) } : { categoria_id: undefined, categoria_nome: undefined };
    const same = (line: Linha) => line.descricao === target.descricao && line.tipo === target.tipo;
    const count = linhas.filter(same).length;
    setLinhas((current) => current.map((line) => (same(line) ? { ...line, ...patch } : line)));
    if (count > 1) toast.info(`Categoria aplicada a ${count} movimentos de "${target.descricao}".`);
  }

  async function importar() {
    if (!selected.length) return;
    setSaving(true);
    try {
      const result = await apiRequest<{ importadas: number; ignoradas: number }>('/api/financeiro/extrato/importar', {
        method: 'POST',
        body: JSON.stringify({
          nome: fileName,
          linhas: selected.map((line) => ({ chave: line.chave, data: line.data, valor: line.valor, tipo: line.tipo, descricao: line.descricao, categoria_id: line.categoria_id, categoria_nome: line.categoria_nome })),
        }),
      });
      toast.success(`${result.importadas} movimento(s) lançados no caixa${result.ignoradas ? ` · ${result.ignoradas} já estavam importados` : ''}.`);
      onSuccess();
      reset();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar');
    } finally {
      setSaving(false);
    }
  }

  // Categorias sugeridas que ainda não existem aparecem como "nova" no seletor.
  const newNames = useMemo(() => {
    const names = { receita: new Set<string>(), despesa: new Set<string>() };
    linhas.forEach((line) => line.categoria_nome && names[line.tipo].add(line.categoria_nome));
    return names;
  }, [linhas]);

  return (
    <DashboardModal open={isOpen} onClose={close} labelledBy="extrato-title" size="xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex min-w-0 items-start gap-2">
          {analise && (
            <button type="button" className="app-icon-button -ml-2 h-9 w-9" onClick={reset} aria-label="Escolher outro arquivo" disabled={saving}>
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="dash-eyebrow">Importar extrato</p>
            <h2 id="extrato-title" className="mt-0.5 truncate font-display text-lg font-semibold text-ink">
              {analise
                ? `${analise.banco ? `${analise.banco} · ` : ''}${formatLocalDate(analise.periodo.inicio)} a ${formatLocalDate(analise.periodo.fim)}`
                : 'Traga o extrato do banco para o caixa'}
            </h2>
            {analise && (
              <p className="truncate text-xs text-ink-muted">
                {fileName} · {analise.formato} · {linhas.length} movimentos
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Fechar" className="app-icon-button shrink-0">
          <X className="h-5 w-5" />
        </button>
      </header>

      {!analise ? (
        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${dragging ? 'border-brand bg-brand/10' : 'border-hairline-strong hover:border-brand/60 hover:bg-brand/5'}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="ui-ai-mark h-12 w-12" aria-hidden>
              <FileUp />
            </span>
            <span className="font-display text-base font-semibold text-ink">{loading ? 'Lendo o extrato…' : 'Arraste o arquivo aqui ou clique para escolher'}</span>
            <span className="max-w-md text-sm text-ink-muted">OFX ou CSV exportado pelo banco. Nada é lançado antes de você revisar.</span>
            <input ref={inputRef} type="file" accept=".ofx,.csv,.txt" className="sr-only" disabled={loading} onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          <ul className="grid gap-3 text-sm text-ink-muted sm:grid-cols-3">
            <li className="rounded-lg border border-hairline p-3">
              <strong className="block text-ink">Sem duplicar</strong>
              Pix que você já registrou numa OS e contas já pagas são reconhecidos e ficam de fora.
            </li>
            <li className="rounded-lg border border-hairline p-3">
              <strong className="block text-ink">Pode reimportar</strong>
              Mandar o mesmo extrato de novo não lança nada em dobro.
            </li>
            <li className="rounded-lg border border-hairline p-3">
              <strong className="block text-ink">Aprende suas categorias</strong>
              Corrija uma vez e as próximas importações já vêm certas.
            </li>
          </ul>
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-3 border-b border-hairline px-5 py-3">
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Filtrar por situação">
              {order
                .filter((key) => analise.resumo[key])
                .map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filtro === key}
                    title={situacaoInfo[key].hint}
                    onClick={() => setFiltro(key)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${filtro === key ? 'border-brand bg-brand/15 text-ink' : 'border-hairline text-ink-muted hover:text-ink'}`}
                  >
                    {situacaoInfo[key].label} <span className="tabular-nums text-ink-subtle">{analise.resumo[key]}</span>
                  </button>
                ))}
              <button
                type="button"
                role="tab"
                aria-selected={filtro === 'selecionados'}
                onClick={() => setFiltro('selecionados')}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${filtro === 'selecionados' ? 'border-brand bg-brand/15 text-ink' : 'border-hairline text-ink-muted hover:text-ink'}`}
              >
                Marcados <span className="tabular-nums text-ink-subtle">{selected.length}</span>
              </button>
            </div>
            <p className="text-xs text-ink-muted">{filtro === 'selecionados' ? 'Tudo o que vai entrar no caixa.' : situacaoInfo[filtro].hint}.</p>
            <label className="ui-search block">
              <Search aria-hidden />
              <input className="ui-field h-9" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar no extrato" aria-label="Buscar no extrato" />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-subtle">Nada aqui com esse filtro.</p>
            ) : (
              <>
                <label className="fin-day cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!selectable.length} className="h-4 w-4 accent-[rgb(var(--ui-brand))]" />
                    Marcar todos desta lista ({selectable.length})
                  </span>
                </label>
                <ul className="divide-y divide-hairline">
                  {visible.map((line) => {
                    const locked = line.situacao === 'ja_importado';
                    const income = line.tipo === 'receita';
                    const options = analise.categorias.filter((item) => item.tipo === line.tipo);
                    return (
                      <li key={line.chave} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2.5 sm:flex-nowrap ${line.importar ? '' : 'opacity-60'}`}>
                        <input
                          type="checkbox"
                          checked={line.importar}
                          disabled={locked}
                          onChange={() => toggle(line.chave)}
                          aria-label={`Importar ${line.descricao}`}
                          className="h-4 w-4 shrink-0 accent-[rgb(var(--ui-brand))]"
                        />
                        <span className="w-12 shrink-0 text-xs tabular-nums text-ink-subtle">{formatLocalDate(line.data).slice(0, 5)}</span>
                        <span className="min-w-0 flex-1 basis-40">
                          <span className="block truncate text-sm font-medium text-ink" title={line.original}>
                            {line.descricao}
                          </span>
                          {line.correspondencia && (
                            <span className="block truncate text-xs text-signal-warning">
                              Já no caixa: {line.correspondencia.descricao} ({formatLocalDate(line.correspondencia.data).slice(0, 5)})
                            </span>
                          )}
                        </span>
                        <select
                          className="ui-field h-8 w-full py-0 text-xs sm:w-48"
                          value={categoryValue(line)}
                          disabled={locked}
                          onChange={(event) => setCategory(line, event.target.value)}
                          aria-label={`Categoria de ${line.descricao}`}
                        >
                          <option value="">Sem categoria</option>
                          {[...newNames[line.tipo]].map((name) => (
                            <option key={`novo-${name}`} value={`novo:${name}`}>
                              {name} (nova)
                            </option>
                          ))}
                          {options.map((item) => (
                            <option key={item.id} value={`id:${item.id}`}>
                              {item.nome}
                            </option>
                          ))}
                        </select>
                        <strong className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${income ? 'text-signal-success' : 'text-ink'}`}>
                          {income ? '+' : '−'} {formatCurrency(line.valor)}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t border-hairline px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-muted">
              <strong className="text-ink">{selected.length}</strong> para lançar · <span className="tabular-nums text-signal-success">+{formatCurrency(totals.entradas)}</span> ·{' '}
              <span className="tabular-nums">−{formatCurrency(totals.saidas)}</span>
            </p>
            <div className="flex gap-2">
              <UIButton variant="ghost" onClick={close} disabled={saving}>
                Cancelar
              </UIButton>
              <UIButton variant="primary" onClick={() => void importar()} loading={saving} disabled={!selected.length}>
                Lançar {selected.length} no caixa
              </UIButton>
            </div>
          </footer>
        </>
      )}
    </DashboardModal>
  );
}
