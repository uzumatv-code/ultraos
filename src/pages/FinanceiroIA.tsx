import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle, History, Plus, Save, Shield, Trash2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import type { FinanceiroIAAutorizado, FinanceiroIALog } from '../types/database';

const emptyForm = {
  nome: '',
  telefone: '',
  permissao: 'consulta' as FinanceiroIAAutorizado['permissao'],
  nivel_acesso: 'operador' as FinanceiroIAAutorizado['nivel_acesso'],
  ativo: true
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

export function FinanceiroIA() {
  const [authorized, setAuthorized] = useState<FinanceiroIAAutorizado[]>([]);
  const [logs, setLogs] = useState<FinanceiroIALog[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeCount = useMemo(() => authorized.filter((item) => item.ativo).length, [authorized]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: authData, error: authError }, { data: logData, error: logError }] = await Promise.all([
        supabase
          .from('financeiro_ia_autorizados')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('financeiro_ia_logs')
          .select('*, autorizado:financeiro_ia_autorizados(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (authError) throw authError;
      if (logError) throw logError;
      setAuthorized(authData || []);
      setLogs(logData || []);
    } catch (error) {
      console.error('Erro ao carregar IA do sistema:', error);
      toast.error('Erro ao carregar configuracoes da IA do sistema');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function startEdit(item: FinanceiroIAAutorizado) {
    setEditingId(item.id);
    setForm({
      nome: item.nome,
      telefone: item.telefone,
      permissao: item.permissao,
      nivel_acesso: item.nivel_acesso,
      ativo: Boolean(item.ativo)
    });
  }

  async function saveNumber(event: React.FormEvent) {
    event.preventDefault();
    const phone = normalizePhone(form.telefone);
    if (phone.length < 10 || phone.length > 13) {
      toast.error('Informe um telefone valido com DDD');
      return;
    }
    if (!editingId && authorized.length >= 5) {
      toast.error('Limite de 5 numeros autorizados atingido');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario nao autenticado');

      const payload = {
        nome: form.nome.trim(),
        telefone: phone,
        permissao: form.permissao,
        nivel_acesso: form.nivel_acesso,
        ativo: form.ativo,
        updated_at: new Date().toISOString(),
        ...(!editingId ? { user_id: user.id, created_at: new Date().toISOString() } : {})
      };

      const { error } = editingId
        ? await supabase.from('financeiro_ia_autorizados').update(payload).eq('id', editingId).eq('user_id', user.id)
        : await supabase.from('financeiro_ia_autorizados').insert([payload]);

      if (error) throw error;
      toast.success('Numero autorizado salvo');
      setForm(emptyForm);
      setEditingId(null);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar numero autorizado:', error);
      toast.error('Erro ao salvar numero autorizado');
    }
  }

  async function removeNumber(item: FinanceiroIAAutorizado) {
    const result = await alerts.confirm({
      title: 'Remover numero',
      text: `Remover ${item.nome} da IA do sistema?`,
      icon: 'warning'
    });
    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from('financeiro_ia_autorizados')
        .delete()
        .eq('id', item.id);
      if (error) throw error;
      toast.success('Numero removido');
      loadData();
    } catch (error) {
      console.error('Erro ao remover numero:', error);
      toast.error('Erro ao remover numero');
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 dark:bg-gray-950">
      <div className="responsive-page">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Automacao do sistema</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-950 dark:text-white">IA do Sistema via WhatsApp</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            <Shield className="h-4 w-4" />
            {activeCount}/5 ativos
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <form onSubmit={saveNumber} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">{editingId ? 'Editar numero' : 'Novo numero'}</h2>
              {editingId ? (
                <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <XCircle className="h-5 w-5" />
                </button>
              ) : <Plus className="h-5 w-5 text-gray-400" />}
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome</span>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefone</span>
                <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required placeholder="61999999999" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Permissao</span>
                  <select value={form.permissao} onChange={(e) => setForm({ ...form, permissao: e.target.value as any })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white">
                    <option value="consulta">Consulta</option>
                    <option value="escrita">Escrita</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nivel</span>
                  <select value={form.nivel_acesso} onChange={(e) => setForm({ ...form, nivel_acesso: e.target.value as any })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white">
                    <option value="operador">Operador</option>
                    <option value="gerente">Gerente</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                <span className="font-medium text-gray-700 dark:text-gray-300">Ativo</span>
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              </label>
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950">
                <Save className="h-4 w-4" />
                Salvar
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-950 dark:text-white">
                <Bot className="h-5 w-5" />
                Numeros autorizados
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <p className="p-5 text-sm text-gray-500">Carregando...</p>
              ) : authorized.length === 0 ? (
                <p className="p-5 text-sm text-gray-500">Nenhum numero autorizado.</p>
              ) : authorized.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-950 dark:text-white">{item.nome}</p>
                      {item.ativo ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-gray-400" />}
                    </div>
                    <p className="text-sm text-gray-500">{item.telefone} - {item.permissao} - {item.nivel_acesso}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => startEdit(item)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">Editar</button>
                    <button onClick={() => removeNumber(item)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-950 dark:text-white">
              <History className="h-5 w-5" />
              Historico de acoes
            </h2>
          </div>
          <div className="responsive-table-wrap">
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500 dark:bg-gray-950">
                <tr>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Telefone</th>
                  <th className="px-5 py-3">Intencao</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Mensagem</th>
                  <th className="px-5 py-3">Resposta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500">Sem logs ainda.</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-4 text-sm">{log.telefone}</td>
                    <td className="px-5 py-4 text-sm">{log.intencao || '-'}</td>
                    <td className="px-5 py-4 text-sm">{log.status}</td>
                    <td className="max-w-xs truncate px-5 py-4 text-sm">{log.mensagem || '-'}</td>
                    <td className="max-w-xs truncate px-5 py-4 text-sm">{log.resposta || log.erro || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
