import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  X,
  MessageCircle,
  Printer,
  Send,
  Smartphone,
  UserRound,
  Wrench,
} from 'lucide-react';
import { Autocomplete } from '../components/Autocomplete';
import { ClienteModal } from '../components/ClienteModal';
import { InstrumentoModal } from '../components/InstrumentoModal';
import { MarcaModal } from '../components/MarcaModal';
import { MultiSelect } from '../components/MultiSelect';
import { PrintOrdemModal } from '../components/PrintOrdemModal';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { formatCurrency } from '../utils/formatters';
import { addDaysToDateOnly, formatLocalDate, parseLocalDate, toDateOnly, todayLocalDate } from '../utils/dates';
import { WhatsAppService } from '../utils/whatsapp-service';
import type { Cliente, Instrumento, Marca, OrdemServico, Problema, Servico } from '../types/database';

type FormaPagamento = 'credito' | 'debito' | 'pix';
type AcaoAposSalvar = 'nenhuma' | 'mensagem' | 'pdf';
type AgendaOrder = Pick<OrdemServico, 'id' | 'numero' | 'modelo' | 'data_previsao' | 'status'> & {
  cliente?: Pick<Cliente, 'nome'> | null;
  instrumento?: Pick<Instrumento, 'nome'> | null;
  marca?: Pick<Marca, 'nome'> | null;
};

const steps = [
  { number: 1, title: 'Cliente e instrumento', description: 'Cliente, marca, modelo e acessórios' },
  { number: 2, title: 'Diagnóstico e solução', description: 'Problemas encontrados e serviços' },
  { number: 3, title: 'Pagamento e entrega', description: 'Valores, previsão e envio' },
];

function dateForDatabase(value: string) {
  return toDateOnly(value);
}

function todayForDatabase() {
  return todayLocalDate();
}

function formatDayLabel(value: string) {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '--/--';
}

function formatWeekday(value: string) {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : '';
}

function orderStatusLabel(status: OrdemServico['status']) {
  const labels: Record<OrdemServico['status'], string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluido: 'Concluida',
    cancelado: 'Cancelada',
    atraso: 'Atraso',
  };
  return labels[status] || status;
}

