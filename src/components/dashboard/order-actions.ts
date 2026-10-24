/**
 * Ações rápidas sobre uma OS usadas pelo painel (agenda e detalhe rápido).
 *
 * Seguem as mesmas regras da tela de Ordens: reagendar exige confirmação,
 * nunca vai para o passado e fica registrado em `agenda_logs`; mudar o status
 * avisa o cliente pelo WhatsApp com o modelo correspondente.
 */

import type { OrdemServico } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { alerts } from '../../utils/alerts';
import { formatLocalDate, toDateOnly, todayLocalDate } from '../../utils/dates';
import { WhatsAppService } from '../../utils/whatsapp-service';
import { toast } from '../ToastCustom';

export type QuickStatus = 'em_andamento' | 'atraso' | 'concluido';

export function equipmentLine(order: Pick<OrdemServico, 'instrumento' | 'marca' | 'modelo'>) {
  return [order.instrumento?.nome, order.marca?.nome, order.modelo].filter(Boolean).join(' · ');
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return fallback;
}

/** Retorna `true` quando algo pode ter mudado e a tela deve recarregar. */
export async function rescheduleOrder(order: OrdemServico, targetDate: string): Promise<boolean> {
  const current = toDateOnly(order.data_previsao) || todayLocalDate();
  if (!targetDate || current === targetDate) return false;

  if (targetDate < todayLocalDate()) {
    toast.error('Não é possível mover uma ordem para uma data passada.');
    return false;
  }

  const confirm = await alerts.confirm({
    title: 'Confirmar reagendamento',
    text: `Mover OS #${order.numero} para ${formatLocalDate(targetDate)}?`,
    icon: 'question',
    confirmButtonText: 'Sim, reagendar',
    cancelButtonText: 'Cancelar',
  });
  if (!confirm.isConfirmed) return false;

  try {
    const { error } = await supabase.from('ordens_servico').update({ data_previsao: targetDate }).eq('id', order.id);
    if (error) throw error;

    const { error: logError } = await supabase.from('agenda_logs').insert({
      ordem_servico_id: order.id,
      data_anterior: current,
      data_nova: targetDate,
      acao: 'reagendamento',
    });
    if (logError) throw logError;

    toast.success(`OS #${order.numero} reagendada para ${formatLocalDate(targetDate)}.`);
  } catch (error) {
    toast.error(errorMessage(error, 'Erro ao atualizar a data de entrega'));
  }
  return true;
}

const statusNotice: Record<QuickStatus, { send: (order: OrdemServico) => Promise<boolean>; done: string }> = {
  em_andamento: { send: (order) => WhatsAppService.sendProgressMessage(order), done: 'Serviço iniciado e cliente avisado pelo WhatsApp.' },
  atraso: { send: (order) => WhatsAppService.sendDelayMessage(order), done: 'Contratempo registrado e cliente avisado pelo WhatsApp.' },
  concluido: { send: (order) => WhatsAppService.sendCompletionMessage(order), done: 'OS finalizada e cliente avisado pelo WhatsApp.' },
};

export async function changeOrderStatus(order: OrdemServico, next: QuickStatus): Promise<boolean> {
  if (order.status === next) return false;
  try {
    const payload = next === 'concluido' ? { status: next, data_entrega: todayLocalDate() } : { status: next };
    const { error } = await supabase.from('ordens_servico').update(payload).eq('id', order.id);
    if (error) throw error;
  } catch (error) {
    toast.error(errorMessage(error, 'Erro ao atualizar status da ordem'));
    return false;
  }

  try {
    await statusNotice[next].send(order);
    toast.success(statusNotice[next].done);
  } catch (error) {
    toast.success(`Status atualizado, mas o WhatsApp não saiu: ${errorMessage(error, 'erro desconhecido')}`);
  }
  return true;
}
