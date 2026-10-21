import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, MapPin, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { apiRequest } from '../lib/api-client';

type StatusPedido = 'aguardando_pagamento' | 'pago' | 'em_separacao' | 'enviado' | 'entregue' | 'cancelado' | 'reembolsado' | 'expirado';

interface Pedido {
  id: string; numero: number; status: StatusPedido; comprador_nome: string | null; comprador_email: string | null; comprador_telefone: string | null;
  subtotal: number; frete: number; total: number; entrega_tipo: 'digital' | 'retirada' | 'envio'; forma_pagamento: string | null;
  frete_servico: { nome?: string; prazo_dias?: number } | null;
  endereco: { destinatario: string; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string } | null;
  rastreio_codigo: string | null; rastreio_url: string | null; observacoes: string | null; created_at: string; pago_em: string | null;
  itens: { id: string; titulo: string; tipo: string; quantidade: number; preco_unit: number }[];
}

const STATUS: Record<StatusPedido, { label: string; tone: string }> = {
  aguardando_pagamento: { label: 'Aguardando pagamento', tone: 'bg-slate-100 text-slate-600' },
  pago: { label: 'Pago', tone: 'bg-violet-50 text-violet-700' },
  em_separacao: { label: 'Em separação', tone: 'bg-sky-50 text-sky-700' },
  enviado: { label: 'Enviado', tone: 'bg-indigo-50 text-indigo-700' },
  entregue: { label: 'Entregue', tone: 'bg-emerald-50 text-emerald-700' },
  cancelado: { label: 'Cancelado', tone: 'bg-rose-50 text-rose-700' },
  reembolsado: { label: 'Reembolsado', tone: 'bg-amber-50 text-amber-700' },
  expirado: { label: 'Expirado', tone: 'bg-slate-100 text-slate-400' },
};
const FILTROS: { id: string; label: string }[] = [
  { id: 'abertos', label: 'Para enviar' },
  { id: '', label: 'Todos' },
  { id: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { id: 'enviado', label: 'Enviados' },
  { id: 'entregue', label: 'Entregues' },
];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function PedidoCard({ pedido, onMudou }: { pedido: Pedido; onMudou: () => void }) {
  const [rastreio, setRastreio] = useState(pedido.rastreio_codigo || '');
  const [busy, setBusy] = useState(false);

  async function mudar(status: StatusPedido) {
    if (status === 'cancelado') {
      const ok = await alerts.confirm({
        title: `Cancelar o pedido #${pedido.numero}?`,
        text: pedido.status === 'aguardando_pagamento'
          ? 'O pedido ainda não foi pago; a reserva da peça é liberada.'
          : 'O estoque volta e o acesso a cursos e ebooks é retirado. O estorno do dinheiro é feito no Mercado Pago.',
        icon: 'warning', confirmButtonText: 'Cancelar pedido', cancelButtonText: 'Voltar',
      });
      if (!ok.isConfirmed) return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/loja-admin/pedidos/${pedido.id}/status`, {
        method: 'PUT', body: JSON.stringify({ status, rastreio_codigo: rastreio.trim() || undefined }),
      });
      toast.success(`Pedido #${pedido.numero}: ${STATUS[status].label.toLowerCase()}`);
      onMudou();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível atualizar o pedido');
    } finally {
      setBusy(false);
    }
  }

  const e = pedido.endereco;
  const aberto = ['pago', 'em_separacao'].includes(pedido.status);
  return (
    <Card hover={false} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-slate-950 dark:text-white">Pedido #{pedido.numero}</p>
          <p className="text-sm text-slate-500">{pedido.comprador_nome || '—'} · {pedido.comprador_telefone || pedido.comprador_email || ''}</p>
          <p className="text-xs text-slate-400">Feito em {data(pedido.created_at)}{pedido.pago_em ? ` · pago em ${data(pedido.pago_em)}` : ''}{pedido.forma_pagamento ? ` · ${pedido.forma_pagamento}` : ''}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[pedido.status].tone}`}>{STATUS[pedido.status].label}</span>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {pedido.itens.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 py-1.5">
            <span className="text-slate-700 dark:text-slate-300">{i.quantidade}× {i.titulo}{i.tipo !== 'fisico' ? ` (${i.tipo})` : ''}</span>
            <span className="font-medium text-slate-900 dark:text-white">{brl(i.preco_unit * i.quantidade)}</span>
          </li>
        ))}
        {pedido.frete > 0 && <li className="flex justify-between py-1.5"><span className="text-slate-500">Frete {pedido.frete_servico?.nome ? `(${pedido.frete_servico.nome})` : ''}</span><span>{brl(pedido.frete)}</span></li>}
        <li className="flex justify-between py-1.5 font-bold text-slate-950 dark:text-white"><span>Total</span><span>{brl(pedido.total)}</span></li>
      </ul>

      {pedido.entrega_tipo === 'envio' && e && (
        <p className="mt-3 flex gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <span>{e.destinatario} · {e.logradouro}, {e.numero}{e.complemento ? ` (${e.complemento})` : ''} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}</span>
        </p>
      )}
      {pedido.entrega_tipo === 'retirada' && <p className="mt-3 text-sm font-semibold text-violet-700">Cliente vai retirar na loja.</p>}
      {pedido.observacoes && <p className="mt-2 text-sm text-amber-700">{pedido.observacoes}</p>}
      {pedido.rastreio_codigo && !aberto && <p className="mt-2 text-sm text-slate-500">Rastreio: <span className="font-mono">{pedido.rastreio_codigo}</span></p>}

      {aberto && pedido.entrega_tipo !== 'digital' && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {pedido.entrega_tipo === 'envio' && (
            <input
              value={rastreio}
              onChange={(ev) => setRastreio(ev.target.value.toUpperCase())}
              placeholder="Código de rastreio"
              aria-label="Código de rastreio"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm sm:w-56 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {pedido.status === 'pago' && <Button size="sm" variant="secondary" icon={ClipboardList} disabled={busy} onClick={() => void mudar('em_separacao')}>Em separação</Button>}
            {pedido.entrega_tipo === 'envio'
              ? <Button size="sm" icon={Truck} disabled={busy} onClick={() => void mudar('enviado')}>Marcar como enviado</Button>
              : <Button size="sm" icon={PackageCheck} disabled={busy} onClick={() => void mudar('entregue')}>Cliente retirou</Button>}
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void mudar('cancelado')}>Cancelar</Button>
          </div>
        </div>
      )}
      {pedido.status === 'enviado' && (
        <div className="mt-4"><Button size="sm" variant="secondary" icon={PackageCheck} disabled={busy} onClick={() => void mudar('entregue')}>Marcar como entregue</Button></div>
      )}
      {pedido.status === 'aguardando_pagamento' && (
        <div className="mt-4"><Button size="sm" variant="danger" disabled={busy} onClick={() => void mudar('cancelado')}>Cancelar pedido</Button></div>
      )}
    </Card>
  );
}

export function LojaPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState('abertos');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = filtro && filtro !== 'abertos' ? `?status=${filtro}` : '';
      const r = await apiRequest<{ pedidos: Pedido[] }>(`/api/loja-admin/pedidos${query}`);
      setPedidos(filtro === 'abertos' ? r.pedidos.filter((p) => ['pago', 'em_separacao'].includes(p.status) && p.entrega_tipo !== 'digital') : r.pedidos);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar os pedidos');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageContainer
      title="Pedidos da loja"
      description="Compras feitas no site. Pagamentos confirmados pelo Mercado Pago aparecem aqui sozinhos; cursos e ebooks são liberados na hora."
      eyebrow="Loja"
      icon={ClipboardList}
      actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()}>Atualizar</Button>}
    >
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar pedidos">
        {FILTROS.map((f) => (
          <button key={f.id || 'todos'} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filtro === f.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Carregando…</p>
      ) : pedidos.length === 0 ? (
        <Card hover={false} className="p-6 text-center text-sm text-slate-500">{filtro === 'abertos' ? 'Nenhum pedido esperando envio.' : 'Nenhum pedido aqui.'}</Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pedidos.map((p) => <PedidoCard key={p.id} pedido={p} onMudou={() => void load()} />)}
        </div>
      )}
    </PageContainer>
  );
}
