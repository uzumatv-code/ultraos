import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  MessageCircle,
  Printer,
  Plus,
  Send,
  Trash2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { Autocomplete } from '../components/Autocomplete';
import { ClienteModal } from '../components/ClienteModal';
import { InstrumentoModal } from '../components/InstrumentoModal';
import { MarcaModal } from '../components/MarcaModal';
import { MultiSelect } from '../components/MultiSelect';
import { PrintOrdemModal } from '../components/PrintOrdemModal';
import { ProblemaModal } from '../components/ProblemaModal';
import { ServicoModal } from '../components/ServicoModal';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { formatCurrency } from '../utils/formatters';
import { addDaysToDateOnly, formatLocalDate, parseLocalDate, toDateOnly, todayLocalDate } from '../utils/dates';
import { WhatsAppService } from '../utils/whatsapp-service';
import { getUserObservations } from '../utils/template-service';
import { useAuth } from '../contexts/AuthContext';
import type { Cliente, Instrumento, Marca, OrdemServico, OSCondicaoPagamento, Problema, Servico } from '../types/database';

type FormaPagamento = 'credito' | 'debito' | 'pix' | 'dinheiro' | 'boleto' | 'a_definir';
type MomentoPagamento = 'agora' | 'retirada' | 'data';
type CondicaoPagamentoDraft = {
  id: string;
  valor: number;
  forma_pagamento: FormaPagamento;
  momento: MomentoPagamento;
  data_vencimento: string;
  status: 'pendente' | 'recebido';
  pagamento_id?: string;
  observacoes?: string;
};

function createPaymentCondition(overrides: Partial<CondicaoPagamentoDraft> = {}): CondicaoPagamentoDraft {
  return {
    id: crypto.randomUUID(),
    valor: 0,
    forma_pagamento: 'pix',
    momento: 'retirada',
    data_vencimento: '',
    status: 'pendente',
    ...overrides,
  };
}
type AcaoAposSalvar = 'nenhuma' | 'mensagem' | 'pdf';
type AgendaOrder = Pick<OrdemServico, 'id' | 'numero' | 'modelo' | 'data_previsao' | 'status'> & {
  cliente?: Pick<Cliente, 'nome'> | null;
  instrumento?: Pick<Instrumento, 'nome'> | null;
  marca?: Pick<Marca, 'nome'> | null;
};

