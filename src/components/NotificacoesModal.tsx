import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, PenTool as Tool, Send, DollarSign, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { alerts } from '../utils/alerts';
import { openWhatsApp, formatCurrency } from '../utils/formatters';
import { toast } from './ToastCustom';
import type { OrdemServico, ContaPagar } from '../types/database';

interface NotificacoesModalProps {
  ordens: OrdemServico[];
  contas: ContaPagar[];
  onClose: () => void;
}

export function NotificacoesModal({ ordens, contas, onClose }: NotificacoesModalProps) {
  const today = new Date().toISOString().split('T')[0];

  // Filter orders for today
  const ordensHoje = ordens.filter(ordem => 
    ordem.data_previsao.split('T')[0] === today &&
    ordem.status !== 'concluido' &&
    ordem.status !== 'cancelado'
  ).sort((a, b) => 
    new Date(a.data_previsao).getTime() - new Date(b.data_previsao).getTime()
  );

  // Filter bills due today
  const contasHoje = contas.filter(conta =>
    conta.data_vencimento.split('T')[0] === today &&
    conta.status !== 'pago' &&
    conta.status !== 'cancelado'
  ).sort((a, b) =>
    new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()
  );

  // Filter orders that are 6 months old
  const ordensSeisMeses = ordens.filter(ordem => {
    const dataEntrada = new Date(ordem.data_entrada);
    const hoje = new Date();
    const diffMeses = (hoje.getFullYear() - dataEntrada.getFullYear()) * 12 + 
                     (hoje.getMonth() - dataEntrada.getMonth());
    return diffMeses >= 6 && ordem.status === 'concluido';
  });

  async function handleMaintenanceNotification(ordem: OrdemServico) {
    if (!ordem.cliente?.telefone) {
      toast.error('Cliente sem telefone cadastrado');
      return;
    }

    const message = `Olá ${ordem.cliente.nome}, aqui é o Samuel Luthier.

Seu ${ordem.instrumento?.nome} ${ordem.marca?.nome} ${ordem.modelo} está a 6 meses sem manutenção, ideal é fazer a hidratação e higienização com a troca de cordas, recomendamos trazer a nós para evitar que o instrumento comece a ter problemas mais graves.`;

    try {
      // Update order status to 'em_andamento'
      const { error } = await supabase
        .from('ordens_servico')
        .update({ status: 'em_andamento' })
        .eq('id', ordem.id);

      if (error) throw error;

      // Open WhatsApp with the message
      openWhatsApp(ordem.cliente.telefone, message);
      onClose();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status da ordem');
    }
  }

  async function handleOrderCompletion(ordem: OrdemServico) {
    if (!ordem.cliente?.telefone) {
      toast.error('Cliente sem telefone cadastrado');
      return;
    }

    const message = `Ola ${ordem.cliente.nome} seu ${ordem.instrumento?.nome} ficou pronto, Retirar entre 10h as 13h 14h as 18h segunda a sabado.`;

    try {
      // Update order status to 'concluido'
      const { error } = await supabase
        .from('ordens_servico')
        .update({ status: 'concluido' })
        .eq('id', ordem.id);

      if (error) throw error;

      // Send WhatsApp message
      openWhatsApp(ordem.cliente.telefone, message);
      onClose();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status da ordem');
    }
  }

  async function handleBillPayment(conta: ContaPagar) {
    try {
      // Create transaction
      const { data: transacao, error: transacaoError } = await supabase
        .from('transacoes_financeiras')
        .insert([{
          descricao: conta.descricao,
          valor: conta.valor,
          tipo: 'despesa',
          data: new Date().toISOString(),
          categoria_id: conta.categoria_id,
          conta_pagar_id: conta.id,
          user_id: conta.user_id
        }])
        .select()
        .single();

      if (transacaoError) throw transacaoError;

      // Update bill status
      const { error: contaError } = await supabase
        .from('contas_pagar')
        .update({
          status: 'pago',
          data_pagamento: new Date().toISOString(),
          transacao_id: transacao.id
        })
        .eq('id', conta.id);

      if (contaError) throw contaError;

      toast.success('Conta marcada como paga!');
      onClose();
    } catch (error) {
      console.error('Erro ao pagar conta:', error);
      toast.error('Erro ao pagar conta');
    }
  }

  function handleOrdemClick(ordem: OrdemServico) {
    alerts.orderDetails(ordem);
  }

  return (
    <div className="w-96 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden">
      {/* Today's Orders */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Ordens do Dia</h3>
          <div className="flex items-center space-x-1 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>{new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {ordensHoje.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            Nenhuma ordem agendada para hoje
          </div>
        ) : (
          ordensHoje.map((ordem) => (
            <motion.div
              key={ordem.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => handleOrdemClick(ordem)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">
                    {ordem.cliente?.nome}
                  </p>
                  <p className="text-sm text-gray-600">
                    {ordem.instrumento?.nome} {ordem.modelo}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>
                        {new Date(ordem.data_previsao).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOrderCompletion(ordem);
                      }}
                      className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-all duration-200"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Today's Bills */}
      {contasHoje.length > 0 && (
        <>
          <div className="p-4 border-t border-b border-gray-100 bg-red-50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-red-800">Contas a Pagar Hoje</h3>
              <DollarSign className="w-4 h-4 text-red-600" />
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {contasHoje.map((conta) => (
              <motion.div
                key={conta.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 hover:bg-red-50 cursor-pointer transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-800">
                      {conta.descricao}
                    </p>
                    <span className="text-red-600 font-medium">
                      {formatCurrency(conta.valor)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${conta.categoria?.cor}20`,
                          color: conta.categoria?.cor
                        }}
                      >
                        {conta.categoria?.nome}
                      </span>
                      {conta.recorrente && (
                        <span className="text-xs text-gray-500 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {conta.periodicidade}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleBillPayment(conta)}
                      className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-all duration-200"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* 6-Month Maintenance Notifications */}
      {ordensSeisMeses.length > 0 && (
        <>
          <div className="p-4 border-t border-b border-gray-100 bg-amber-50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-amber-800">Manutenção Recomendada</h3>
              <Tool className="w-4 h-4 text-amber-600" />
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {ordensSeisMeses.map((ordem) => (
              <motion.div
                key={ordem.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 hover:bg-amber-50 cursor-pointer transition-colors"
                onClick={() => handleMaintenanceNotification(ordem)}
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {ordem.cliente?.nome}
                  </p>
                  <p className="text-sm text-gray-600">
                    {ordem.instrumento?.nome} {ordem.modelo}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ 6 meses sem manutenção
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}