import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, GitMerge, RefreshCw } from 'lucide-react';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { apiRequest } from '../lib/api-client';

interface ClienteDup {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  created_at: string | null;
  ordens: number;
}

interface Grupo {
  motivo: 'cpf' | 'telefone' | 'telefone_nomes_diferentes';
  sugerido_id: string;
  clientes: ClienteDup[];
}

const MOTIVOS: Record<Grupo['motivo'], { label: string; tone: string; ajuda: string }> = {
  cpf: { label: 'Mesmo CPF', tone: 'bg-emerald-50 text-emerald-700', ajuda: 'Mesmo CPF: é a mesma pessoa.' },
  telefone: { label: 'Mesmo telefone', tone: 'bg-sky-50 text-sky-700', ajuda: 'Mesmo telefone e nomes compatíveis.' },
  telefone_nomes_diferentes: { label: 'Telefone igual, nomes diferentes', tone: 'bg-amber-50 text-amber-700', ajuda: 'Pode ser a mesma pessoa ou alguém da família usando o mesmo número. Confira antes de unir.' },
};

function chave(grupo: Grupo) {
  return grupo.clientes.map((c) => c.id).sort().join(',');
}

export function ClientesDuplicados() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [manter, setManter] = useState<Record<string, string>>({});
  const [incluir, setIncluir] = useState<Record<string, Set<string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ grupos: Grupo[]; total_clientes: number }>('/api/portal-admin/clientes-duplicados');
      setGrupos(data.grupos);
      setTotal(data.total_clientes);
      setManter(Object.fromEntries(data.grupos.map((g) => [chave(g), g.sugerido_id])));
      setIncluir(Object.fromEntries(data.grupos.map((g) => [chave(g), new Set(g.clientes.map((c) => c.id))])));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível procurar cadastros duplicados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function alternar(grupo: Grupo, id: string) {
    const k = chave(grupo);
    const atual = new Set(incluir[k]);
    if (atual.has(id)) atual.delete(id);
    else atual.add(id);
    setIncluir({ ...incluir, [k]: atual });
  }

  async function unir(grupo: Grupo) {
    const k = chave(grupo);
    const manterId = manter[k];
    const mesclar = [...(incluir[k] || [])].filter((id) => id !== manterId);
    const fica = grupo.clientes.find((c) => c.id === manterId);
    if (!fica || mesclar.length === 0) return toast.error('Escolha o cadastro que fica e pelo menos um para unir');
    const nomes = grupo.clientes.filter((c) => mesclar.includes(c.id)).map((c) => c.nome).join(', ');
    const confirmation = await alerts.confirm({
      title: `Unir em "${fica.nome}"?`,
      text: `As OS, orçamentos, pagamentos, conversas e preferências de ${nomes} passam para ${fica.nome}, e esses cadastros deixam de existir. Dados que faltam em ${fica.nome} (CPF, telefone, e-mail, endereço) são completados. Uma cópia dos cadastros removidos fica guardada na auditoria.`,
      icon: 'warning',
      confirmButtonText: 'Unir cadastros',
      cancelButtonText: 'Revisar',
    });
    if (!confirmation.isConfirmed) return;
    setBusy(k);
    try {
      await apiRequest('/api/portal-admin/clientes-duplicados/mesclar', {
        method: 'POST',
        body: JSON.stringify({ manter_id: manterId, mesclar_ids: mesclar }),
      });
      toast.success(`${mesclar.length + 1} cadastros unidos em ${fica.nome}`);
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível unir os cadastros');
    } finally {
      setBusy('');
    }
  }

  return (
    <PageContainer
      title="Cadastros duplicados"
      description="Clientes cadastrados mais de uma vez, encontrados pelo CPF ou pelo telefone. Nada é unido sem a sua confirmação."
      eyebrow="Clientes"
      icon={Copy}
      actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()}>Procurar de novo</Button>}
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Procurando entre os clientes…</p>
      ) : grupos.length === 0 ? (
        <Card hover={false} className="flex items-center gap-3 p-6">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <p className="text-slate-700 dark:text-slate-300">Nenhum cadastro duplicado entre {total} clientes.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{grupos.length} grupo{grupos.length > 1 ? 's' : ''} encontrado{grupos.length > 1 ? 's' : ''} entre {total} clientes. O cadastro sugerido para ficar é o que tem mais OS e dados mais completos.</p>
          {grupos.map((grupo) => {
            const k = chave(grupo);
            const motivo = MOTIVOS[grupo.motivo];
            return (
              <Card key={k} hover={false} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${motivo.tone}`}>{motivo.label}</span>
                  <span className="text-xs text-slate-500">{motivo.ajuda}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="py-2 pr-3">Fica</th><th className="py-2 pr-3">Unir</th><th className="py-2 pr-3">Nome</th><th className="py-2 pr-3">CPF</th><th className="py-2 pr-3">Telefone</th><th className="py-2 pr-3">E-mail</th><th className="py-2 pr-3">OS</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {grupo.clientes.map((c) => {
                        const fica = manter[k] === c.id;
                        return (
                          <tr key={c.id} className={fica ? 'bg-violet-50/60 dark:bg-slate-800/60' : ''}>
                            <td className="py-2.5 pr-3"><input type="radio" name={`manter-${k}`} aria-label={`Manter ${c.nome}`} checked={fica} onChange={() => setManter({ ...manter, [k]: c.id })} className="h-4 w-4 accent-violet-600" /></td>
                            <td className="py-2.5 pr-3"><input type="checkbox" aria-label={`Unir ${c.nome}`} checked={fica || incluir[k]?.has(c.id)} disabled={fica} onChange={() => alternar(grupo, c.id)} className="h-4 w-4 accent-violet-600" /></td>
                            <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-white">{c.nome}</td>
                            <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{c.cpf_cnpj || '—'}</td>
                            <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{c.telefone || '—'}</td>
                            <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{c.email || '—'}</td>
                            <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{c.ordens}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button icon={GitMerge} size="sm" disabled={busy === k} onClick={() => void unir(grupo)}>{busy === k ? 'Unindo' : 'Unir cadastros'}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
