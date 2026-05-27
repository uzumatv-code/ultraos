import { useState, useEffect } from 'react';
import { FileText, Search, Eye, X, Download, CheckCircle, XCircle, Clock, AlertCircle, Pencil, Trash2, FileDown, Printer, Settings, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { formatDate, formatCurrency } from '../utils/formatters';
import { NFSeService } from '../utils/nfse-service';
import { DANFEService, type DANFEModelo } from '../utils/danfe-service';
import type { NotaFiscal } from '../types/database';
import { motion, AnimatePresence } from 'framer-motion';
import { NFSeModal } from '../components/NFSeModal';
import ConfiguracaoFiscalModal from '../components/ConfiguracaoFiscalModal';

export function NotasFiscais() {
  const navigate = useNavigate();
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedNota, setSelectedNota] = useState<NotaFiscal | null>(null);
  const [showXMLModal, setShowXMLModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [notaParaEditar, setNotaParaEditar] = useState<NotaFiscal | null>(null);
  const [showConfigFiscalModal, setShowConfigFiscalModal] = useState(false);
  const [showModeloModal, setShowModeloModal] = useState(false);
  const [notaParaDANFE, setNotaParaDANFE] = useState<NotaFiscal | null>(null);
  const [tipoAcaoDANFE, setTipoAcaoDANFE] = useState<'visualizar' | 'baixar'>('visualizar');

  useEffect(() => {
    buscarNotas();
  }, []);

  async function buscarNotas() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const notas = await NFSeService.listarNFSes(user.id);
      setNotas(notas);
    } catch (error) {
      toast.error('Erro ao carregar notas fiscais');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const filteredNotas = notas.filter(nota => {
    if (!globalFilter) return true;
    const searchText = globalFilter.toLowerCase();
    return (
      nota.numero_nfse?.toLowerCase().includes(searchText) ||
      nota.numero_rps.toLowerCase().includes(searchText) ||
      nota.discriminacao.toLowerCase().includes(searchText) ||
      nota.status.toLowerCase().includes(searchText)
    );
  });

  const statusConfig = {
    rascunho: {
      label: 'Rascunho',
      color: 'bg-gray-100 text-gray-800',
      icon: Clock,
    },
    enviado: {
      label: 'Enviado',
      color: 'bg-blue-100 text-blue-800',
      icon: Clock,
    },
    processando: {
      label: 'Processando',
      color: 'bg-yellow-100 text-yellow-800',
      icon: Clock,
    },
    autorizado: {
      label: 'Autorizado',
      color: 'bg-green-100 text-green-800',
      icon: CheckCircle,
    },
    rejeitado: {
      label: 'Rejeitado',
      color: 'bg-red-100 text-red-800',
      icon: XCircle,
    },
    cancelado: {
      label: 'Cancelado',
      color: 'bg-red-100 text-red-800',
      icon: XCircle,
    },
  };

  const handleCancelarNFSe = async (nota: NotaFiscal) => {
    if (nota.status !== 'autorizado') {
      toast.error('Apenas notas autorizadas podem ser canceladas');
      return;
    }

    const result = await alerts.confirm({
      title: 'Cancelar NFS-e',
      text: 'Tem certeza que deseja cancelar esta NFS-e? Esta ação não pode ser desfeita.',
      icon: 'warning',
      confirmButtonText: 'Sim, cancelar',
      cancelButtonText: 'Não',
    });

    if (!result.isConfirmed) return;

    try {
      const motivo = 'Cancelamento solicitado pelo usuário';
      await NFSeService.cancelarNFSe(nota.id, motivo);
      alerts.success('NFS-e cancelada com sucesso!');
      buscarNotas();
    } catch (error: any) {
      console.error('Erro ao cancelar NFS-e:', error);
      alerts.error(error.message || 'Erro ao cancelar NFS-e');
    }
  };

  const handleDownloadXML = (nota: NotaFiscal) => {
    if (!nota.xml_envio) {
      toast.error('XML não disponível');
      return;
    }

    const blob = new Blob([nota.xml_envio], { type: 'text/xml' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFSe-RPS-${nota.numero_rps}-${nota.serie_rps}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success('XML baixado com sucesso!');
  };

  const handleViewXML = (nota: NotaFiscal) => {
    setSelectedNota(nota);
    setShowXMLModal(true);
  };

  const handleGerarDANFE = (nota: NotaFiscal) => {
    setNotaParaDANFE(nota);
    setTipoAcaoDANFE('visualizar');
    setShowModeloModal(true);
  };

  const handleBaixarDANFE = (nota: NotaFiscal) => {
    setNotaParaDANFE(nota);
    setTipoAcaoDANFE('baixar');
    setShowModeloModal(true);
  };

  const executarGeracaoDANFE = async (modelo: DANFEModelo) => {
    if (!notaParaDANFE) return;

    try {
      toast.info(`Gerando DANFE ${modelo}...`);
      
      // Buscar dados completos
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: empresa } = await supabase
        .from('empresa_fiscal')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Buscar ordem de serviço para pegar o cliente
      const { data: ordemServico } = await supabase
        .from('ordens_servico')
        .select('cliente_id')
        .eq('id', notaParaDANFE.ordem_servico_id)
        .single();

      const { data: cliente } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', ordemServico?.cliente_id)
        .single();

      if (!empresa) throw new Error('Dados fiscais não configurados');
      if (!cliente) throw new Error('Cliente não encontrado');

      if (tipoAcaoDANFE === 'visualizar') {
        await DANFEService.visualizarDANFE({ nota: notaParaDANFE, empresa, cliente, modelo });
        toast.success('DANFE gerado com sucesso!');
      } else {
        await DANFEService.gerarEBaixar({ nota: notaParaDANFE, empresa, cliente, modelo });
        toast.success('DANFE baixado com sucesso!');
      }
      
      setShowModeloModal(false);
    } catch (error: any) {
      console.error('Erro ao gerar DANFE:', error);
      toast.error(error.message || 'Erro ao gerar DANFE');
    }
  };

  const handleEnviarNFSe = async (nota: NotaFiscal) => {
    if (nota.status !== 'rascunho') {
      toast.error('Apenas notas em rascunho podem ser enviadas');
      return;
    }

    const result = await alerts.confirm({
      title: 'Enviar NFS-e',
      text: 'Deseja transmitir esta NFS-e para a prefeitura? Após autorizada, não poderá mais ser editada.',
      icon: 'info',
      confirmButtonText: 'Sim, enviar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      toast.info('Enviando NFS-e para a prefeitura...');
      await NFSeService.enviarNFSe(nota.id);
      alerts.success('NFS-e enviada com sucesso! Aguarde o processamento pela prefeitura.');
      buscarNotas();
    } catch (error: any) {
      console.error('Erro ao enviar NFS-e:', error);
      alerts.error(error.message || 'Erro ao enviar NFS-e');
    }
  };

  const handleEditarNota = (nota: NotaFiscal) => {
    // Apenas rascunhos podem ser editados
    if (nota.status !== 'rascunho') {
      toast.error('Apenas notas em rascunho podem ser editadas');
      return;
    }
    
    // Abrir modal de edição
    setNotaParaEditar(nota);
    setShowEditModal(true);
  };

  const handleExcluirNota = async (nota: NotaFiscal) => {
    // Não permitir excluir notas autorizadas
    if (nota.status === 'autorizado') {
      toast.error('Notas autorizadas não podem ser excluídas. Use a opção de cancelamento.');
      return;
    }

    const result = await alerts.confirm({
      title: 'Excluir NFS-e',
      text: `Tem certeza que deseja excluir a NFS-e RPS ${nota.numero_rps}? Esta ação não pode ser desfeita.`,
      icon: 'warning',
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Não',
    });

    if (!result.isConfirmed) return;

    try {
      // Verificar se o usuário tem permissão
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('notas_fiscais')
        .delete()
        .eq('id', nota.id)
        .eq('user_id', user.id); // Garantir que apenas o dono pode excluir

      if (error) {
        console.error('Erro do Supabase:', error);
        throw new Error(error.message || 'Erro ao excluir nota fiscal');
      }

      toast.success('NFS-e excluída com sucesso!');
      buscarNotas();
    } catch (error: any) {
      console.error('Erro ao excluir NFS-e:', error);
      toast.error(error.message || 'Erro ao excluir NFS-e. Verifique as permissões no banco de dados.');
    }
  };

  // Estatísticas
  const stats = {
    total: notas.length,
    autorizadas: notas.filter(n => n.status === 'autorizado').length,
    rascunho: notas.filter(n => n.status === 'rascunho').length,
    rejeitadas: notas.filter(n => n.status === 'rejeitado').length,
    valorTotal: notas
      .filter(n => n.status === 'autorizado')
      .reduce((sum, n) => sum + Number(n.valor_servicos), 0),
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-900 dark:via-blue-900/20 dark:to-purple-900/20">
      <div className="responsive-page">
        {/* Header Animado */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="responsive-heading bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
                  Notas Fiscais (NFS-e)
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Gerencie suas notas fiscais eletrônicas
                </p>
              </div>
            </div>
            
            {/* Botão de Configuração Fiscal */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowConfigFiscalModal(true)}
              className="flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 dark:from-blue-500 dark:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20 font-medium sm:w-auto"
              title="Configurar Dados Fiscais"
            >
              <Building2 className="w-5 h-5" />
              <span className="hidden sm:inline">Dados Fiscais</span>
              <Settings className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all group"
            >
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">📊 Total</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 dark:from-gray-200 dark:to-gray-100 bg-clip-text text-transparent">{stats.total}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-green-50/80 dark:bg-green-900/20 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 border border-green-100 dark:border-green-700/30 hover:shadow-xl transition-all group"
            >
              <p className="text-sm font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">✅ Autorizadas</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">{stats.autorizadas}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all group"
            >
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">📝 Rascunho</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-600 to-gray-800 dark:from-gray-300 dark:to-gray-100 bg-clip-text text-transparent">{stats.rascunho}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 border border-red-100 dark:border-red-700/30 hover:shadow-xl transition-all group"
            >
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">❌ Rejeitadas</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-red-600 to-rose-600 dark:from-red-400 dark:to-rose-400 bg-clip-text text-transparent">{stats.rejeitadas}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-blue-50/80 dark:bg-blue-900/20 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 border border-blue-100 dark:border-blue-700/30 hover:shadow-xl transition-all group"
            >
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">💰 Valor</p>
              <p className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">{formatCurrency(stats.valorTotal)}</p>
            </motion.div>
          </div>

          {/* Busca */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="relative"
          >
            <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por número, RPS, descrição..."
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-sm text-gray-900 dark:text-gray-100 transition-all"
            />
          </motion.div>
        </motion.div>

        {/* Lista de Notas */}
        <div className="space-y-4">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-xl"
            >
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Carregando notas fiscais...</p>
              </div>
            </motion.div>
          ) : filteredNotas.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-xl"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center">
                  <FileText className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg">Nenhuma nota fiscal encontrada</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Gere uma NFS-e a partir de uma ordem de serviço concluída
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/ordens')}
                  className="mt-4 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 dark:from-blue-500 dark:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20 font-medium"
                >
                  Ir para Ordens de Serviço
                </motion.button>
              </div>
            </motion.div>
          ) : (
            filteredNotas.map((nota, index) => {
              const StatusIcon = statusConfig[nota.status].icon;
              return (
                <motion.div
                  key={nota.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-100 dark:border-gray-700 hover:shadow-2xl dark:hover:shadow-blue-500/10 transition-all group"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {nota.numero_nfse ? (
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            📄 NFS-e Nº {nota.numero_nfse}
                          </h3>
                        ) : (
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            📝 RPS Nº {nota.numero_rps} - Série {nota.serie_rps}
                          </h3>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${statusConfig[nota.status].color} dark:brightness-125`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[nota.status].label}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-200">📅 Data Emissão:</span>{' '}
                          {formatDate(nota.data_emissao)}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-200">📆 Competência:</span>{' '}
                          {formatDate(nota.competencia)}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-200">💰 Valor:</span>{' '}
                          <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(nota.valor_servicos)}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-200">🧾 ISS:</span>{' '}
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{formatCurrency(nota.valor_iss)} ({nota.aliquota}%)</span>
                        </div>
                        {nota.codigo_verificacao && (
                          <div className="md:col-span-2">
                            <span className="font-semibold text-gray-900 dark:text-gray-200">🔑 Código:</span>{' '}
                            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{nota.codigo_verificacao}</span>
                          </div>
                        )}
                      </div>

                      {nota.discriminacao && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">📝 Discriminação:</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {nota.discriminacao}
                          </p>
                        </div>
                      )}

                      {nota.mensagem_retorno && (
                        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-700/30 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-yellow-700 dark:text-yellow-400">⚠️ Mensagem:</p>
                            <p className="text-sm text-yellow-600 dark:text-yellow-400">{nota.mensagem_retorno}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap md:flex-col">
                      {/* Enviar - apenas rascunhos */}
                      {nota.status === 'rascunho' && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleEnviarNFSe(nota)}
                          className="flex-1 md:flex-none px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 dark:from-green-500 dark:to-emerald-500 rounded-xl transition-all flex items-center justify-center gap-2 font-medium shadow-lg shadow-green-500/20"
                          title="Enviar NFS-e para a Prefeitura"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">Enviar</span>
                        </motion.button>
                      )}

                      {/* Editar - apenas rascunhos */}
                      {nota.status === 'rascunho' && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleEditarNota(nota)}
                          className="flex-1 md:flex-none px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-700"
                          title="Editar NFS-e"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="text-sm font-medium">Editar</span>
                        </motion.button>
                      )}

                      {/* Excluir - não permite autorizadas */}
                      {nota.status !== 'autorizado' && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleExcluirNota(nota)}
                          className="flex-1 md:flex-none px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all flex items-center justify-center gap-2 border border-red-200 dark:border-red-700"
                          title="Excluir NFS-e"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-sm font-medium">Excluir</span>
                        </motion.button>
                      )}

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleViewXML(nota)}
                        className="flex-1 md:flex-none px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all flex items-center justify-center gap-2"
                        title="Visualizar XML"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm font-medium">XML</span>
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDownloadXML(nota)}
                        className="flex-1 md:flex-none px-4 py-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-xl transition-all flex items-center justify-center gap-2"
                        title="Baixar XML"
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-sm font-medium">↓ XML</span>
                      </motion.button>

                      {/* DANFE - Visualizar */}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleGerarDANFE(nota)}
                        className="flex-1 md:flex-none px-4 py-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-xl transition-all flex items-center justify-center gap-2"
                        title="Visualizar DANFE (PDF)"
                      >
                        <Printer className="w-4 h-4" />
                        <span className="text-sm font-medium">DANFE</span>
                      </motion.button>

                      {/* DANFE - Baixar */}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleBaixarDANFE(nota)}
                        className="flex-1 md:flex-none px-4 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all flex items-center justify-center gap-2"
                        title="Baixar DANFE (PDF)"
                      >
                        <FileDown className="w-4 h-4" />
                        <span className="text-sm font-medium">↓ PDF</span>
                      </motion.button>

                      {/* Cancelar - apenas autorizadas */}
                      {nota.status === 'autorizado' && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleCancelarNFSe(nota)}
                          className="flex-1 md:flex-none px-4 py-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-xl transition-all flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-700"
                          title="Cancelar NFS-e"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm font-medium">Cancelar</span>
                        </motion.button>
                      )}

                      {nota.url_nota && (
                        <motion.a
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          href={nota.url_nota}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 md:flex-none px-4 py-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-xl transition-all flex items-center justify-center gap-2"
                          title="Ver na Prefeitura"
                        >
                          <FileText className="w-4 h-4" />
                          <span className="text-sm font-medium">Ver Online</span>
                        </motion.a>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal de visualização de XML */}
      <AnimatePresence>
        {showXMLModal && selectedNota && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowXMLModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-2 md:inset-10 z-50 flex items-center justify-center"
            >
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-1rem)] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b">
                  <h2 className="text-xl font-bold text-gray-900">
                    XML - RPS {selectedNota.numero_rps}
                  </h2>
                  <button
                    onClick={() => setShowXMLModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-6">
                  <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto">
                    <code>{selectedNota.xml_envio}</code>
                  </pre>
                </div>
                <div className="p-4 sm:p-6 border-t flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => handleDownloadXML(selectedNota)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Baixar XML
                  </button>
                  <button
                    onClick={() => setShowXMLModal(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal de Edição */}
      {showEditModal && notaParaEditar && (
        <NFSeModal
          nota={notaParaEditar}
          onClose={() => {
            setShowEditModal(false);
            setNotaParaEditar(null);
          }}
          onSuccess={() => {
            buscarNotas();
          }}
        />
      )}

      {/* Modal de Configuração Fiscal */}
      <ConfiguracaoFiscalModal
        isOpen={showConfigFiscalModal}
        onClose={() => setShowConfigFiscalModal(false)}
        onSave={() => {
          setShowConfigFiscalModal(false);
          toast.success('Dados fiscais configurados com sucesso!');
        }}
      />

      {/* Modal de Seleção de Modelo DANFE */}
      <AnimatePresence>
        {showModeloModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowModeloModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[calc(100dvh-1rem)] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                        🎨 Escolha o Modelo do DANFE
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Selecione o layout de impressão da nota fiscal
                      </p>
                    </div>
                    <button
                      onClick={() => setShowModeloModal(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <X className="w-6 h-6 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                  {/* Modelo Clássico */}
                  <motion.button
                    whileHover={{ scale: 1.03, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => executarGeracaoDANFE('classico')}
                    className="group relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all shadow-lg hover:shadow-xl"
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-500 to-gray-700 rounded-xl flex items-center justify-center shadow-lg">
                        <FileText className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                        📋 Clássico
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Modelo oficial do Governo do DF
                      </p>
                      <ul className="text-xs text-left text-gray-600 dark:text-gray-400 space-y-1">
                        <li>✓ Layout padrão SEFAZ</li>
                        <li>✓ Todas as informações fiscais</li>
                        <li>✓ QR Code de verificação</li>
                        <li>✓ Ideal para órgãos oficiais</li>
                      </ul>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/10 group-hover:to-purple-500/10 rounded-xl transition-all" />
                  </motion.button>

                  {/* Modelo Moderno */}
                  <motion.button
                    whileHover={{ scale: 1.03, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => executarGeracaoDANFE('moderno')}
                    className="group relative bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-700 hover:border-blue-500 dark:hover:border-blue-400 transition-all shadow-lg hover:shadow-xl"
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Printer className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                        ✨ Moderno
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Design colorido e atrativo
                      </p>
                      <ul className="text-xs text-left text-gray-600 dark:text-gray-400 space-y-1">
                        <li>✓ Cores e destaques visuais</li>
                        <li>✓ Valores em boxes coloridos</li>
                        <li>✓ Fácil leitura e organizado</li>
                        <li>✓ Ideal para clientes</li>
                      </ul>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-indigo-500/0 group-hover:from-blue-500/10 group-hover:to-indigo-500/10 rounded-xl transition-all" />
                  </motion.button>

                  {/* Modelo Minimalista */}
                  <motion.button
                    whileHover={{ scale: 1.03, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => executarGeracaoDANFE('minimalista')}
                    className="group relative bg-gradient-to-br from-slate-50 to-zinc-50 dark:from-slate-900/20 dark:to-zinc-900/20 rounded-xl p-6 border-2 border-slate-200 dark:border-slate-700 hover:border-slate-500 dark:hover:border-slate-400 transition-all shadow-lg hover:shadow-xl"
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-slate-500 to-zinc-700 rounded-xl flex items-center justify-center shadow-lg">
                        <FileDown className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                        🎯 Minimalista
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Limpo, elegante e profissional
                      </p>
                      <ul className="text-xs text-left text-gray-600 dark:text-gray-400 space-y-1">
                        <li>✓ Design clean e moderno</li>
                        <li>✓ Apenas informações essenciais</li>
                        <li>✓ Economia de tinta</li>
                        <li>✓ Ideal para arquivos digitais</li>
                      </ul>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-500/0 to-zinc-500/0 group-hover:from-slate-500/10 group-hover:to-zinc-500/10 rounded-xl transition-all" />
                  </motion.button>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      💡 Dica: Você pode testar diferentes modelos sem custo
                    </p>
                    <button
                      onClick={() => setShowModeloModal(false)}
                      className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