const steps = [
  { number: 1, title: 'Cliente e equipamento', description: 'Cliente, marca, modelo e acessórios' },
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

function normalizeDescriptions(value: unknown): Record<string, string> {
  if (!value) return {};

  let parsedValue = value;
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (typeof parsedValue !== 'object' || Array.isArray(parsedValue)) return {};

  return Object.fromEntries(
    Object.entries(parsedValue as Record<string, unknown>)
      .filter(([, description]) => typeof description === 'string')
      .map(([itemId, description]) => [itemId, (description as string).trim()]),
  );
}

function selectedDescriptions(ids: string[], descriptions: Record<string, string>) {
  return Object.fromEntries(
    ids
      .filter((itemId) => Object.prototype.hasOwnProperty.call(descriptions, itemId))
      .map((itemId) => [itemId, descriptions[itemId].trim()]),
  );
}

function itemDescription(descriptions: Record<string, string>, itemId: string, defaultDescription?: string) {
  if (Object.prototype.hasOwnProperty.call(descriptions, itemId)) {
    return descriptions[itemId].trim();
  }
  return defaultDescription?.trim() || '';
}

export function NovaOrdem() {
  const { can } = useAuth();
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
  const [condicoesPagamento, setCondicoesPagamento] = useState<CondicaoPagamentoDraft[]>([createPaymentCondition()]);
  const [dataPrevisao, setDataPrevisao] = useState('');
  const [observacoes, setObservacoes] = useState('Pagamento Antecipado!');
  const [acaoAposSalvar, setAcaoAposSalvar] = useState<AcaoAposSalvar>('mensagem');
  const [loading, setLoading] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showInstrumentoModal, setShowInstrumentoModal] = useState(false);
  const [showMarcaModal, setShowMarcaModal] = useState(false);
  const [showProblemaModal, setShowProblemaModal] = useState(false);
  const [showServicoModal, setShowServicoModal] = useState(false);
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
  const totalPlanejado = useMemo(
    () => condicoesPagamento.reduce((sum, condition) => sum + Number(condition.valor || 0), 0),
    [condicoesPagamento],
  );
  const totalRecebido = useMemo(
    () => condicoesPagamento
      .filter((condition) => condition.status === 'recebido' || condition.momento === 'agora')
      .reduce((sum, condition) => sum + Number(condition.valor || 0), 0),
    [condicoesPagamento],
  );
  const diferencaPlanejamento = Number((total - totalPlanejado).toFixed(2));

  useEffect(() => {
    if (id || total <= 0) return;
    setCondicoesPagamento((current) => {
      if (current.length !== 1 || current[0].status === 'recebido' || Number(current[0].valor || 0) !== 0) return current;
      return [{ ...current[0], valor: total }];
    });
  }, [id, total]);

  function updatePaymentCondition(conditionId: string, updates: Partial<CondicaoPagamentoDraft>) {
    setCondicoesPagamento((current) => current.map((condition) => condition.id === conditionId ? { ...condition, ...updates } : condition));
  }

  function addPaymentCondition() {
    setCondicoesPagamento((current) => [
      ...current,
      createPaymentCondition({
        valor: Math.max(0, Number((total - current.reduce((sum, condition) => sum + Number(condition.valor || 0), 0)).toFixed(2))),
        data_vencimento: dataPrevisao,
      }),
    ]);
  }

  function removePaymentCondition(conditionId: string) {
    setCondicoesPagamento((current) => current.filter((condition) => condition.id !== conditionId));
  }

  function adjustPaymentPlanBalance() {
    setCondicoesPagamento((current) => {
      const editable = [...current].reverse().find((condition) => condition.status !== 'recebido');
      if (!editable) return current;
      return current.map((condition) => condition.id === editable.id
        ? { ...condition, valor: Math.max(0, Number((Number(condition.valor || 0) + diferencaPlanejamento).toFixed(2))) }
        : condition);
    });
  }
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
      setProblemasDescricoes(normalizeDescriptions(data.problemas_descricoes));
      setServicosIds(data.servicos_ids || []);
      setServicosDescricoes(normalizeDescriptions(data.servicos_descricoes));
      setValorServicos(Number(data.valor_servicos || 0));
      setDesconto(Number(data.desconto || 0));
      setObservacoes(getUserObservations(data.observacoes));
      setDataPrevisao(data.data_previsao ? dateForDatabase(data.data_previsao) : '');

      const { data: paymentConditions, error: conditionsError } = await supabase
        .from('os_condicoes_pagamento')
        .select('*')
        .eq('ordem_servico_id', orderId)
        .neq('status', 'cancelado')
        .order('ordem', { ascending: true });
      if (conditionsError) throw conditionsError;
      if (paymentConditions?.length) {
        setCondicoesPagamento(paymentConditions.map((condition: OSCondicaoPagamento) => ({
          id: condition.id,
          valor: Number(condition.valor || 0),
          forma_pagamento: (condition.forma_pagamento || 'a_definir') as FormaPagamento,
          momento: condition.momento,
          data_vencimento: condition.data_vencimento ? dateForDatabase(condition.data_vencimento) : '',
          status: condition.status === 'recebido' ? 'recebido' : 'pendente',
          pagamento_id: condition.pagamento_id,
          observacoes: condition.observacoes,
        })));
      } else {
        setCondicoesPagamento([createPaymentCondition({
          valor: Number(data.valor_total ?? (Number(data.valor_servicos || 0) - Number(data.desconto || 0))),
          forma_pagamento: ['credito', 'debito', 'pix', 'dinheiro', 'boleto'].includes(data.forma_pagamento) ? data.forma_pagamento as FormaPagamento : 'a_definir',
          data_vencimento: data.data_previsao ? dateForDatabase(data.data_previsao) : '',
        })]);
      }
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
        const description = itemDescription(problemasDescricoes, problemId, problema.descricao);
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
        const description = itemDescription(servicosDescricoes, serviceId, servico.descricao);
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
    const { data: conditions, error: conditionsError } = await supabase
      .from('os_condicoes_pagamento')
      .select('*')
      .eq('ordem_servico_id', orderId)
      .neq('status', 'cancelado')
      .order('ordem', { ascending: true });
    if (conditionsError) throw conditionsError;
    return { ...data, condicoes_pagamento: conditions || [] } as OrdemServico;
  }

  function getAuthHeaders() {
    const sessionRaw = localStorage.getItem('mysql-auth-session');
    const token = sessionRaw ? JSON.parse(sessionRaw)?.access_token : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canGoNext) {
      toast.error('Revise os campos obrigatórios desta etapa.');
      return;
    }
    if (total > 0 && !condicoesPagamento.length) {
      toast.error('Adicione ao menos uma condição de pagamento.');
      return;
    }
    if (Math.round(totalPlanejado * 100) !== Math.round(total * 100)) {
      toast.error(`As condições somam ${formatCurrency(totalPlanejado)}, mas o total da OS é ${formatCurrency(total)}.`);
      return;
    }
    if (condicoesPagamento.some((condition) => condition.momento === 'data' && !condition.data_vencimento)) {
      toast.error('Informe a data de vencimento das condições programadas.');
      return;
    }
    if (!can('financeiro.write') && condicoesPagamento.some((condition) => condition.status !== 'recebido' && condition.momento === 'agora')) {
      toast.error('Seu perfil não pode confirmar valores recebidos.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const selectedMethods = [...new Set(condicoesPagamento.map((condition) => condition.forma_pagamento).filter((method) => method !== 'a_definir'))];
      const paymentMethod = selectedMethods.length > 1 ? 'misto' : selectedMethods[0] || 'a_definir';

      const ordemData = {
        ...(id && { id }),
        ...(!id && { status: 'pendente' as const, data_entrada: todayForDatabase() }),
        cliente_id: clienteId,
        instrumento_id: instrumentoId,
        marca_id: marcaId,
        modelo: modelo.trim(),
        acessorios,
        problemas_ids: problemasIds,
        problemas_descricoes: selectedDescriptions(problemasIds, problemasDescricoes),
        problema_descricao: buildProblemsText(),
        servicos_ids: servicosIds,
        servicos_descricoes: selectedDescriptions(servicosIds, servicosDescricoes),
        servico_descricao: buildServicesText(),
        valor_servicos: Number(valorServicos || 0),
        desconto: Number(desconto || 0),
        valor_total: total,
        forma_pagamento: paymentMethod,
        observacoes: getUserObservations(observacoes),
        data_previsao: dateForDatabase(dataPrevisao),
        user_id: user.id,
      };

      const response = await fetch('/api/ordens/salvar', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ordem: ordemData,
          condicoes_pagamento: condicoesPagamento.map((condition) => ({
            id: condition.id,
            valor: Number(condition.valor || 0),
            forma_pagamento: condition.forma_pagamento,
            momento: condition.momento,
            data_vencimento: condition.momento === 'data' ? dateForDatabase(condition.data_vencimento) : null,
            status: condition.status,
            observacoes: condition.observacoes || null,
          })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao salvar ordem e pagamentos');
      const savedId = result.data?.id;

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
                  <h2 className="text-lg font-semibold text-gray-950">Cliente e equipamento</h2>
                  <p className="text-sm text-gray-500">Selecione ou cadastre o cliente e identifique o equipamento.</p>
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
                <Field label="Equipamento *">
                  <Autocomplete options={instrumentos} value={instrumentoId} onChange={(value) => setInstrumentoId(value as string)} onCreateNew={() => setShowInstrumentoModal(true)} placeholder="Selecione o equipamento" />
                </Field>
                <Field label="Marca *">
                  <Autocomplete options={marcas} value={marcaId} onChange={(value) => setMarcaId(value as string)} onCreateNew={() => setShowMarcaModal(true)} placeholder="Selecione a marca" />
                </Field>
                <Field label="Modelo *">
                  <input value={modelo} onChange={(event) => setModelo(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" placeholder="Ex: Cavaquinho Luthier Ferreira" />
                </Field>
              </div>
              <Field label="Acessórios do equipamento">
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
                  label="Problemas do equipamento"
                  options={problemas}
                  selectedIds={problemasIds}
                  onChange={setProblemasIds}
                  descriptions={problemasDescricoes}
                  onDescriptionChange={(problemId, description) => setProblemasDescricoes((current) => ({ ...current, [problemId]: description }))}
                  getInitialDescription={(problemId) => problemas.find((item) => item.id === problemId)?.descricao || ''}
                  onCreateNew={() => setShowProblemaModal(true)}
                  createNewLabel="Cadastrar novo problema"
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
                  onCreateNew={() => setShowServicoModal(true)}
                  createNewLabel="Cadastrar nova solução / serviço"
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
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Condições de pagamento</p>
                        <p className="text-xs text-gray-500">Separe entrada, formas e saldo da retirada.</p>
                      </div>
                      <button type="button" onClick={addPaymentCondition} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                        <Plus className="h-3.5 w-3.5" /> Adicionar
                      </button>
                    </div>

                    <div className="space-y-3">
                      {condicoesPagamento.map((condition, index) => {
                        const locked = condition.status === 'recebido';
                        return (
                          <div key={condition.id} className={`rounded-xl border p-3 ${locked ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-600">Pagamento {index + 1}</span>
                              <div className="flex items-center gap-2">
                                {locked && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Recebido</span>}
                                {!locked && condicoesPagamento.length > 1 && (
                                  <button type="button" onClick={() => removePaymentCondition(condition.id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remover pagamento ${index + 1}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="text-xs font-medium text-gray-600">
                                Forma
                                <select disabled={locked} value={condition.forma_pagamento} onChange={(event) => updatePaymentCondition(condition.id, { forma_pagamento: event.target.value as FormaPagamento })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70">
                                  <option value="pix">PIX</option>
                                  <option value="debito">Débito</option>
                                  <option value="credito">Crédito</option>
                                  <option value="dinheiro">Dinheiro</option>
                                  <option value="boleto">Boleto</option>
                                  <option value="a_definir">Definir depois</option>
                                </select>
                              </label>
                              <label className="text-xs font-medium text-gray-600">
                                Valor
                                <input disabled={locked} type="number" min="0.01" step="0.01" value={condition.valor || ''} onChange={(event) => updatePaymentCondition(condition.id, { valor: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70" />
                              </label>
                              <label className="text-xs font-medium text-gray-600 sm:col-span-2">
                                Quando
                                <select disabled={locked} value={condition.momento} onChange={(event) => updatePaymentCondition(condition.id, { momento: event.target.value as MomentoPagamento })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70">
                                  {can('financeiro.write') && <option value="agora">Recebido agora</option>}
                                  <option value="retirada">Na retirada / entrega</option>
                                  <option value="data">Em uma data específica</option>
                                </select>
                              </label>
                              {condition.momento === 'data' && (
                                <label className="text-xs font-medium text-gray-600 sm:col-span-2">
                                  Vencimento
                                  <input disabled={locked} type="date" value={condition.data_vencimento} onChange={(event) => updatePaymentCondition(condition.id, { data_vencimento: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70" />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                      <div className="flex justify-between text-gray-600"><span>Total da OS</span><strong>{formatCurrency(total)}</strong></div>
                      <div className="mt-1 flex justify-between text-emerald-700"><span>Recebido</span><strong>{formatCurrency(totalRecebido)}</strong></div>
                      <div className="mt-1 flex justify-between text-amber-700"><span>A receber</span><strong>{formatCurrency(Math.max(0, total - totalRecebido))}</strong></div>
                      <div className={`mt-2 flex items-center justify-between border-t pt-2 ${diferencaPlanejamento === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        <span>{diferencaPlanejamento === 0 ? 'Planejamento conferido' : diferencaPlanejamento > 0 ? 'Falta distribuir' : 'Valor excedente'}</span>
                        <div className="flex items-center gap-2">
                          <strong>{formatCurrency(Math.abs(diferencaPlanejamento))}</strong>
                          {diferencaPlanejamento !== 0 && <button type="button" onClick={adjustPaymentPlanBalance} className="rounded-md bg-violet-50 px-2 py-1 font-semibold text-violet-700">Ajustar</button>}
                        </div>
                      </div>
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
      <ProblemaModal isOpen={showProblemaModal} onClose={() => setShowProblemaModal(false)} onSuccess={() => { carregarDados(); setShowProblemaModal(false); }} />
      <ServicoModal isOpen={showServicoModal} onClose={() => setShowServicoModal(false)} onSuccess={() => { carregarDados(); setShowServicoModal(false); }} />

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
