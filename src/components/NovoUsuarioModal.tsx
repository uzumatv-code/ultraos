import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, KeyRound, Loader2, ShieldCheck, UserRound, Power } from 'lucide-react';
import { toast } from './ToastCustom';

interface NovoUsuarioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TeamUser {
  id: string;
  email: string;
  nome?: string;
  nivel: 'operador' | 'admin';
  ativo: number | boolean;
}

export function NovoUsuarioModal({ isOpen, onClose }: NovoUsuarioModalProps) {
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [nivel, setNivel] = useState<'operador' | 'admin'>('operador');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const authHeaders = useCallback(() => {
    const session = JSON.parse(localStorage.getItem('mysql-auth-session') || 'null');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  const carregarUsuarios = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/usuarios', { headers: authHeaders() });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao carregar equipe');
      setTeamUsers(result.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar equipe');
    } finally {
      setLoadingUsers(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (isOpen) void carregarUsuarios();
  }, [carregarUsuarios, isOpen]);

  async function atualizarUsuario(user: TeamUser, updates: Partial<Pick<TeamUser, 'nivel' | 'ativo'>>) {
    try {
      const response = await fetch(`/api/admin/usuarios/${user.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao atualizar usuário');
      toast.success('Acesso atualizado');
      await carregarUsuarios();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar usuário');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (senha !== confirmarSenha) {
      toast.error('As senhas não coincidem');
      return;
    }

    if (senha.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ nome, email, password: senha, nivel }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao criar usuário');

      toast.success('Usuário criado com sucesso!');
      limparFormulario();
      await carregarUsuarios();
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar usuário. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function limparFormulario() {
    setEmail('');
    setNome('');
    setNivel('operador');
    setSenha('');
    setConfirmarSenha('');
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[calc(100dvh-1rem)] relative overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  Gerenciar equipe
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Acessos da empresa</h3>
                  <span className="text-xs text-slate-500">{teamUsers.length} usuário(s)</span>
                </div>
                {loadingUsers ? (
                  <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-purple-600" /></div>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {teamUsers.map((teamUser) => (
                      <div key={teamUser.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="rounded-lg bg-purple-50 p-2 text-purple-700">
                            {teamUser.nivel === 'admin' ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{teamUser.nome || teamUser.email}</p>
                            <p className="truncate text-xs text-slate-500">{teamUser.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={teamUser.nivel}
                            onChange={(event) => void atualizarUsuario(teamUser, { nivel: event.target.value as TeamUser['nivel'] })}
                            className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                          >
                            <option value="operador">Operador</option>
                            <option value="admin">Administrador</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void atualizarUsuario(teamUser, { ativo: !teamUser.ativo })}
                            className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium ${teamUser.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                            title={teamUser.ativo ? 'Desativar acesso' : 'Ativar acesso'}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {teamUser.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <h3 className="mb-3 text-sm font-semibold text-slate-800">Adicionar usuário</h3>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
                    placeholder="Nome do funcionário"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      placeholder="Digite o email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      placeholder="Digite a senha"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar Senha
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="password"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      placeholder="Confirme a senha"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nível de acesso</label>
                  <select
                    value={nivel}
                    onChange={(e) => setNivel(e.target.value as 'operador' | 'admin')}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="operador">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Operadores não acessam financeiro, contas a pagar, NFS-e ou configurações administrativas.</p>
                </div>

                <div className="flex justify-end space-x-3 pt-4 sm:col-span-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 relative"
                  >
                    <span className={loading ? 'invisible' : 'visible'}>
                      Criar Usuário
                    </span>
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
