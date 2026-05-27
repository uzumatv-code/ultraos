import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PenTool as Tool, Search, Plus, Trash2, ChevronLeft, ChevronRight, Send, Edit, Printer, Star, FileText, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { formatDate, formatCurrency } from '../utils/formatters';
import { WhatsAppService } from '../utils/whatsapp-service';
import { EvaluationReminderService } from '../utils/evaluation-reminder-service';
import { NFSeService } from '../utils/nfse-service';
import { PrintOrdemModal } from '../components/PrintOrdemModal';
import type { OrdemServico } from '../types/database';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';

export function Ordens() {
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagina, setPagina] = useState(0);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [ordemParaImprimir, setOrdemParaImprimir] = useState<OrdemServico | null>(null);
  const itensPorPagina = 10;

  async function buscarOrdens() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      const query = supabase
        .from('ordens_servico')
        .select(`*,cliente:clientes(*),instrumento:instrumentos(*),marca:marcas(*)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      setOrdens(data || []);
    } catch (error) {
      toast.error('Erro ao carregar ordens de serviço');
    } finally {
      setLoading(false);
    }
  }

  // Carregar todas as ordens do Supabase apenas uma vez
  useEffect(() => {
    buscarOrdens();
  }, []);

  // Filtro global client-side
  const filteredOrdens = useMemo(() => {
    if (!globalFilter) return ordens;
    return ordens.filter(ordem => {
      const values = [
        ordem.numero,
        ordem.cliente?.nome,
        ordem.instrumento?.nome,
        ordem.marca?.nome,
        ordem.modelo,
        ordem.status,
        ordem.observacoes,
        formatDate(ordem.data_previsao)
      ].join(' ').toLowerCase();
      return values.includes(globalFilter.toLowerCase());
    });
  }, [ordens, globalFilter]);

  // Paginação client-side
  const paginatedOrdens = useMemo(() => {
    const start = pagina * itensPorPagina;
    return filteredOrdens.slice(start, start + itensPorPagina);
  }, [filteredOrdens, pagina, itensPorPagina]);

  const totalPaginas = Math.ceil(filteredOrdens.length / itensPorPagina);

  const statusColors = {
    pendente: 'bg-yellow-100 text-yellow-800',
    em_andamento: 'bg-blue-100 text-blue-800',
    concluido: 'bg-green-100 text-green-800',
    cancelado: 'bg-red-100 text-red-800',
    atraso: 'bg-orange-100 text-orange-800'
  };

  const statusLabels = {
    pendente: 'Pendente',
    em_andamento: 'Em Andamento',
    concluido: 'Concluído',
    cancelado: 'Cancelado'
  };

  function getFinancialStatus(ordem: OrdemServico) {
    const total = Number(ordem.valor_total ?? (Number(ordem.valor_servicos || 0) - Number(ordem.desconto || 0)));
    const paid = Number(ordem.valor_pago || 0);
    if (ordem.status === 'cancelado') return { label: 'Cancelado', className: 'bg-gray-100 text-gray-700', remaining: 0 };
    if (paid >= total && total > 0) return { label: 'Pago', className: 'bg-green-100 text-green-800', remaining: 0 };
    if (paid > 0) return { label: 'Parcial', className: 'bg-blue-100 text-blue-800', remaining: Math.max(0, total - paid) };
    return { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800', remaining: Math.max(0, total - paid) };
  }

  function getAuthHeaders() {
    const sessionRaw = localStorage.getItem('mysql-auth-session');
    const token = sessionRaw ? JSON.parse(sessionRaw)?.access_token : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function registrarPagamentoOS(ordem: OrdemServico, valor?: number, observacoes = 'Pagamento registrado pela tela de OS') {
    const response = await fetch(`/api/financeiro/os/${ordem.id}/pagamentos`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        valor,
        forma_pagamento: ordem.forma_pagamento,
        observacoes
      })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error?.message || 'Erro ao registrar pagamento');
    return json.data;
  }

  // Definição das colunas para TanStack Table v8+
  const columns = useMemo<ColumnDef<OrdemServico, any>[]>(() => [
      {
        header: 'OS',
        accessorKey: 'numero',
        cell: info => `#${info.getValue()}`,
        size: 40,
      },
      {
        header: 'Cliente',
        accessorFn: row => row.cliente?.nome || '',
        id: 'cliente',
        size: 120,
      },
      {
        header: 'Instrumento',
        accessorFn: row => `${row.instrumento?.nome || ''} ${row.marca?.nome || ''}\n${row.modelo || ''}`,
        id: 'instrumento',
        size: 120,
        cell: info => (
          <span style={{ whiteSpace: 'pre-line' }}>{info.getValue()}</span>
        ),
      },
      {
        header: 'Previsão',
        accessorKey: 'data_previsao',
        cell: info => formatDate(info.getValue()),
        size: 80,
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: info => (
          <select
            value={info.row.original.status}
            onChange={e => handleChangeStatus(info.row.original, e.target.value as 'pendente' | 'em_andamento' | 'concluido' | 'cancelado')}
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[info.row.original.status]}`}
            style={{ minWidth: 90 }}
          >
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        ),
        size: 90,
      },
      {
        header: 'Financeiro',
        id: 'financeiro',
        cell: info => {
          const financial = getFinancialStatus(info.row.original);
          return (
            <div className="space-y-1">
              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${financial.className}`}>
                {financial.label}
              </span>
              {financial.remaining > 0 && (
                <p className="text-xs text-gray-500">Falta {formatCurrency(financial.remaining)}</p>
              )}
            </div>
          );
        },
        size: 90,
      },
      {
        header: 'Ações',
        id: 'acoes',
        cell: info => (
          <div className="flex items-center justify-end gap-1">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => navigate(`/ordens/editar/${info.row.original.id}`)} className="p-1 text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all duration-200" title="Editar ordem"><Edit className="w-4 h-4" /></motion.button>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => { setOrdemParaImprimir(info.row.original); setShowPrintModal(true); }} className="p-1 text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all duration-200" title="Imprimir ordem"><Printer className="w-4 h-4" /></motion.button>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleWhatsAppShare(info.row.original)} className="p-1 text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all duration-200" title="Enviar mensagem WhatsApp"><Send className="w-4 h-4" /></motion.button>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleRegistrarPagamento(info.row.original)} className="p-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all duration-200" title="Registrar pagamento"><DollarSign className="w-4 h-4" /></motion.button>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleExcluir(info.row.original)} className="p-1 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200" title="Excluir ordem"><Trash2 className="w-4 h-4" /></motion.button>
          </div>
        ),
        size: 90,
      },
    ], [navigate, setOrdemParaImprimir, setShowPrintModal, handleWhatsAppShare, handleExcluir, handleChangeStatus]);

  async function handleExcluir(ordem: OrdemServico) {
    const result = await alerts.confirm({
      title: 'Excluir ordem',
      text: `Deseja excluir a ordem #${ordem.numero}?`,
      icon: 'warning',
      confirmButtonText: 'Excluir'
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from('ordens_servico')
        .delete()
        .eq('id', ordem.id);

      if (error) throw error;

      alerts.success('Ordem de serviço excluída com sucesso!');
      buscarOrdens();
    } catch (error) {
      console.error('Erro ao excluir ordem:', error);
      alerts.error('Erro ao excluir ordem de serviço');
    }
  }

  const table = useReactTable({
    data: paginatedOrdens,
    columns,
    state: {
      globalFilter,
      pagination: { pageIndex: pagina, pageSize: itensPorPagina },
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPaginas,
  });

  async function handleChangeStatus(ordem: OrdemServico, newStatus: 'pendente' | 'em_andamento' | 'concluido' | 'cancelado') {
    try {
      const payload = newStatus === 'concluido'
        ? { status: newStatus, data_entrega: new Date().toISOString().slice(0, 10) }
        : { status: newStatus };

      const { error } = await supabase
        .from('ordens_servico')
        .update(payload)
        .eq('id', ordem.id);

      if (error) throw error;

      if (newStatus === 'concluido') {
        try {
          await registrarPagamentoOS(ordem, undefined, 'Receita lancada automaticamente ao concluir a OS');
        } catch (paymentError: any) {
          const message = paymentError?.message || '';
          if (!message.includes('ja esta quitada')) {
            console.error('Erro ao lancar receita da OS:', paymentError);
            toast.error(`Status atualizado, mas a receita nao foi lancada: ${message}`);
          }
        }
      }

      // If changing to completed status, send WhatsApp message
      if (newStatus === 'concluido' && ordem.cliente?.telefone) {
        try {
          await WhatsAppService.sendCompletionMessage(ordem);
          toast.success('Status atualizado e mensagem enviada!');
        } catch (whatsappError: any) {
          console.error('Erro ao enviar mensagem WhatsApp:', whatsappError);
          toast.success('Status atualizado! (Erro ao enviar WhatsApp)');
        }
      } else {
        toast.success('Status atualizado com sucesso!');
      }

      buscarOrdens();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    }
  }

  async function handleWhatsAppShare(ordem: OrdemServico) {
    if (!ordem.cliente) {
      toast.error('Cliente não encontrado');
      return;
    }

    try {
      await WhatsAppService.sendOrderMessage(ordem);
      toast.success('Mensagem enviada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem: ' + error.message);
    }
  }

  async function handleSendEvaluationRequest(ordem: OrdemServico) {
    if (!ordem.cliente) {
      toast.error('Cliente não encontrado');
      return;
    }

    if (!ordem.cliente.telefone) {
      toast.error('Cliente não possui telefone cadastrado');
      return;
    }

    try {
      // Enviar solicitação via WhatsApp
      const success = await EvaluationReminderService.sendEvaluationForOrder(ordem);
      if (!success) throw new Error('Não foi possível enviar a solicitação');

      // Atualizar a lista local de ordens
      await buscarOrdens();
      
      toast.success('Solicitação de avaliação enviada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao enviar solicitação de avaliação:', error);
      toast.error('Erro ao enviar solicitação de avaliação: ' + error.message);
    }
  }

  async function handleGerarNFSe(ordem: OrdemServico) {
    if (ordem.status !== 'concluido') {
      toast.error('Apenas ordens concluídas podem gerar NFS-e');
      return;
    }

    const result = await alerts.confirm({
      title: 'Gerar NFS-e',
      text: `Deseja gerar a Nota Fiscal de Serviço para a ordem #${ordem.numero}?`,
      icon: 'question'
    });

    if (!result.isConfirmed) return;

    try {
      toast.info('Gerando NFS-e...');
      const notaFiscal = await NFSeService.gerarNFSe(ordem.id);
      
      await alerts.success('NFS-e gerada com sucesso!');
      
      // Navegar para a página de notas fiscais
      navigate(`/notas-fiscais/${notaFiscal.id}`);
    } catch (error: any) {
      console.error('Erro ao gerar NFS-e:', error);
      
      if (error.message.includes('Configure os dados fiscais')) {
        const goToConfig = await alerts.confirm({
          title: 'Configuração necessária',
          text: 'É necessário configurar os dados fiscais da empresa primeiro. Deseja ir para as configurações?',
          icon: 'warning'
        });
        
        if (goToConfig.isConfirmed) {
          navigate('/perfil');
        }
      } else {
        alerts.error(error.message || 'Erro ao gerar NFS-e');
      }
    }
  }

  async function handleRegistrarPagamento(ordem: OrdemServico) {
    const financial = getFinancialStatus(ordem);
    if (financial.remaining <= 0) {
      toast.success('Esta OS ja esta quitada');
      return;
    }

    const result = await alerts.confirm({
      title: 'Registrar pagamento',
      text: `Registrar pagamento restante de ${formatCurrency(financial.remaining)} na OS #${ordem.numero}?`,
      icon: 'question',
      confirmButtonText: 'Registrar'
    });
    if (!result.isConfirmed) return;

    try {
      await registrarPagamentoOS(ordem, financial.remaining);
      toast.success('Pagamento registrado com sucesso!');
      buscarOrdens();
    } catch (error: any) {
      console.error('Erro ao registrar pagamento:', error);
      toast.error(error.message || 'Erro ao registrar pagamento');
    }
  }

  async function handleVisualizarNFSe(ordemId: string) {
    try {
      const notaFiscal = await NFSeService.buscarPorOrdemServico(ordemId);
      if (notaFiscal) {
        navigate(`/notas-fiscais/${notaFiscal.id}`);
      } else {
        toast.error('Nota fiscal não encontrada');
      }
    } catch (error) {
      toast.error('Erro ao buscar nota fiscal');
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-indigo-50/50 via-purple-50/30 to-violet-50/50 dark:from-transparent dark:via-transparent dark:to-transparent">
      <div className="responsive-page">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30"
            >
              <Tool className="w-6 h-6 text-white" />
            </motion.div>
            <h1 className="responsive-heading bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              Ordens de Serviço
            </h1>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row"
          >
            <div className="flex min-w-0 flex-1 flex-wrap gap-3">
              <div className="relative min-w-0 flex-1 sm:min-w-64 lg:w-80">
                <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por qualquer campo..."
                  value={globalFilter}
                  onChange={e => setGlobalFilter(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 dark:border-purple-500/20 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 w-full bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg transition-all duration-200 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/ordens/nova')}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 dark:shadow-indigo-500/20"
              >
                <Plus className="w-5 h-5" />
                <span>Nova Ordem</span>
              </motion.button>
            </div>
          </motion.div>
        </div>
        
        {/* Visualização em Cards para Mobile */}
        <div className="lg:hidden space-y-4">
          {loading ? (
            <div className="glass dark:glass-dark rounded-xl p-12 text-center">
              <div className="flex items-center justify-center space-x-2">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                  className="w-3 h-3 bg-indigo-500 rounded-full"
                />
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                  className="w-3 h-3 bg-indigo-500 rounded-full"
                />
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                  className="w-3 h-3 bg-indigo-500 rounded-full"
                />
              </div>
            </div>
          ) : paginatedOrdens.length === 0 ? (
            <div className="glass dark:glass-dark rounded-xl p-6 text-center text-gray-500 dark:text-gray-400">
              Nenhuma ordem de serviço encontrada
            </div>
          ) : (
            paginatedOrdens.map((ordem) => (
              <motion.div 
                key={ordem.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                className="glass dark:glass-dark rounded-xl shadow-lg dark:shadow-2xl p-4 border border-gray-100 dark:border-purple-500/10"
              >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">OS #{ordem.numero}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{ordem.cliente?.nome}</p>
                  </div>
                  <select
                    value={ordem.status}
                    onChange={e => handleChangeStatus(ordem, e.target.value as any)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[ordem.status]}`}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluido">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                
                <div className="space-y-2 mb-4 text-sm">
                  <p><span className="font-medium text-gray-700 dark:text-gray-300">Instrumento:</span> <span className="text-gray-600 dark:text-gray-400">{ordem.instrumento?.nome} - {ordem.marca?.nome}</span></p>
                  <p><span className="font-medium text-gray-700 dark:text-gray-300">Entrada:</span> <span className="text-gray-600 dark:text-gray-400">{formatDate(ordem.data_entrada)}</span></p>
                  <p><span className="font-medium text-gray-700 dark:text-gray-300">Previsão:</span> <span className="text-gray-600 dark:text-gray-400">{formatDate(ordem.data_previsao)}</span></p>
                  <p><span className="font-medium text-gray-700 dark:text-gray-300">Valor:</span> <span className="text-gray-600 dark:text-gray-400">{formatCurrency(ordem.valor_servicos - (ordem.desconto || 0))}</span></p>
                </div>
                
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate(`/ordens/editar/${ordem.id}`)} 
                    className="flex-1 p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all"
                    title="Editar"
                  >
                    <Edit className="w-5 h-5 mx-auto" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setOrdemParaImprimir(ordem); setShowPrintModal(true); }} 
                    className="flex-1 p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all"
                    title="Imprimir"
                  >
                    <Printer className="w-5 h-5 mx-auto" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleWhatsAppShare(ordem)} 
                    className="flex-1 p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"
                    title="WhatsApp"
                  >
                    <Send className="w-5 h-5 mx-auto" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSendEvaluationRequest(ordem)} 
                    className={`flex-1 p-2 rounded-lg transition-all ${
                      ordem.status === 'concluido' && !ordem.solicita_avaliacao
                        ? 'text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20' 
                        : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }`}
                    title={
                      ordem.solicita_avaliacao 
                        ? 'Avaliação já solicitada' 
                        : ordem.status === 'concluido' 
                          ? 'Solicitar avaliação' 
                          : 'Disponível apenas para ordens concluídas'
                    }
                    disabled={ordem.status !== 'concluido' || ordem.solicita_avaliacao === true}
                  >
                    <Star className="w-5 h-5 mx-auto" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => ordem.status === 'concluido' && handleGerarNFSe(ordem)} 
                    className={`flex-1 p-2 rounded-lg transition-all ${
                      ordem.status === 'concluido' 
                        ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20' 
                        : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }`}
                    title="NFS-e"
                    disabled={ordem.status !== 'concluido'}
                  >
                    <FileText className="w-5 h-5 mx-auto" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleExcluir(ordem)} 
                    className="flex-1 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                    title="Excluir"
                  >
                    <Trash2 className="w-5 h-5 mx-auto" />
                  </motion.button>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Visualização em Tabela para Desktop */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden lg:block glass dark:glass-dark rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-100 dark:border-purple-500/10"
        >
          <div className="responsive-table-wrap">
            <table className="w-full table-fixed min-w-[700px]">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 dark:from-indigo-900/10 dark:to-violet-900/10">
                    {headerGroup.headers.map(header => (
                      <th key={header.id} className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white/50 dark:bg-gray-900/20">
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                          className="w-2 h-2 bg-indigo-500 rounded-full"
                        />
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                          className="w-2 h-2 bg-indigo-500 rounded-full"
                        />
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                          className="w-2 h-2 bg-indigo-500 rounded-full"
                        />
                      </div>
                    </td>
                  </tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr><td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">Nenhuma ordem de serviço encontrada</td></tr>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <motion.tr 
                      key={row.id} 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors duration-200"
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 max-w-[180px] overflow-hidden text-ellipsis">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação com TanStack Table */}
          <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 dark:from-indigo-900/10 dark:to-violet-900/10 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Mostrando {paginatedOrdens.length} de {filteredOrdens.length} resultados
            </p>
            <div className="flex items-center space-x-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setPagina(p => Math.max(0, p - 1))} 
                disabled={pagina === 0} 
                className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 disabled:hover:bg-transparent transition-colors duration-200 text-gray-700 dark:text-gray-300"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Página {pagina + 1} de {totalPaginas}
              </span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} 
                disabled={pagina >= totalPaginas - 1} 
                className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 disabled:hover:bg-transparent transition-colors duration-200 text-gray-700 dark:text-gray-300"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
      
      {ordemParaImprimir && (
        <PrintOrdemModal
          isOpen={showPrintModal}
          onClose={() => {
            setShowPrintModal(false);
            setOrdemParaImprimir(null);
          }}
          ordem={ordemParaImprimir}
        />
      )}
    </div>
  );
}