function scheduleLoad(count: number) {
  if (count === 0) return { label: 'Livre', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (count <= 2) return { label: 'Tranquilo', className: 'border-sky-200 bg-sky-50 text-sky-800' };
  if (count <= 4) return { label: 'Moderado', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  return { label: 'Cheio', className: 'border-rose-200 bg-rose-50 text-rose-800' };
}

export function NovaOrdem() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [step, setStep] = useState(1);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
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
  const [dataPrevisao, setDataPrevisao] = useState('');
  const [observacoes, setObservacoes] = useState('Pagamento Antecipado!');
  const [acaoAposSalvar, setAcaoAposSalvar] = useState<AcaoAposSalvar>('mensagem');
  const [loading, setLoading] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showInstrumentoModal, setShowInstrumentoModal] = useState(false);
  const [showMarcaModal, setShowMarcaModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [ordemParaImprimir, setOrdemParaImprimir] = useState<OrdemServico | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaOrders, setAgendaOrders] = useState<AgendaOrder[]>([]);

  useEffect(() => {
    carregarDados();
    if (id) carregarOrdem(id);
  }, [id]);

  const clienteSelecionado = clientes.find((cliente) => cliente.id === clienteId);
  const total = Math.max(0, Number(valorServicos || 0) - Number(desconto || 0));
  const agendaStart = useMemo(() => {
    const today = todayForDatabase();
    const selected = dateForDatabase(dataPrevisao);
    return selected && selected > today ? selected : today;
  }, [dataPrevisao]);
  const agendaDays = useMemo(() => Array.from({ length: 14 }, (_, index) => addDaysToDateOnly(agendaStart, index)), [agendaStart]);
  const agendaOrdersByDate = useMemo(() => {
    return agendaOrders.reduce<Record<string, AgendaOrder[]>>((acc, order) => {
      const day = dateForDatabase(order.data_previsao);
      if (!day) return acc;
      acc[day] = [...(acc[day] || []), order];
      return acc;
    }, {});
  }, [agendaOrders]);

  const canGoNext = useMemo(() => {
    if (step === 1) return Boolean(clienteId && instrumentoId && marcaId && modelo.trim());
    if (step === 2) return problemasIds.length > 0 || servicosIds.length > 0 || valorServicos > 0;
    return Boolean(dataPrevisao);
  }, [clienteId, dataPrevisao, instrumentoId, marcaId, modelo, problemasIds.length, servicosIds.length, step, valorServicos]);

  useEffect(() => {
    if (step !== 3 || !agendaOpen) return;

    let cancelled = false;

    async function carregarAgenda() {
      try {
        setAgendaLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuario nao autenticado');

        const start = agendaDays[0];
        const endExclusive = addDaysToDateOnly(agendaDays[agendaDays.length - 1], 1);
        const { data, error } = await supabase
          .from('ordens_servico')
          .select('id, numero, modelo, data_previsao, status, cliente:clientes(nome), instrumento:instrumentos(nome), marca:marcas(nome)')
          .eq('user_id', user.id)
          .gte('data_previsao', start)
          .lt('data_previsao', endExclusive)
          .order('data_previsao', { ascending: true })
          .order('numero', { ascending: true });

        if (error) throw error;

        const openOrders = ((data || []) as AgendaOrder[]).filter((order) => {
          if (id && order.id === id) return false;
          return order.status !== 'concluido' && order.status !== 'cancelado';
        });

        if (!cancelled) setAgendaOrders(openOrders);
      } catch (error) {
        console.error('Erro ao carregar agenda de entregas:', error);
        if (!cancelled) toast.error('Erro ao carregar agenda de entregas');
      } finally {
        if (!cancelled) setAgendaLoading(false);
      }
    }

    carregarAgenda();

    return () => {
      cancelled = true;
    };
  }, [agendaDays, agendaOpen, id, step]);

  async function carregarDados() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const [
        { data: clientesData },
        { data: instrumentosData },
        { data: marcasData },
        { data: problemasData },
        { data: servicosData },
      ] = await Promise.all([
        supabase.from('clientes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('instrumentos').select('*').eq('user_id', user.id).order('nome', { ascending: true }),
        supabase.from('marcas').select('*').eq('user_id', user.id).order('nome', { ascending: true }),
        supabase.from('problemas').select('*').eq('user_id', user.id).order('nome', { ascending: true }),
        supabase.from('servicos').select('*').eq('user_id', user.id).order('nome', { ascending: true }),
      ]);

      setClientes(clientesData || []);
      setInstrumentos(instrumentosData || []);
      setMarcas(marcasData || []);
      setProblemas(problemasData || []);
      setServicos(servicosData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados necessários');
    }
  }

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

      setClienteId(data.cliente_id || '');
      setInstrumentoId(data.instrumento_id || '');
      setMarcaId(data.marca_id || '');
      setModelo(data.modelo || '');
      setAcessorios(data.acessorios || '');
      setProblemasIds(data.problemas_ids || []);
      setServicosIds(data.servicos_ids || []);
      setValorServicos(Number(data.valor_servicos || 0));
      setDesconto(Number(data.desconto || 0));
      setFormaPagamento(data.forma_pagamento || 'pix');
      setObservacoes(data.observacoes || '');
      setDataPrevisao(data.data_previsao ? dateForDatabase(data.data_previsao) : '');
    } catch (error) {
      console.error('Erro ao carregar ordem:', error);
      toast.error('Erro ao carregar ordem de serviço');
      navigate('/ordens');
    }
  }

  function handleServicosChange(ids: string[]) {
    setServicosIds(ids);
    const totalServicos = ids.reduce((acc, serviceId) => {
      const servico = servicos.find((item) => item.id === serviceId);
      return acc + Number(servico?.valor || 0);
    }, 0);
    setValorServicos(totalServicos);
  }

  function buildProblemsText() {
    return problemasIds
      .map((problemId) => {
        const problema = problemas.find((item) => item.id === problemId);
        if (!problema) return '';
        const description = problemasDescricoes[problemId] || problema.descricao || '';
        return `${problema.nome}${description ? `: ${description}` : ''}`;
      })
      .filter(Boolean)
      .join(', ');
  }

  function buildServicesText() {
    return servicosIds
      .map((serviceId) => {
        const servico = servicos.find((item) => item.id === serviceId);
        if (!servico) return '';
        const description = servicosDescricoes[serviceId] || servico.descricao || '';
        return `${servico.nome}${description ? `: ${description}` : ''}`;
      })
      .filter(Boolean)
      .join(', ');
  }

  async function fetchSavedOrder(orderId: string) {
    const { data, error } = await supabase
      .from('ordens_servico')
      .select('*,cliente:clientes(*),instrumento:instrumentos(*),marca:marcas(*)')
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return data as OrdemServico;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canGoNext) {
      toast.error('Revise os campos obrigatórios desta etapa.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let numero: number | undefined;
      if (!id) {
        const { data: nextNumber, error: numberError } = await supabase.rpc('get_next_order_number', { p_user_id: user.id });
        if (numberError) throw numberError;
        numero = Number(nextNumber);
      }

      const formattedObservations = `Problemas:
${buildProblemsText() || 'Nenhum problema registrado.'}

Solução / Serviços:
${buildServicesText() || 'Nenhum serviço registrado.'}`;

      const ordemData = {
        ...(id && { id }),
        ...(!id && { numero, status: 'pendente' as const, data_entrada: todayForDatabase() }),
        cliente_id: clienteId,
        instrumento_id: instrumentoId,
        marca_id: marcaId,
        modelo: modelo.trim(),
        acessorios,
        problemas_ids: problemasIds,
        problema_descricao: buildProblemsText(),
        servicos_ids: servicosIds,
        servico_descricao: buildServicesText(),
        valor_servicos: Number(valorServicos || 0),
        desconto: Number(desconto || 0),
        valor_total: total,
        forma_pagamento: formaPagamento,
        observacoes: [observacoes?.trim(), formattedObservations].filter(Boolean).join('\n\n'),
        data_previsao: dateForDatabase(dataPrevisao),
        user_id: user.id,
      };

      let savedId = id;
      if (id) {
        const { error } = await supabase.from('ordens_servico').update(ordemData).eq('id', id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('ordens_servico').insert([ordemData]);
        if (error) throw error;
        savedId = Array.isArray(data) ? data[0]?.id : data?.id;
      }

      if (!savedId) throw new Error('Ordem salva sem identificador');
      const savedOrder = await fetchSavedOrder(savedId);

      toast.success(`Ordem de serviço ${id ? 'atualizada' : 'criada'} com sucesso!`);

      if (acaoAposSalvar === 'mensagem') {
        await WhatsAppService.sendOrderMessage(savedOrder);
        toast.success('Mensagem enviada ao cliente!');
        navigate('/ordens');
      } else if (acaoAposSalvar === 'pdf') {
        setOrdemParaImprimir(savedOrder);
        setShowPrintModal(true);
      } else {
        navigate('/ordens');
      }
    } catch (error: any) {
      console.error('Erro ao salvar ordem de serviço:', error);
      toast.error(error?.message || 'Erro ao salvar ordem de serviço');
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    if (!canGoNext) {
      toast.error('Preencha os campos obrigatórios para continuar.');
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="responsive-page">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/ordens')} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-medium text-violet-700">Ordens de Serviço</p>
              <h1 className="text-2xl font-semibold text-gray-950">{id ? 'Editar ordem' : 'Nova ordem em 3 passos'}</h1>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600">
            Total previsto: <span className="font-semibold text-gray-950">{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {steps.map((item) => {
            const active = item.number === step;
            const done = item.number < step;
            return (
              <button
                type="button"
                key={item.number}
                onClick={() => item.number <= step && setStep(item.number)}
                className={`rounded-lg border p-4 text-left transition ${
                  active ? 'border-violet-300 bg-violet-50 shadow-sm' : done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
                    done ? 'bg-emerald-600 text-white' : active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {done ? <Check className="h-5 w-5" /> : item.number}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-950">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:p-6">
          {step === 1 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Cliente e instrumento</h2>
                  <p className="text-sm text-gray-500">Selecione ou cadastre o cliente e identifique o instrumento.</p>
                </div>
                <UserRound className="h-5 w-5 text-violet-500" />
              </div>

              {clientes.length > 0 && !clienteId && (
                <div className="rounded-lg border border-violet-100 bg-violet-50 p-4">
                  <p className="text-xs font-semibold uppercase text-violet-700">Último cliente cadastrado</p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-950">{clientes[0].nome}</p>
                      <p className="text-sm text-gray-600">{clientes[0].telefone}</p>
                    </div>
                    <button type="button" onClick={() => setClienteId(clientes[0].id)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
                      <Check className="h-4 w-4" />
                      Selecionar
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="Cliente *">
                  <Autocomplete options={clientes} value={clienteId} onChange={(value) => setClienteId(value as string)} onCreateNew={() => setShowClienteModal(true)} placeholder="Selecione o cliente" />
                  {clienteSelecionado && <p className="mt-2 text-xs text-gray-500">{clienteSelecionado.telefone || 'Sem telefone cadastrado'}</p>}
                </Field>
                <Field label="Instrumento *">
                  <Autocomplete options={instrumentos} value={instrumentoId} onChange={(value) => setInstrumentoId(value as string)} onCreateNew={() => setShowInstrumentoModal(true)} placeholder="Selecione o instrumento" />
                </Field>
                <Field label="Marca *">
                  <Autocomplete options={marcas} value={marcaId} onChange={(value) => setMarcaId(value as string)} onCreateNew={() => setShowMarcaModal(true)} placeholder="Selecione a marca" />
                </Field>
                <Field label="Modelo *">
                  <input value={modelo} onChange={(event) => setModelo(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" placeholder="Ex: Cavaquinho Luthier Ferreira" />
                </Field>
              </div>
              <Field label="Acessórios do instrumento">
                <textarea value={acessorios} onChange={(event) => setAcessorios(event.target.value)} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" placeholder="Capa, correia, cabo, cordas, case..." />
              </Field>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Problemas e solução</h2>
                  <p className="text-sm text-gray-500">Registre o diagnóstico e os serviços que serão executados.</p>
                </div>
                <Wrench className="h-5 w-5 text-violet-500" />
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <MultiSelect
                  label="Problemas do instrumento"
                  options={problemas}
                  selectedIds={problemasIds}
                  onChange={setProblemasIds}
                  descriptions={problemasDescricoes}
                  onDescriptionChange={(problemId, description) => setProblemasDescricoes((current) => ({ ...current, [problemId]: description }))}
                  getInitialDescription={(problemId) => problemas.find((item) => item.id === problemId)?.descricao || ''}
                  placeholder="Selecione problemas"
                />
                <MultiSelect
                  label="Solução / serviços"
                  options={servicos}
                  selectedIds={servicosIds}
                  onChange={handleServicosChange}
                  descriptions={servicosDescricoes}
                  onDescriptionChange={(serviceId, description) => setServicosDescricoes((current) => ({ ...current, [serviceId]: description }))}
                  getInitialDescription={(serviceId) => servicos.find((item) => item.id === serviceId)?.descricao || ''}
                  placeholder="Selecione serviços"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Field label="Valor dos serviços">
                  <input type="number" value={valorServicos} onChange={(event) => setValorServicos(Number(event.target.value))} min="0" step="0.01" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                </Field>
                <Field label="Desconto">
                  <input type="number" value={desconto} onChange={(event) => setDesconto(Number(event.target.value))} min="0" step="0.01" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                </Field>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-700">Total a pagar</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-800">{formatCurrency(total)}</p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Pagamento, entrega e envio</h2>
                  <p className="text-sm text-gray-500">Feche a ordem e escolha o que enviar ao cliente.</p>
                </div>
                <Calendar className="h-5 w-5 text-violet-500" />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <Field label="Data de entrega / previsão *">
                    <input
                      type="date"
                      value={dataPrevisao}
                      onClick={() => setAgendaOpen(true)}
                      onFocus={() => setAgendaOpen(true)}
                      onChange={(event) => setDataPrevisao(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      required
                    />
                  </Field>
                  {agendaOpen && (
                    <DeliverySchedulePanel
                      days={agendaDays}
                      loading={agendaLoading}
                      ordersByDate={agendaOrdersByDate}
                      selectedDate={dataPrevisao}
                      onClose={() => setAgendaOpen(false)}
                      onSelectDate={(date) => setDataPrevisao(date)}
                    />
                  )}
                  <Field label="Observações para a ordem">
                    <textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={7} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" placeholder="Mensagem, condições e informações adicionais para o cliente" />
                  </Field>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-800">Forma de pagamento</p>
                    <div className="grid grid-cols-1 gap-2">
                      <PaymentButton active={formaPagamento === 'pix'} icon={<Smartphone className="h-5 w-5" />} title="PIX" description="Transferência instantânea" onClick={() => setFormaPagamento('pix')} />
                      <PaymentButton active={formaPagamento === 'credito'} icon={<CreditCard className="h-5 w-5" />} title="Crédito" description="Cartão de crédito" onClick={() => setFormaPagamento('credito')} />
                      <PaymentButton active={formaPagamento === 'debito'} icon={<Banknote className="h-5 w-5" />} title="Débito" description="Pagamento à vista" onClick={() => setFormaPagamento('debito')} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-800">Após salvar</p>
                    <div className="grid grid-cols-1 gap-2">
                      <AfterSaveButton active={acaoAposSalvar === 'mensagem'} icon={<MessageCircle className="h-5 w-5" />} title="Enviar mensagem" description="Abre o WhatsApp com a OS" onClick={() => setAcaoAposSalvar('mensagem')} />
                      <AfterSaveButton active={acaoAposSalvar === 'pdf'} icon={<Printer className="h-5 w-5" />} title="Abrir PDF/impressão" description="Mostra a ordem para imprimir/salvar PDF" onClick={() => setAcaoAposSalvar('pdf')} />
                      <AfterSaveButton active={acaoAposSalvar === 'nenhuma'} icon={<FileText className="h-5 w-5" />} title="Somente salvar" description="Voltar para a lista de ordens" onClick={() => setAcaoAposSalvar('nenhuma')} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => step === 1 ? navigate('/ordens') : setStep((current) => Math.max(1, current - 1))} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {step === 1 ? <ArrowLeft className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {step === 1 ? 'Cancelar' : 'Voltar'}
            </button>

            {step < 3 ? (
              <button type="button" onClick={goNext} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
                Continuar
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Salvando...' : id ? 'Atualizar ordem' : 'Salvar ordem'}
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      <ClienteModal isOpen={showClienteModal} onClose={() => setShowClienteModal(false)} onSuccess={() => { carregarDados(); setShowClienteModal(false); }} />
      <InstrumentoModal isOpen={showInstrumentoModal} onClose={() => setShowInstrumentoModal(false)} onSuccess={() => { carregarDados(); setShowInstrumentoModal(false); }} />
      <MarcaModal isOpen={showMarcaModal} onClose={() => setShowMarcaModal(false)} onSuccess={() => { carregarDados(); setShowMarcaModal(false); }} />

      {ordemParaImprimir && (
        <PrintOrdemModal
          isOpen={showPrintModal}
          onClose={() => {
            setShowPrintModal(false);
            setOrdemParaImprimir(null);
            navigate('/ordens');
          }}
          ordem={ordemParaImprimir}
        />
      )}
    </div>
  );
}

function DeliverySchedulePanel({
  days,
  loading,
  ordersByDate,
  selectedDate,
  onClose,
  onSelectDate,
}: {
  days: string[];
  loading: boolean;
  ordersByDate: Record<string, AgendaOrder[]>;
  selectedDate: string;
  onClose: () => void;
  onSelectDate: (date: string) => void;
}) {
  const activeDate = selectedDate || days[0] || todayForDatabase();
  const activeOrders = ordersByDate[activeDate] || [];
  const activeLoad = scheduleLoad(activeOrders.length);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">Agenda de entregas</p>
          <p className="text-xs text-gray-500">
            {formatLocalDate(days[0])} ate {formatLocalDate(days[days.length - 1])}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-gray-800" aria-label="Fechar agenda">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {days.map((day) => {
          const count = ordersByDate[day]?.length || 0;
          const load = scheduleLoad(count);
          const active = day === activeDate;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`min-h-[86px] rounded-lg border p-2 text-left transition ${
                active ? 'border-violet-400 bg-white ring-2 ring-violet-100' : `${load.className} hover:bg-white`
              }`}
            >
              <span className="block text-xs font-semibold uppercase">{formatWeekday(day)}</span>
              <span className="mt-1 block text-base font-semibold">{formatDayLabel(day)}</span>
              <span className="mt-2 inline-flex rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium">
                {count} OS
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-950">{formatLocalDate(activeDate)}</p>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${activeLoad.className}`}>
            {activeLoad.label}
          </span>
        </div>

        {loading ? (
          <p className="py-3 text-sm text-gray-500">Carregando agenda...</p>
        ) : activeOrders.length === 0 ? (
          <p className="py-3 text-sm text-gray-500">Nenhuma OS agendada para esta data.</p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {activeOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">
                      OS #{order.numero} - {order.cliente?.nome || 'Cliente'}
                    </p>
                    <p className="mt-1 truncate text-xs text-gray-600">
                      {[order.instrumento?.nome, order.marca?.nome, order.modelo].filter(Boolean).join(' ')}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-600">
                    {orderStatusLabel(order.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function PaymentButton({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
        active ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
    </button>
  );
}

function AfterSaveButton({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
        active ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
    </button>
  );
}
