import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from '../components/ToastCustom';

export function RedefinirSenha() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const token = params.get('token') || '';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return toast.error('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirmPassword) return toast.error('As senhas não coincidem.');

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Não foi possível redefinir a senha.');
      toast.success(result.message || 'Senha redefinida com sucesso.');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Definir nova senha</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Escolha uma senha forte com pelo menos 8 caracteres.</p>

        {!token ? (
          <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">O link de recuperação é inválido ou está incompleto.</p>
        ) : (
          <>
            <label className="mt-6 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="new-password">Nova senha</label>
            <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none ring-violet-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="confirm-password">Confirmar nova senha</label>
            <input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none ring-violet-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <button type="submit" disabled={loading} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Redefinir senha
            </button>
          </>
        )}
        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-300">Voltar ao login</Link>
      </form>
    </main>
  );
}
