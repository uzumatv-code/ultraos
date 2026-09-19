/**
 * Ordens de serviço.
 *
 * Mudanças estruturais em relação à versão anterior:
 *  - filtro, ordenação e paginação acontecem no servidor (`/api/ordens/lista`);
 *    a tela não baixa mais a base inteira a cada visita;
 *  - o estado de busca/filtros vive na URL, então a lista é compartilhável e
 *    sobrevive ao "voltar" do navegador;
 *  - o status deixou de ser um <select> disfarçado de etiqueta: mudar status é
 *    uma ação explícita, e cancelar pede confirmação;
 *  - as ações de linha ficam num menu, no lugar de seis ícones concorrendo
 *    pela atenção;
 *  - a visão "bancada" (kanban) mostra a carga real de trabalho por etapa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, DollarSign, Edit3,
  FileText, History, LayoutGrid, MoreHorizontal, Printer, Search,
  Send, Star, Trash2, Wrench, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { apiRequest } from '../lib/api-client';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { formatCurrency, formatDateOnly } from '../utils/formatters';
import { todayLocalDate } from '../utils/dates';
import { WhatsAppService } from '../utils/whatsapp-service';
import { EvaluationReminderService } from '../utils/evaluation-reminder-service';
import { NFSeService } from '../utils/nfse-service';
import { PrintOrdemModal } from '../components/PrintOrdemModal';
import type { OrdemServico } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { useUrlState } from '../hooks/useUrlState';
import { Badge, EmptyState, Panel, SearchField, Segmented, Skeleton, Table, Td, UIButton } from '../components/ui';
import {
  effectiveOrderStatus, FinancialStatusBadge, OrderStatusBadge, orderFinancialState,
  orderStatusLabel, type OrderStatus,
} from '../components/ui/status';

type ListResponse = {
  rows: OrdemServico[];
  page: number;
  page_size: number;
  total: number;
  facets: { total: number; pendente: number; em_andamento: number; concluido: number; cancelado: number; atraso: number };
};

const defaults = {
  q: '',
  status: '',
  prazo: '',
  financeiro: '',
  sort: 'recentes',
  page: '1',
  view: 'lista',
};

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
];

const prazoOptions = [
  { value: '', label: 'Qualquer prazo' },
  { value: 'hoje', label: 'Entrega hoje' },
  { value: 'semana', label: 'Próximos 7 dias' },
  { value: 'atraso', label: 'Em atraso' },
];

const financeiroOptions = [
  { value: '', label: 'Todo o financeiro' },
  { value: 'aberto', label: 'Com saldo em aberto' },
  { value: 'pendente', label: 'Sem pagamento' },
  { value: 'parcial', label: 'Pagamento parcial' },
  { value: 'pago', label: 'Quitadas' },
];

const sortOptions = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'prazo', label: 'Prazo mais próximo' },
  { value: 'numero', label: 'Número da OS' },
  { value: 'valor', label: 'Maior valor' },
];

const boardColumns: Array<{ status: OrderStatus; label: string }> = [
  { status: 'atraso', label: 'Em atraso' },
  { status: 'pendente', label: 'Aguardando' },
  { status: 'em_andamento', label: 'Na bancada' },
  { status: 'concluido', label: 'Concluídas' },
];

export function Ordens() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { state, setState, reset, isFiltered } = useUrlState(defaults);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(state.q);
  const [printOrder, setPrintOrder] = useState<OrdemServico | null>(null);

  const isBoard = state.view === 'bancada';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: state.q,
        status: isBoard ? '' : state.status,
        prazo: state.prazo,
        financeiro: state.financeiro,
        sort: isBoard ? 'prazo' : state.sort,
        page: isBoard ? '1' : state.page,
        pageSize: isBoard ? '100' : '20',
      });
      setData(await apiRequest<ListResponse>(`/api/ordens/lista?${params.toString()}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar ordens de serviço');
    } finally {
      setLoading(false);
    }
  }, [isBoard, state.financeiro, state.page, state.prazo, state.q, state.sort, state.status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Busca com atraso para não disparar uma consulta por tecla digitada.
  useEffect(() => {
    if (searchDraft === state.q) return;
    const timer = window.setTimeout(() => setState({ q: searchDraft, page: '1' }), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, setState, state.q]);

  async function changeStatus(ordem: OrdemServico, next: OrderStatus) {
    if (next === ordem.status) return;

    if (next === 'cancelado') {
      const confirmed = await alerts.confirm({
        title: 'Cancelar ordem',
        text: `A OS #${ordem.numero} será marcada como cancelada. Confirma?`,
        icon: 'warning',
        confirmButtonText: 'Cancelar OS',
      });
      if (!confirmed.isConfirmed) return;
    }

    try {
      const payload = next === 'concluido' ? { status: next, data_entrega: todayLocalDate() } : { status: next };
      const { error } = await supabase.from('ordens_servico').update(payload).eq('id', ordem.id);
      if (error) throw error;

      if (next === 'concluido' && ordem.cliente?.telefone) {
        try {
          await WhatsAppService.sendCompletionMessage(ordem);
          toast.success('Status atualizado e cliente avisado no WhatsApp.');
        } catch {
          toast.success('Status atualizado. O aviso no WhatsApp não saiu.');
        }
      } else {
        toast.success(`OS #${ordem.numero} agora está como ${orderStatusLabel(next).toLowerCase()}.`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar status');
    }
  }

  async function registerPayment(ordem: OrdemServico) {
    const financial = orderFinancialState(ordem);
    if (financial.remaining <= 0) {
      toast.success('Esta OS já está quitada.');
      return;
    }

    const result = await alerts.payment({ remaining: financial.remaining, defaultMethod: ordem.forma_pagamento });
    if (!result.isConfirmed || !result.value) return;

    try {
      await apiRequest(`/api/financeiro/os/${ordem.id}/pagamentos`, {
        method: 'POST',
        body: JSON.stringify({
          valor: result.value.value,
          forma_pagamento: result.value.method,
          observacoes: 'Pagamento registrado pela lista de ordens',
        }),
      });
      toast.success('Pagamento registrado.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar pagamento');
    }
  }

  async function sendWhatsApp(ordem: OrdemServico) {
    if (!ordem.cliente) {
      toast.error('Cliente não encontrado.');
      return;
    }
    try {
      await WhatsAppService.sendOrderMessage(ordem);
      toast.success('Mensagem enviada.');
    } catch (error) {
      toast.error(`Erro ao enviar mensagem: ${error instanceof Error ? error.message : ''}`);
    }
  }

  async function requestEvaluation(ordem: OrdemServico) {
    if (!ordem.cliente?.telefone) {
      toast.error('Cliente sem telefone cadastrado.');
      return;
    }
    try {
      const ok = await EvaluationReminderService.sendEvaluationForOrder(ordem);
      if (!ok) throw new Error('Não foi possível enviar a solicitação');
      toast.success('Solicitação de avaliação enviada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao solicitar avaliação');
    }
  }

  async function generateInvoice(ordem: OrdemServico) {
    if (ordem.status !== 'concluido') {
      toast.error('Apenas ordens concluídas geram NFS-e.');
      return;
    }
    const confirmed = await alerts.confirm({
      title: 'Gerar NFS-e',
      text: `Emitir a nota fiscal de serviço da OS #${ordem.numero}?`,
      icon: 'question',
    });
    if (!confirmed.isConfirmed) return;

    try {
      const nota = await NFSeService.gerarNFSe(ordem.id);
      await alerts.success('NFS-e gerada com sucesso.');
      navigate(`/notas-fiscais/${nota.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar NFS-e';
      if (message.includes('Configure os dados fiscais')) {
        const goToConfig = await alerts.confirm({
          title: 'Configuração necessária',
          text: 'Os dados fiscais da empresa ainda não foram preenchidos. Abrir as configurações?',
          icon: 'warning',
        });
        if (goToConfig.isConfirmed) navigate('/configuracoes');
        return;
      }
      alerts.error(message);
    }
  }

  async function removeOrder(ordem: OrdemServico) {
    const confirmed = await alerts.confirm({
      title: 'Excluir ordem',
      text: `A OS #${ordem.numero} e seu histórico serão removidos. Esta ação não pode ser desfeita.`,
      icon: 'warning',
      confirmButtonText: 'Excluir',
    });
    if (!confirmed.isConfirmed) return;

    try {
      const { error } = await supabase.from('ordens_servico').delete().eq('id', ordem.id);
      if (error) throw error;
      await alerts.success('Ordem excluída.');
      await load();
    } catch (error) {
      alerts.error(error instanceof Error ? error.message : 'Erro ao excluir ordem');
    }
  }

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const currentPage = Number(state.page) || 1;

  const boardGroups = useMemo(() => {
    const groups = new Map<OrderStatus, OrdemServico[]>();
    boardColumns.forEach((column) => groups.set(column.status, []));
    rows.forEach((ordem) => {
      const status = effectiveOrderStatus(ordem);
      if (groups.has(status)) groups.get(status)!.push(ordem);
    });
    return groups;
  }, [rows]);

  return (
    <main className="ui-page space-y-4">
      <header className="ui-page-header">
        <div className="min-w-0">
          <p className="ui-page-eyebrow">Operação</p>
          <h1 className="ui-page-title">Ordens de serviço</h1>
          <p className="ui-page-description">
            {data
              ? `${data.facets.total} ordens no total · ${data.facets.atraso} em atraso · ${data.facets.em_andamento} na bancada`
              : 'Carregando indicadores…'}
          </p>
        </div>
        <div className="ui-page-actions">
          <Segmented
            value={state.view}
            onChange={(view) => setState({ view, page: '1' })}
            options={[
              { value: 'lista', label: 'Lista' },
              { value: 'bancada', label: 'Bancada' },
            ]}
          />
          <UIButton variant="primary" size="sm" icon={LayoutGrid} onClick={() => navigate('/ordens/nova')}>
            Nova ordem
          </UIButton>
        </div>
      </header>

      {/* Filtros */}
      <div className="ui-toolbar">
        <SearchField
          value={searchDraft}
          onChange={setSearchDraft}
          icon={Search}
          placeholder="Número, cliente, telefone, marca ou modelo…"
          className="min-w-56 flex-1"
        />

        {!isBoard && (
          <select className="ui-field w-auto min-w-36" value={state.status} onChange={(event) => setState({ status: event.target.value, page: '1' })} aria-label="Filtrar por status">
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}

        <select className="ui-field w-auto min-w-36" value={state.prazo} onChange={(event) => setState({ prazo: event.target.value, page: '1' })} aria-label="Filtrar por prazo">
          {prazoOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {can('financeiro.read') && (
          <select className="ui-field w-auto min-w-40" value={state.financeiro} onChange={(event) => setState({ financeiro: event.target.value, page: '1' })} aria-label="Filtrar por situação financeira">
            {financeiroOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}

        {!isBoard && (
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <select className="ui-field w-auto min-w-36" value={state.sort} onChange={(event) => setState({ sort: event.target.value, page: '1' })} aria-label="Ordenar">
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}

        {isFiltered && (
          <UIButton
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => {
              setSearchDraft('');
              reset();
            }}
          >
            Limpar
          </UIButton>
        )}
      </div>

      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : isBoard ? (
        <BoardView
          columns={boardColumns}
          groups={boardGroups}
          canSeeFinance={can('financeiro.read')}
          onOpen={(ordem) => navigate(`/ordens/${ordem.id}/historico`)}
          truncated={Boolean(data && data.total > data.rows.length)}
        />
      ) : rows.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={Wrench}
            title={isFiltered ? 'Nenhuma ordem para estes filtros' : 'Nenhuma ordem cadastrada'}
            description={isFiltered ? 'Ajuste ou limpe os filtros para ver outros resultados.' : 'Abra a primeira ordem de serviço para começar.'}
            action={
              isFiltered ? (
                <UIButton size="sm" onClick={() => { setSearchDraft(''); reset(); }}>Limpar filtros</UIButton>
              ) : (
                <UIButton variant="primary" size="sm" onClick={() => navigate('/ordens/nova')}>Nova ordem</UIButton>
              )
            }
          />
        </Panel>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden lg:block">
            <Panel flush>
              <Table>
                <thead>
                  <tr>
                    <th className="w-20">OS</th>
                    <th>Cliente</th>
                    <th>Equipamento</th>
                    <th className="w-28">Previsão</th>
                    <th className="w-36">Situação</th>
                    {can('financeiro.read') && <th className="w-40">Financeiro</th>}
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ordem) => {
                    const financial = orderFinancialState(ordem);
                    const overdue = effectiveOrderStatus(ordem) === 'atraso';
                    return (
                      <tr key={ordem.id}>
                        <Td>
                          <button
                            type="button"
                            onClick={() => navigate(`/ordens/${ordem.id}/historico`)}
                            className="font-semibold tabular-nums text-brand-soft hover:underline"
                          >
                            #{ordem.numero}
                          </button>
                        </Td>
                        <Td>
                          <p className="truncate font-medium text-ink">{ordem.cliente?.nome}</p>
                          <p className="truncate text-xs text-ink-subtle">{ordem.cliente?.telefone}</p>
                        </Td>
                        <Td>
                          <p className="truncate text-ink">{[ordem.instrumento?.nome, ordem.marca?.nome].filter(Boolean).join(' · ')}</p>
                          {ordem.modelo && <p className="truncate text-xs text-ink-subtle">{ordem.modelo}</p>}
                        </Td>
                        <Td>
                          <span className={`tabular-nums ${overdue ? 'font-semibold text-signal-danger' : 'text-ink-muted'}`}>
                            {formatDateOnly(ordem.data_previsao)}
                          </span>
                        </Td>
                        <Td>
                          <StatusControl ordem={ordem} onChange={changeStatus} canCancel={can('ordens.cancel')} />
                        </Td>
                        {can('financeiro.read') && (
                          <Td>
                            <div className="flex flex-col items-start gap-1">
                              <FinancialStatusBadge status={financial.status} />
                              <span className="text-xs tabular-nums text-ink-subtle">
                                {financial.remaining > 0 ? `Falta ${formatCurrency(financial.remaining)}` : formatCurrency(financial.total)}
                              </span>
                            </div>
                          </Td>
                        )}
                        <Td>
                          <RowMenu
                            ordem={ordem}
                            can={can}
                            onHistory={() => navigate(`/ordens/${ordem.id}/historico`)}
                            onEdit={() => navigate(`/ordens/editar/${ordem.id}`)}
                            onPrint={() => setPrintOrder(ordem)}
                            onWhatsApp={() => void sendWhatsApp(ordem)}
                            onEvaluation={() => void requestEvaluation(ordem)}
                            onInvoice={() => void generateInvoice(ordem)}
                            onPayment={() => void registerPayment(ordem)}
                            onDelete={() => void removeOrder(ordem)}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Panel>
          </div>

          {/* Mobile */}
          <div className="space-y-3 lg:hidden">
            {rows.map((ordem) => {
              const financial = orderFinancialState(ordem);
              return (
                <article key={ordem.id} className="ui-record">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        OS #{ordem.numero} · {ordem.cliente?.nome}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {[ordem.instrumento?.nome, ordem.marca?.nome, ordem.modelo].filter(Boolean).join(' ')}
                      </p>
                    </div>
                    <OrderStatusBadge ordem={ordem} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <span>
                      Previsão <strong className="tabular-nums text-ink">{formatDateOnly(ordem.data_previsao)}</strong>
                    </span>
                    {can('financeiro.read') && (
                      <span className="flex items-center gap-1.5">
                        <FinancialStatusBadge status={financial.status} />
                        {financial.remaining > 0 && <span className="tabular-nums">Falta {formatCurrency(financial.remaining)}</span>}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
                    <UIButton size="sm" icon={History} onClick={() => navigate(`/ordens/${ordem.id}/historico`)}>
                      Histórico
                    </UIButton>
                    <UIButton size="sm" icon={Edit3} onClick={() => navigate(`/ordens/editar/${ordem.id}`)}>
                      Editar
                    </UIButton>
                    <UIButton size="sm" icon={Send} onClick={() => void sendWhatsApp(ordem)}>
                      WhatsApp
                    </UIButton>
                    {can('financeiro.write') && financial.remaining > 0 && (
                      <UIButton size="sm" variant="success" icon={DollarSign} onClick={() => void registerPayment(ordem)}>
                        Receber
                      </UIButton>
                    )}
                    <RowMenu
                      ordem={ordem}
                      can={can}
                      onHistory={() => navigate(`/ordens/${ordem.id}/historico`)}
                      onEdit={() => navigate(`/ordens/editar/${ordem.id}`)}
                      onPrint={() => setPrintOrder(ordem)}
                      onWhatsApp={() => void sendWhatsApp(ordem)}
                      onEvaluation={() => void requestEvaluation(ordem)}
                      onInvoice={() => void generateInvoice(ordem)}
                      onPayment={() => void registerPayment(ordem)}
                      onDelete={() => void removeOrder(ordem)}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          {/* Paginação */}
          {data && data.total > data.page_size && (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-ink-muted">
                {(currentPage - 1) * data.page_size + 1}–{Math.min(currentPage * data.page_size, data.total)} de{' '}
                <strong className="tabular-nums text-ink">{data.total}</strong>
              </p>
              <div className="flex items-center gap-2">
                <UIButton size="sm" icon={ChevronLeft} disabled={currentPage <= 1} onClick={() => setState({ page: String(currentPage - 1) })} aria-label="Página anterior" />
                <span className="text-xs tabular-nums text-ink-muted">
                  {currentPage} / {totalPages}
                </span>
                <UIButton size="sm" icon={ChevronRight} disabled={currentPage >= totalPages} onClick={() => setState({ page: String(currentPage + 1) })} aria-label="Próxima página" />
              </div>
            </div>
          )}
        </>
      )}

      {printOrder && <PrintOrdemModal isOpen onClose={() => setPrintOrder(null)} ordem={printOrder} />}
    </main>
  );
}

/* ------------------------------------------------------------ Status */

function StatusControl({
  ordem,
  onChange,
  canCancel,
}: {
  ordem: OrdemServico;
  onChange: (ordem: OrdemServico, status: OrderStatus) => void;
  canCancel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  const options: OrderStatus[] = ['pendente', 'em_andamento', 'concluido', ...(canCancel ? (['cancelado'] as OrderStatus[]) : [])];

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-left" aria-haspopup="menu" aria-expanded={open}>
        <OrderStatusBadge ordem={ordem} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-1.5 w-44 overflow-hidden rounded-md border border-hairline bg-surface-raised py-1 shadow-glass-lg">
          <p className="px-3 py-1.5 text-2xs uppercase tracking-[0.12em] text-ink-subtle">Mudar situação</p>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChange(ordem, option);
              }}
              disabled={option === ordem.status}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:opacity-40"
            >
              {orderStatusLabel(option)}
              {option === ordem.status && <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Menu de linha */

function RowMenu({
  ordem,
  can,
  onHistory,
  onEdit,
  onPrint,
  onWhatsApp,
  onEvaluation,
  onInvoice,
  onPayment,
  onDelete,
}: {
  ordem: OrdemServico;
  can: (permission: Parameters<ReturnType<typeof useAuth>['can']>[0]) => boolean;
  onHistory: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onWhatsApp: () => void;
  onEvaluation: () => void;
  onInvoice: () => void;
  onPayment: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  const items = [
    { label: 'Histórico e aditivos', icon: History, action: onHistory, show: true },
    { label: 'Editar ordem', icon: Edit3, action: onEdit, show: true },
    { label: 'Imprimir', icon: Printer, action: onPrint, show: true },
    { label: 'Enviar no WhatsApp', icon: Send, action: onWhatsApp, show: true },
    {
      label: ordem.solicita_avaliacao ? 'Avaliação já solicitada' : 'Solicitar avaliação',
      icon: Star,
      action: onEvaluation,
      show: true,
      disabled: ordem.status !== 'concluido' || ordem.solicita_avaliacao === true,
    },
    { label: 'Gerar NFS-e', icon: FileText, action: onInvoice, show: can('nfse.manage'), disabled: ordem.status !== 'concluido' },
    { label: 'Registrar pagamento', icon: DollarSign, action: onPayment, show: can('financeiro.write') },
    { label: 'Excluir', icon: Trash2, action: onDelete, show: can('ordens.delete'), danger: true },
  ].filter((item) => item.show);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="ui-btn ui-btn-ghost ui-btn-icon-sm"
        aria-label={`Ações da OS ${ordem.numero}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-md border border-hairline bg-surface-raised py-1 shadow-glass-lg">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:opacity-40 ${
                  item.danger
                    ? 'text-signal-danger hover:bg-signal-danger/10'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Bancada */

function BoardView({
  columns,
  groups,
  canSeeFinance,
  onOpen,
  truncated,
}: {
  columns: Array<{ status: OrderStatus; label: string }>;
  groups: Map<OrderStatus, OrdemServico[]>;
  canSeeFinance: boolean;
  onOpen: (ordem: OrdemServico) => void;
  truncated: boolean;
}) {
  return (
    <div className="space-y-3">
      {truncated && (
        <p className="text-xs text-ink-muted">
          Mostrando as 100 ordens mais próximas do prazo. Use os filtros para recortar o período.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => {
          const items = groups.get(column.status) ?? [];
          return (
            <section key={column.status} className="ui-panel ui-panel-flush flex flex-col">
              <header className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{column.label}</span>
                  <Badge tone={column.status === 'atraso' ? 'danger' : column.status === 'concluido' ? 'success' : 'neutral'}>
                    {items.length}
                  </Badge>
                </span>
              </header>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-ink-subtle">Nada nesta etapa.</p>
                ) : (
                  items.map((ordem) => {
                    const financial = orderFinancialState(ordem);
                    return (
                      <button
                        key={ordem.id}
                        type="button"
                        onClick={() => onOpen(ordem)}
                        className="w-full rounded-md border border-hairline bg-surface p-3 text-left transition hover:border-brand/45 hover:bg-brand/5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-bold tabular-nums text-brand-soft">#{ordem.numero}</span>
                          <span className={`text-xs tabular-nums ${column.status === 'atraso' ? 'text-signal-danger' : 'text-ink-subtle'}`}>
                            {formatDateOnly(ordem.data_previsao)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-ink">{ordem.cliente?.nome}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {[ordem.instrumento?.nome, ordem.marca?.nome, ordem.modelo].filter(Boolean).join(' ')}
                        </p>
                        {canSeeFinance && financial.remaining > 0 && (
                          <p className="mt-2 text-xs tabular-nums text-signal-warning">Falta {formatCurrency(financial.remaining)}</p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Utilitário */

function useOutsideClick(ref: React.RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) handler();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handler();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [handler, ref]);
}
