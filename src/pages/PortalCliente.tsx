import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Globe, Link2Off, RefreshCw, Save, ShieldCheck, UserCheck } from 'lucide-react';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { apiRequest } from '../lib/api-client';

interface PortalConfig {
  portal_ativo: boolean;
  capacidade_diaria: number;
  integrado?: boolean;
}

interface PortalConta {
  id: string;
  email: string | null;
  nome: string | null;
  cpf: string;
  telefone: string;
  verificado_em: string | null;
  ultimo_acesso: string | null;
  created_at: string;
  clientes: { id: string; nome: string; origem: string }[];
}

const ORIGENS: Record<string, string> = {
  cpf_telefone: 'CPF e telefone',
  telefone: 'Telefone',
  novo_cadastro: 'Cadastro novo pelo site',
  painel: 'Painel',
};

function dataCurta(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function PortalCliente() {
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [contas, setContas] = useState<PortalConta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, lista] = await Promise.all([
        apiRequest<PortalConfig>('/api/portal-admin/config'),
        apiRequest<{ contas: PortalConta[] }>('/api/portal-admin/contas'),
      ]);
      setConfig(cfg);
      setContas(lista.contas);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar o portal do cliente');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function salvar() {
    if (!config) return;
    setSaving(true);
    try {
      const atualizado = await apiRequest<PortalConfig>('/api/portal-admin/config', {
        method: 'PUT',
        body: JSON.stringify({ portal_ativo: config.portal_ativo, capacidade_diaria: config.capacidade_diaria }),
      });
      setConfig({ ...config, ...atualizado });
      toast.success('Configuração do portal salva');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  }

  async function desvincular(conta: PortalConta, cliente: { id: string; nome: string }) {
    const confirmation = await alerts.confirm({
      title: 'Desfazer vínculo?',
      text: `${conta.nome || conta.email} deixará de ver os serviços de ${cliente.nome} no site. Para ver de novo, precisará confirmar CPF e telefone.`,
      icon: 'warning',
      confirmButtonText: 'Desfazer vínculo',
      cancelButtonText: 'Manter',
    });
    if (!confirmation.isConfirmed) return;
    try {
      await apiRequest(`/api/portal-admin/contas/${conta.id}/vinculos/${cliente.id}`, { method: 'DELETE' });
      toast.success('Vínculo desfeito');
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível desfazer o vínculo');
    }
  }

  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? contas.filter((c) => [c.nome, c.email, ...c.clientes.map((x) => x.nome)].some((v) => String(v || '').toLowerCase().includes(termo)))
    : contas;
  const verificadas = contas.filter((c) => c.verificado_em).length;

  return (
    <PageContainer
      title="Portal do cliente"
      description="Contas do site que acompanham as próprias OS, e a capacidade usada na temperatura da agenda."
      eyebrow="Relacionamento"
      icon={Globe}
      actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()}>Atualizar</Button>}
    >
      {config && !config.integrado && (
        <section className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-slate-800 dark:bg-slate-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            O site ainda não está conectado a esta conta. A área do cliente começa a funcionar quando <code>PORTAL_SHARED_SECRET</code> e <code>PORTAL_TENANT_EMAIL</code> (o e-mail de login da loja) estiverem configurados no servidor.
          </p>
        </section>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card hover={false} className="p-5">
          <h2 className="font-bold text-slate-950 dark:text-white">Configuração</h2>
          <p className="mt-1 text-sm text-slate-500">A temperatura da agenda divide as OS com entrega prevista em cada dia por esta capacidade.</p>
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">Área do cliente ligada</span>
                <span className="block text-xs text-slate-500">Desligue para pausar o acesso dos clientes pelo site.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-violet-600"
                checked={Boolean(config?.portal_ativo)}
                disabled={!config}
                onChange={(e) => config && setConfig({ ...config, portal_ativo: e.target.checked })}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">OS entregues por dia (capacidade)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={config?.capacidade_diaria ?? ''}
                disabled={!config}
                onChange={(e) => config && setConfig({ ...config, capacidade_diaria: Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <Button icon={Save} onClick={() => void salvar()} disabled={!config || saving} fullWidth>{saving ? 'Salvando' : 'Salvar configuração'}</Button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 self-start">
          <Card hover={false} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-medium text-slate-500">Contas no site</p><p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{loading ? '—' : contas.length}</p></div>
              <div className="rounded-xl bg-sky-50 p-2.5 text-sky-600"><UserCheck className="h-5 w-5" /></div>
            </div>
          </Card>
          <Card hover={false} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-medium text-slate-500">Verificadas</p><p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{loading ? '—' : verificadas}</p></div>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><ShieldCheck className="h-5 w-5" /></div>
            </div>
          </Card>
        </div>
      </div>

      <Card hover={false} className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-950 dark:text-white">Contas vinculadas</h2>
            <p className="text-sm text-slate-500">Cada conta Google vê só as OS dos cadastros listados ao lado dela.</p>
          </div>
          <input
            type="search"
            placeholder="Buscar por nome ou e-mail"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Nenhum cliente entrou pelo site ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-2 pr-4">Conta</th><th className="py-2 pr-4">CPF / telefone</th><th className="py-2 pr-4">Cadastros vinculados</th><th className="py-2 pr-4">Último acesso</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtradas.map((conta) => (
                  <tr key={conta.id} className="align-top">
                    <td className="py-3 pr-4"><p className="font-semibold text-slate-900 dark:text-white">{conta.nome || '—'}</p><p className="text-xs text-slate-500">{conta.email}</p></td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{conta.verificado_em ? <>{conta.cpf}<br />{conta.telefone}</> : <span className="text-amber-600">Ainda não verificou</span>}</td>
                    <td className="py-3 pr-4">
                      {conta.clientes.length === 0 ? <span className="text-slate-400">—</span> : (
                        <ul className="space-y-1">
                          {conta.clientes.map((cliente) => (
                            <li key={cliente.id} className="flex items-center gap-2">
                              <span className="text-slate-900 dark:text-white">{cliente.nome}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{ORIGENS[cliente.origem] || cliente.origem}</span>
                              <button type="button" title="Desfazer vínculo" aria-label={`Desfazer vínculo com ${cliente.nome}`} onClick={() => void desvincular(conta, cliente)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <Link2Off className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{dataCurta(conta.ultimo_acesso || conta.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
