/**
 * Vocabulário visual de status do domínio.
 *
 * Um único lugar decide cor e rótulo de cada estado — operacional e
 * financeiro — para que a mesma OS nunca apareça "amarela" numa tela e
 * "laranja" em outra.
 */

import { Badge, type Tone } from './index';
import type { OrdemServico } from '../../types/database';
import { todayLocalDate } from '../../utils/dates';

export type OrderStatus = OrdemServico['status'];
export type FinancialStatus = 'pendente' | 'parcial' | 'pago' | 'cancelado';

const orderStatusMap: Record<OrderStatus, { label: string; tone: Tone }> = {
  pendente: { label: 'Pendente', tone: 'warning' },
  em_andamento: { label: 'Em andamento', tone: 'info' },
  concluido: { label: 'Concluído', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
  atraso: { label: 'Em atraso', tone: 'danger' },
};

const financialStatusMap: Record<FinancialStatus, { label: string; tone: Tone }> = {
  pendente: { label: 'A receber', tone: 'warning' },
  parcial: { label: 'Parcial', tone: 'info' },
  pago: { label: 'Quitado', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

export const orderStatusOptions = (Object.keys(orderStatusMap) as OrderStatus[]).map((value) => ({
  value,
  label: orderStatusMap[value].label,
}));

export function orderStatusLabel(status: OrderStatus) {
  return orderStatusMap[status]?.label ?? status;
}

export function orderStatusTone(status: OrderStatus): Tone {
  return orderStatusMap[status]?.tone ?? 'neutral';
}

/**
 * Status exibido: uma OS marcada como `pendente` cuja previsão já passou
 * é, para o operador, uma OS atrasada. A regra vive aqui e não em cada tela.
 */
export function effectiveOrderStatus(ordem: Pick<OrdemServico, 'status' | 'data_previsao'>): OrderStatus {
  if (ordem.status === 'atraso') return 'atraso';
  if (ordem.status !== 'pendente' && ordem.status !== 'em_andamento') return ordem.status;
  const due = String(ordem.data_previsao || '').slice(0, 10);
  return due && due < todayLocalDate() ? 'atraso' : ordem.status;
}

export function OrderStatusBadge({ ordem }: { ordem: Pick<OrdemServico, 'status' | 'data_previsao'> }) {
  const status = effectiveOrderStatus(ordem);
  const { label, tone } = orderStatusMap[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/** Situação financeira derivada dos valores da OS, com saldo em aberto. */
export function orderFinancialState(ordem: Pick<OrdemServico, 'status' | 'valor_total' | 'valor_servicos' | 'desconto' | 'valor_pago' | 'status_financeiro'>) {
  const total = Number(ordem.valor_total ?? Number(ordem.valor_servicos || 0) - Number(ordem.desconto || 0));
  const paid = Number(ordem.valor_pago || 0);
  const remaining = Math.max(0, Number((total - paid).toFixed(2)));

  let status: FinancialStatus;
  if (ordem.status === 'cancelado') status = 'cancelado';
  else if (total <= 0 || remaining <= 0) status = 'pago';
  else if (paid > 0) status = 'parcial';
  else status = 'pendente';

  return { status, total, paid, remaining, ...financialStatusMap[status] };
}

export function FinancialStatusBadge({ status }: { status: FinancialStatus }) {
  const { label, tone } = financialStatusMap[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const payableStatusMap: Record<string, { label: string; tone: Tone }> = {
  pendente: { label: 'Pendente', tone: 'warning' },
  atrasado: { label: 'Vencida', tone: 'danger' },
  pago: { label: 'Paga', tone: 'success' },
  cancelado: { label: 'Cancelada', tone: 'neutral' },
};

export function PayableStatusBadge({ status, dueDate }: { status?: string; dueDate?: string }) {
  const due = String(dueDate || '').slice(0, 10);
  const overdue = (status === 'pendente' || status === 'atrasado') && due && due < todayLocalDate();
  const key = overdue ? 'atrasado' : status || 'pendente';
  const { label, tone } = payableStatusMap[key] ?? payableStatusMap.pendente;
  return <Badge tone={tone}>{label}</Badge>;
}
