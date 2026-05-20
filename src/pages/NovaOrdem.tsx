import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Send, ArrowLeft, X, Users, Music2, PenTool as Tool, DollarSign, FileText, Plus, Check, Edit2, Star, Clock, CreditCard, Banknote, Smartphone, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { capitalize } from '../utils/formatters';
import { Autocomplete } from '../components/Autocomplete';
import { ClienteModal } from '../components/ClienteModal';
import { InstrumentoModal } from '../components/InstrumentoModal';
import { MarcaModal } from '../components/MarcaModal';
import { ProblemaModal } from '../components/ProblemaModal';
import { ServicoModal } from '../components/ServicoModal';
import { toast } from '../components/ToastCustom';
import { formatCurrency } from '../utils/formatters';
import type { Cliente, Instrumento, Marca, Problema, Servico } from '../types/database';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { MultiSelect } from '../components/MultiSelect';

type FormaPagamento = 'credito' | 'debito' | 'pix';

function todayForDatabase() {
  return new Date().toISOString().slice(0, 10);
}

function dateForDatabase(value: string) {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value;
}

export function NovaOrdem() {
  const navigate = useNavigate();
  const { id } = useParams();
  
  // Estados para dados relacionados
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [ordensExistentes, setOrdensExistentes] = useState<any[]>([]);

  // Estados do formulário
  const [clienteId, setClienteId] = useState('');
  const [instrumentoId, setInstrumentoId] = useState('');
  const [marcaId, setMarcaId] = useState('');
  const [modelo, setModelo] = useState('');
  const [acessorios, setAcessorios] = useState('');
  const [problemasIds, setProblemasIds] = useState<string[]>([]);
  const [problemasDescricoes, setProblemasDescricoes] = useState<Record<string, string>>({});
  const [servicosIds, setServicosIds] = useState<string[]>([]);
  const [servicosDescricoes, setServicosDescricoes] = useState<Record<string, string>>({});
  const [valorServicos, setValorServicos] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('pix');
  const [observacoes, setObservacoes] = useState('Pagamento Antecipado!');
  const [dataPrevisao, setDataPrevisao] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estados para modais de cadastro rápido
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showInstrumentoModal, setShowInstrumentoModal] = useState(false);
  const [showMarcaModal, setShowMarcaModal] = useState(false);
  const [showProblemaModal, setShowProblemaModal] = useState(false);
  const [showServicoModal, setShowServicoModal] = useState(false);
  // Toggle mostrar todos
  const [showAllMarcas, setShowAllMarcas] = useState(false);
  const [showAllProblemas, setShowAllProblemas] = useState(false);
  const [showAllServicos, setShowAllServicos] = useState(false);
  
  // Estados de pesquisa
  const [searchCliente, setSearchCliente] = useState('');
  const [searchMarca, setSearchMarca] = useState('');
  const [searchProblema, setSearchProblema] = useState('');
  const [searchServico, setSearchServico] = useState('');

  useEffect(() => {
    carregarDados();
    if (id) {
      carregarOrdem(id);
    }
  }, []);

  async function carregarOrdem(orderId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Ordem não encontrada');

      // Preencher os campos com os dados da ordem
      setClienteId(data.cliente_id);
      setInstrumentoId(data.instrumento_id);
      setMarcaId(data.marca_id);
      setModelo(data.modelo || '');
      setAcessorios(data.acessorios || '');
      setProblemasIds(data.problemas_ids || []);
      setProblemasDescricoes({});
      setServicosIds(data.servicos_ids || []);
      setServicosDescricoes({});
      setValorServicos(Number(data.valor_servicos || 0));
      setDesconto(Number(data.desconto || 0));
      setFormaPagamento(data.forma_pagamento);
      setObservacoes(data.observacoes);
      setDataPrevisao(dateForDatabase(data.data_previsao));

    } catch (error) {
      console.error('Erro ao carregar ordem:', error);
      toast.error('Erro ao carregar ordem de serviço');
      navigate('/ordens');
    }
  }

  // Computar top-5 mais comuns baseado em ordens existentes (fallback: ordenação por nome)
  const servicoCounts = useMemo(() => {
    const map = new Map<string, number>();
    ordensExistentes.forEach(o => {
      const ids: string[] = (o.servicos_ids as string[]) || [];
      ids.forEach(id => map.set(id, (map.get(id) || 0) + 1));
    });
    return map;
  }, [ordensExistentes]);

  const problemaCounts = useMemo(() => {
    const map = new Map<string, number>();
    ordensExistentes.forEach(o => {
      const ids: string[] = (o.problemas_ids as string[]) || [];
      ids.forEach(id => map.set(id, (map.get(id) || 0) + 1));
    });
    return map;
  }, [ordensExistentes]);

  const marcaCounts = useMemo(() => {
    const map = new Map<string, number>();
    ordensExistentes.forEach(o => {
      const id = o.marca_id as string | undefined;
      if (id) map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [ordensExistentes]);

  const topServicos = useMemo(() => {
    if (!servicos || servicos.length === 0) return [] as Servico[];
    return [...servicos]
      .sort((a, b) => (servicoCounts.get(b.id) || 0) - (servicoCounts.get(a.id) || 0) || a.nome.localeCompare(b.nome))
      .slice(0, 5);
  }, [servicos, servicoCounts]);

  const topProblemas = useMemo(() => {
    if (!problemas || problemas.length === 0) return [] as Problema[];
    return [...problemas]
      .sort((a, b) => (problemaCounts.get(b.id) || 0) - (problemaCounts.get(a.id) || 0) || a.nome.localeCompare(b.nome))
      .slice(0, 5);
  }, [problemas, problemaCounts]);

  const topMarcas = useMemo(() => {
    if (!marcas || marcas.length === 0) return [] as Marca[];
    return [...marcas]
      .sort((a, b) => (marcaCounts.get(b.id) || 0) - (marcaCounts.get(a.id) || 0) || a.nome.localeCompare(b.nome))
      .slice(0, 5);
  }, [marcas, marcaCounts]);

  // Filtros de pesquisa
  const clientesFiltrados = useMemo(() => {
    if (!searchCliente) return clientes;
    const search = searchCliente.toLowerCase();
    return clientes.filter(c => 
      c.nome?.toLowerCase().includes(search) || 
      c.telefone?.toLowerCase().includes(search)
    );
  }, [clientes, searchCliente]);

  const marcasFiltradas = useMemo(() => {
    if (!searchMarca) return showAllMarcas ? marcas : topMarcas;
    const search = searchMarca.toLowerCase();
    return marcas.filter(m => m.nome?.toLowerCase().includes(search));
  }, [marcas, topMarcas, searchMarca, showAllMarcas]);

  const problemasFiltrados = useMemo(() => {
    if (!searchProblema) return showAllProblemas ? problemas : topProblemas;
    const search = searchProblema.toLowerCase();
    return problemas.filter(p => p.nome?.toLowerCase().includes(search));
  }, [problemas, topProblemas, searchProblema, showAllProblemas]);

  const servicosFiltrados = useMemo(() => {
    if (!searchServico) return showAllServicos ? servicos : topServicos;
    const search = searchServico.toLowerCase();
    return servicos.filter(s => s.nome?.toLowerCase().includes(search));
  }, [servicos, topServicos, searchServico, showAllServicos]);

  async function carregarDados() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Carregar clientes (ordenados por data de criação, mais recente primeiro)
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setClientes(clientesData || []);

      // Carregar instrumentos
      const { data: instrumentosData } = await supabase
        .from('instrumentos')
        .select('*')
        .eq('user_id', user.id)
        .order('nome', { ascending: true });
      setInstrumentos(instrumentosData || []);

      // Carregar marcas
      const { data: marcasData } = await supabase
        .from('marcas')
        .select('*')
        .eq('user_id', user.id)
        .order('nome', { ascending: true });
      setMarcas(marcasData || []);

      // Carregar problemas
      const { data: problemasData } = await supabase
        .from('problemas')
        .select('*')
        .eq('user_id', user.id)
        .order('nome', { ascending: true });
      setProblemas(problemasData || []);

      // Carregar serviços
      const { data: servicosData } = await supabase
        .from('servicos')
        .select('*')
        .eq('user_id', user.id)
        .order('nome', { ascending: true });
      setServicos(servicosData || []);

      // Carregar ordens existentes
      const { data: ordensData } = await supabase
        .from('ordens_servico')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pendente');
      setOrdensExistentes(ordensData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados necessários');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      if (!clienteId || !instrumentoId || !marcaId || !modelo || !dataPrevisao) {
        toast.error('Preencha cliente, instrumento, marca, modelo e previsao de entrega.');
        return;
      }

      if (desconto > valorServicos) {
        toast.error('O desconto nao pode ser maior que o valor dos servicos.');
        return;
      }

      // Format problems and services as comma-separated text
      const problemasText = problemasIds
        .map(id => {
          const problema = problemas.find(p => p.id === id);
          return problema ? `${problema.nome}: ${problemasDescricoes[id] || problema.descricao || ''}` : '';
        })
        .filter(Boolean)
        .join(', ');

      const servicosText = servicosIds
        .map(id => {
          const servico = servicos.find(s => s.id === id);
          return servico ? `${servico.nome}: ${servicosDescricoes[id] || servico.descricao || ''}` : '';
        })
        .filter(Boolean)
        .join(', ');

      const formattedObservations = `Problemas:
${problemasText || 'Nenhum problema registrado.'}

Serviços:
${servicosText || 'Nenhum serviço registrado.'}`;

      const valorTotal = Math.max(0, Number(valorServicos || 0) - Number(desconto || 0));
      const observacoesCompletas = [
        observacoes?.trim(),
        formattedObservations,
      ].filter(Boolean).join('\n\n');

      let numero: number | undefined;
      if (!id) {
        const { data: nextNumber, error: nextNumberError } = await supabase.rpc('get_next_order_number', { p_user_id: user.id });
        if (nextNumberError) throw nextNumberError;
        numero = Number(nextNumber);
      }

      const ordemData = {
        ...(id && { id }), // Inclui o ID apenas se estiver editando
        ...(!id && { numero, status: 'pendente' as const, data_entrada: todayForDatabase() }),
        cliente_id: clienteId,
        instrumento_id: instrumentoId,
        marca_id: marcaId,
        modelo,
        acessorios,
        problemas_ids: problemasIds,
        problema_descricao: problemasText,
        servicos_ids: servicosIds,
        servico_descricao: servicosText,
        valor_servicos: Number(valorServicos || 0),
        desconto: Number(desconto || 0),
        valor_total: valorTotal,
        forma_pagamento: formaPagamento,
        observacoes: observacoesCompletas,
        data_previsao: dateForDatabase(dataPrevisao),
        user_id: user.id,
      };

      let error;
      if (id) {
        // Atualizar ordem existente
        const { error: updateError } = await supabase
          .from('ordens_servico')
          .update(ordemData)
          .eq('id', id)
          .eq('user_id', user.id);
        error = updateError;
      } else {
        // Criar nova ordem
        const { error: insertError } = await supabase
          .from('ordens_servico')
          .insert([ordemData]);
        error = insertError;
      }

      if (error) throw error;
      
      toast.success(`Ordem de serviço ${id ? 'atualizada' : 'criada'} com sucesso! 🛠️`);
      navigate('/ordens');
    } catch (error) {
      console.error('Erro ao salvar ordem de serviço:', error);
      toast.error('Erro ao salvar ordem de serviço');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setClienteId('');
    setInstrumentoId('');
    setMarcaId('');
    setModelo('');
    setAcessorios('');
    setObservacoes('');
    setDataPrevisao('');
  }

  function handleServicosChange(ids: string[]) {
    setServicosIds(ids);
    // Calcular valor total dos serviços selecionados
    const total = ids.reduce((acc, id) => {
      const servico = servicos.find(s => s.id === id);
      return acc + (servico?.valor || 0);
    }, 0);
    setValorServicos(total);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-100 dark:from-gray-900 dark:via-purple-900/20 dark:to-fuchsia-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header com animação */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-4 mb-4">
            <motion.button
              whileHover={{ scale: 1.1, x: -5 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/ordens')}
              className="p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl hover:bg-white dark:hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl"
            >
              <ArrowLeft className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </motion.button>
            
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 dark:from-purple-400 dark:via-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">
                  {id ? '✏️ Editar Ordem' : '📝 Nova Ordem'}
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {id ? 'Atualize os dados da ordem de serviço' : 'Preencha os dados para criar uma nova ordem'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700"
        >
          {/* Form */}
          <div className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seção: Informações do Cliente - MELHORADO */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-6 space-y-4 border border-blue-100 dark:border-blue-800/30"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                👤 Informações do Cliente
              </h3>

              {/* Último Cliente Cadastrado - DESTAQUE */}
              {clientes.length > 0 && !clienteId && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-4 shadow-lg"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Star className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Último Cadastrado</p>
                        <p className="text-lg font-bold text-white truncate">{clientes[0].nome}</p>
                        <p className="text-sm text-white/90">{clientes[0].telefone}</p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => setClienteId(clientes[0].id)}
                      className="px-6 py-3 bg-white text-blue-600 font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                    >
                      <Check className="w-5 h-5" />
                      Selecionar
                    </motion.button>
                  </div>
                </motion.div>
              )}
              
              {/* Cliente Selecionado */}
              {clienteId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass dark:glass-dark rounded-xl p-4 border-2 border-green-400 dark:border-green-500"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente Selecionado</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {clientes.find(c => c.id === clienteId)?.nome}
                        </p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => setClienteId('')}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                    >
                      <X className="w-5 h-5" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* Busca de Clientes */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {clienteId ? 'Alterar Cliente' : 'Buscar Cliente'}
                  </label>
                  <Autocomplete
                    value={clienteId}
                    onChange={(val) => setClienteId(typeof val === 'string' ? val : val[0])}
                    options={clientes.map(c => ({ id: c.id, nome: c.nome }))}
                    placeholder="Digite para buscar ou criar novo cliente"
                    onCreateNew={() => setShowClienteModal(true)}
                    className="w-full"
                  />
                </div>

                {servicos.length > 5 && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAllServicos(prev => !prev)}
                      className="text-xs text-green-600 dark:text-green-400 font-semibold hover:underline"
                    >
                      {showAllServicos ? 'Ver menos' : `Ver todos (${servicos.length})`}
                    </button>
                  </div>
                )}

              </div>
            </motion.div>

            {/* Seção: Informações do Instrumento - MELHORADO */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 space-y-4 border border-amber-100 dark:border-amber-800/30"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Music2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                🎸 Informações do Instrumento
              </h3>
              
              {/* Seleção Visual de Instrumentos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Selecione o Instrumento
                  </label>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowInstrumentoModal(true)}
                    className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-all"
                  >
                    + Novo
                  </motion.button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {instrumentos.map((instrumento) => (
                    <motion.button
                      key={instrumento.id}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => setInstrumentoId(instrumento.id)}
                      className={`
                        relative p-4 rounded-xl border-2 transition-all text-left
                        ${instrumentoId === instrumento.id
                          ? 'bg-gradient-to-br from-amber-500 to-orange-500 border-amber-400 text-white shadow-lg shadow-amber-500/30'
                          : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-600'
                        }
                      `}
                    >
                      {instrumentoId === instrumento.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg"
                        >
                          <Check className="w-4 h-4 text-white" />
                        </motion.div>
                      )}
                      <Music2 className={`w-6 h-6 mb-2 ${instrumentoId === instrumento.id ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`} />
                      <p className={`font-bold text-sm truncate ${instrumentoId === instrumento.id ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                        {instrumento.nome}
                      </p>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Seleção Visual de Marcas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Selecione a Marca
                  </label>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowMarcaModal(true)}
                    className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-all"
                  >
                    + Nova
                  </motion.button>
                </div>

                {/* Campo de Pesquisa de Marcas */}
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchMarca}
                      onChange={(e) => setSearchMarca(e.target.value)}
                      placeholder="Pesquisar marcas..."
                      className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-800 dark:text-white transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {marcasFiltradas.map((marca) => (
                    <motion.button
                      key={marca.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => setMarcaId(marca.id)}
                      className={`
                        relative px-3 py-2 rounded-lg border-2 font-semibold text-xs transition-all
                        ${marcaId === marca.id
                          ? 'bg-gradient-to-r from-orange-500 to-red-500 border-orange-400 text-white shadow-md'
                          : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-orange-300'
                        }
                      `}
                    >
                      {marca.nome}
                    </motion.button>
                  ))}
                </div>

                {marcas.length > 5 && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAllMarcas(prev => !prev)}
                      className="text-xs text-orange-600 dark:text-orange-400 font-semibold hover:underline"
                    >
                      {showAllMarcas ? 'Ver menos' : `Ver todos (${marcas.length})`}
                    </button>
                  </div>
                )}
              </div>

              {/* Modelo e Acessórios */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    📝 Modelo
                  </label>
                  <input
                    type="text"
                    value={modelo}
                    onChange={(e) => setModelo(capitalize(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:bg-gray-800 dark:text-white transition-all font-medium"
                    placeholder="Ex: Stratocaster"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    🎒 Acessórios
                  </label>
                  <input
                    type="text"
                    value={acessorios}
                    onChange={(e) => setAcessorios(capitalize(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:bg-gray-800 dark:text-white transition-all font-medium"
                    placeholder="Ex: Capa, cabo, palhetas"
                  />
                </div>
              </div>
            </motion.div>

            {/* Seção: Problemas e Serviços - MELHORADO */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 space-y-6 border border-green-100 dark:border-green-800/30"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Tool className="w-5 h-5 text-green-600 dark:text-green-400" />
                🔧 Problemas e Serviços
              </h3>
              
              {/* Problemas - Interface Visual */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ⚠️ Problemas Identificados
                  </label>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowProblemaModal(true)}
                    className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all"
                  >
                    + Novo Problema
                  </motion.button>
                </div>

                {/* Campo de Pesquisa de Problemas */}
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchProblema}
                      onChange={(e) => setSearchProblema(e.target.value)}
                      placeholder="Pesquisar problemas..."
                      className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-gray-800 dark:text-white transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {problemasFiltrados.map((problema) => {
                    const isSelected = problemasIds.includes(problema.id);
                    return (
                      <motion.div
                        key={problema.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`
                          relative p-4 rounded-xl border-2 transition-all cursor-pointer
                          ${isSelected
                            ? 'bg-gradient-to-br from-red-500 to-rose-500 border-red-400 text-white shadow-lg'
                            : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 hover:border-red-300'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setProblemasIds(problemasIds.filter(id => id !== problema.id));
                              } else {
                                setProblemasIds([...problemasIds, problema.id]);
                              }
                            }}
                            className={`
                              flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                              ${isSelected
                                ? 'bg-white border-white'
                                : 'border-gray-300 dark:border-gray-600 hover:border-red-400'
                              }
                            `}
                          >
                            {isSelected && <Check className="w-4 h-4 text-red-600" />}
                          </motion.button>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                              {problema.nome}
                            </p>
                            {isSelected && (
                              <motion.textarea
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                value={problemasDescricoes[problema.id] || problema.descricao || ''}
                                onChange={(e) => setProblemasDescricoes(prev => ({ ...prev, [problema.id]: e.target.value }))}
                                placeholder="Detalhes adicionais..."
                                className="w-full mt-2 px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/60 text-sm"
                                rows={2}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {problemas.length > 5 && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAllProblemas(prev => !prev)}
                      className="text-xs text-red-600 dark:text-red-400 font-semibold hover:underline"
                    >
                      {showAllProblemas ? 'Ver menos' : `Ver todos (${problemas.length})`}
                    </button>
                  </div>
                )}
              </div>

              {/* Serviços - Interface Visual */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    🛠️ Serviços a Realizar
                  </label>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowServicoModal(true)}
                    className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all"
                  >
                    + Novo Serviço
                  </motion.button>
                </div>

                {/* Campo de Pesquisa de Serviços */}
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchServico}
                      onChange={(e) => setSearchServico(e.target.value)}
                      placeholder="Pesquisar serviços..."
                      className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white dark:bg-gray-800 dark:text-white transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {servicosFiltrados.map((servico) => {
                    const isSelected = servicosIds.includes(servico.id);
                    return (
                      <motion.div
                        key={servico.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`
                          relative p-4 rounded-xl border-2 transition-all cursor-pointer
                          ${isSelected
                            ? 'bg-gradient-to-br from-green-500 to-emerald-500 border-green-400 text-white shadow-lg'
                            : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 hover:border-green-300'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                handleServicosChange(servicosIds.filter(id => id !== servico.id));
                              } else {
                                handleServicosChange([...servicosIds, servico.id]);
                              }
                            }}
                            className={`
                              flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                              ${isSelected
                                ? 'bg-white border-white'
                                : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                              }
                            `}
                          >
                            {isSelected && <Check className="w-4 h-4 text-green-600" />}
                          </motion.button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                                {servico.nome}
                              </p>
                              {servico.valor && (
                                <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-green-600 dark:text-green-400'}`}>
                                  {formatCurrency(servico.valor)}
                                </span>
                              )}
                            </div>
                            {isSelected && (
                              <motion.textarea
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                value={servicosDescricoes[servico.id] || servico.descricao || ''}
                                onChange={(e) => setServicosDescricoes(prev => ({ ...prev, [servico.id]: e.target.value }))}
                                placeholder="Detalhes do serviço..."
                                className="w-full mt-2 px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/60 text-sm"
                                rows={2}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Seção: Valores e Pagamento - MELHORADO */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 space-y-6 border border-indigo-100 dark:border-indigo-800/30"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                💰 Valores e Pagamento
              </h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Valores */}
                <div className="space-y-4">
                  <div className="glass dark:glass-dark rounded-xl p-5 space-y-4 border border-indigo-200 dark:border-indigo-700/30">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        💵 Valor dos Serviços
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold text-lg">R$</span>
                        <input
                          type="number"
                          value={valorServicos}
                          onChange={(e) => setValorServicos(Number(e.target.value))}
                          className="w-full pl-14 pr-4 py-4 border-2 border-indigo-200 dark:border-indigo-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100 transition-all font-bold text-xl"
                          step="0.01"
                          min="0"
                          required
                        />
                      </div>
                    </div>
                  
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        🎁 Desconto
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold text-lg">R$</span>
                        <input
                          type="number"
                          value={desconto}
                          onChange={(e) => setDesconto(Number(e.target.value))}
                          className="w-full pl-14 pr-4 py-4 border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-800 dark:text-gray-100 transition-all font-bold text-xl"
                          step="0.01"
                          min="0"
                        />
                      </div>
                    </div>
                  
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="p-5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl font-bold shadow-lg"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white text-lg">💰 Total a Pagar</span>
                        <span className="text-white text-2xl">{formatCurrency(valorServicos - desconto)}</span>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Formas de Pagamento - Cards Visuais */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    💳 Forma de Pagamento
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setFormaPagamento('pix')}
                      className={`
                        relative p-5 rounded-xl border-2 font-bold transition-all text-left overflow-hidden
                        ${formaPagamento === 'pix'
                          ? 'bg-gradient-to-br from-green-500 to-emerald-500 border-green-400 text-white shadow-xl shadow-green-500/30'
                          : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-green-300'
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${formaPagamento === 'pix' ? 'bg-white/20' : 'bg-green-100 dark:bg-green-900/30'}`}>
                          <Smartphone className={`w-7 h-7 ${formaPagamento === 'pix' ? 'text-white' : 'text-green-600 dark:text-green-400'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-lg font-bold">PIX</p>
                          <p className={`text-xs ${formaPagamento === 'pix' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                            Transferência instantânea
                          </p>
                        </div>
                        {formaPagamento === 'pix' && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-8 h-8 bg-white rounded-full flex items-center justify-center"
                          >
                            <Check className="w-5 h-5 text-green-600" />
                          </motion.div>
                        )}
                      </div>
                      {formaPagamento === 'pix' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 pt-3 border-t border-white/20"
                        >
                          <p className="text-sm text-white/90 font-semibold">
                            CNPJ: 30.057.854/0001-75
                          </p>
                        </motion.div>
                      )}
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setFormaPagamento('credito')}
                      className={`
                        relative p-5 rounded-xl border-2 font-bold transition-all text-left
                        ${formaPagamento === 'credito'
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-500 border-blue-400 text-white shadow-xl shadow-blue-500/30'
                          : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300'
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${formaPagamento === 'credito' ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                          <CreditCard className={`w-7 h-7 ${formaPagamento === 'credito' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-lg font-bold">Crédito</p>
                          <p className={`text-xs ${formaPagamento === 'credito' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                            Parcelamento disponível
                          </p>
                        </div>
                        {formaPagamento === 'credito' && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-8 h-8 bg-white rounded-full flex items-center justify-center"
                          >
                            <Check className="w-5 h-5 text-blue-600" />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setFormaPagamento('debito')}
                      className={`
                        relative p-5 rounded-xl border-2 font-bold transition-all text-left
                        ${formaPagamento === 'debito'
                          ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-purple-400 text-white shadow-xl shadow-purple-500/30'
                          : 'glass dark:glass-dark border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300'
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${formaPagamento === 'debito' ? 'bg-white/20' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                          <Banknote className={`w-7 h-7 ${formaPagamento === 'debito' ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-lg font-bold">Débito</p>
                          <p className={`text-xs ${formaPagamento === 'debito' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                            Pagamento à vista
                          </p>
                        </div>
                        {formaPagamento === 'debito' && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-8 h-8 bg-white rounded-full flex items-center justify-center"
                          >
                            <Check className="w-5 h-5 text-purple-600" />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Seção: Data de Previsão */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 rounded-xl p-6 space-y-4 border border-rose-100 dark:border-rose-800/30"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                📅 Data de Previsão
              </h3>
              
              <div className="relative">
                <input
                  type="text"
                  value={dataPrevisao ? new Date(dataPrevisao).toLocaleDateString('pt-BR') : ''}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white dark:bg-gray-700 dark:text-gray-100 cursor-pointer transition-all"
                  placeholder="Clique para selecionar a data de previsão"
                  onClick={() => setShowCalendar(!showCalendar)}
                  required
                />
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              </div>
            </motion.div>

            {/* Seção: Observações - MELHORADO COM TEMPLATE */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20 rounded-xl p-6 space-y-4 border border-slate-100 dark:border-slate-800/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  📋 Mensagem para o Cliente
                </h3>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => {
                    const template = `🔧 ORDEM DE SERVIÇO

📦 PROBLEMAS IDENTIFICADOS:
${problemasIds.map(id => {
  const problema = problemas.find(p => p.id === id);
  const desc = problemasDescricoes[id];
  return `• ${problema?.nome}${desc ? `: ${desc}` : ''}`;
}).join('\n') || '• Nenhum problema registrado'}

🛠️ SERVIÇOS A REALIZAR:
${servicosIds.map(id => {
  const servico = servicos.find(s => s.id === id);
  const desc = servicosDescricoes[id];
  return `• ${servico?.nome}${desc ? `: ${desc}` : ''}`;
}).join('\n') || '• Nenhum serviço registrado'}

💰 VALOR: ${formatCurrency(valorServicos - desconto)}
💳 FORMA DE PAGAMENTO: ${formaPagamento.toUpperCase()}
📅 PREVISÃO DE ENTREGA: ${dataPrevisao ? new Date(dataPrevisao).toLocaleDateString('pt-BR') : 'A definir'}

⏰ Horário de retirada: 10h às 18h

⚠️ IMPORTANTE:
Os serviços executados na Vibratho Instrumentos são de total responsabilidade do Samuel Silva.

📋 LEI Nº 2.560/2021:
Ao levar um equipamento para consertar, os consumidores devem ficar atentos ao prazo estabelecido para buscar o produto.

📸 Siga nosso Instagram:
https://www.instagram.com/luthieriabrasilia/`;
                    setObservacoes(template);
                    toast.success('Template aplicado! 📝');
                  }}
                  className="text-xs px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-lg font-medium transition-all shadow-md"
                >
                  🎨 Aplicar Template
                </motion.button>
              </div>

              <div className="glass dark:glass-dark rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <Edit2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Edite a mensagem abaixo:
                  </span>
                </div>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white dark:bg-gray-800 dark:text-gray-100 transition-all font-mono text-sm"
                  rows={10}
                  placeholder="Digite as observações ou clique em 'Aplicar Template' para usar o modelo padrão..."
                  required
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>Esta mensagem será enviada ao cliente junto com a ordem de serviço</span>
                </div>
              </div>
            </motion.div>

            {/* Botões de Ação */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => navigate('/ordens')}
                className="px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
              >
                ❌ Cancelar
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 text-white font-bold rounded-xl hover:from-purple-700 hover:via-violet-700 hover:to-fuchsia-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-purple-500/30"
              >
                <span>{loading ? '⏳ Salvando...' : (id ? '✅ Atualizar Ordem' : '📝 Criar Ordem')}</span>
                <Send className="w-5 h-5" />
              </motion.button>
            </motion.div>
          </form>
          </div>
        </motion.div>

        {/* Modais de Cadastro Rápido */}
        <ClienteModal
          isOpen={showClienteModal}
          onClose={() => setShowClienteModal(false)}
          onSuccess={() => {
            carregarDados();
            setShowClienteModal(false);
          }}
        />

        <InstrumentoModal
          isOpen={showInstrumentoModal}
          onClose={() => setShowInstrumentoModal(false)}
          onSuccess={() => {
            carregarDados();
            setShowInstrumentoModal(false);
          }}
        />

        <MarcaModal
          isOpen={showMarcaModal}
          onClose={() => setShowMarcaModal(false)}
          onSuccess={() => {
            carregarDados();
            setShowMarcaModal(false);
          }}
        />

        <ProblemaModal
          isOpen={showProblemaModal}
          onClose={() => setShowProblemaModal(false)}
          onSuccess={() => {
            carregarDados();
            setShowProblemaModal(false);
          }}
        />

        <ServicoModal
          isOpen={showServicoModal}
          onClose={() => setShowServicoModal(false)}
          onSuccess={() => {
            carregarDados();
            setShowServicoModal(false);
          }}
        />

        {/* Modal do Calendário */}
        {showCalendar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Selecione a Data de Previsão</h3>
                <button
                  type="button"
                  onClick={() => setShowCalendar(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                locale={ptBrLocale}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek'
                }}
                height={500}
                selectable={true}
                select={(info) => {
                  const date = new Date(info.start);
                  date.setHours(10, 0, 0);
                  setDataPrevisao(date.toISOString());
                  setShowCalendar(false);
                }}
                events={ordensExistentes.map(ordem => ({
                  title: `OS #${ordem.numero}`,
                  start: ordem.data_previsao,
                  description: ordem.problema_descricao,
                  backgroundColor: '#8B5CF6',
                  borderColor: '#7C3AED'
                }))}
                eventContent={(eventInfo) => (
                  <div className="p-1">
                    <div className="text-xs font-medium text-white line-clamp-1">
                      {eventInfo.event.title}
                    </div>
                    {eventInfo.event.extendedProps.description && (
                      <div className="text-xs text-white/80 line-clamp-1">
                        {eventInfo.event.extendedProps.description}
                      </div>
                    )}
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
