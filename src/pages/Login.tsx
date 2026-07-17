import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, Mail, Music2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';

const REMEMBERED_LOGIN_KEY = 'ultraos-remembered-login-email';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [memorizarLogin, setMemorizarLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rememberedEmail = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setMemorizarLogin(true);
    }
    checkUser();
  }, [navigate]);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && session?.user?.aud) {
        navigate('/dashboard');
      }
    } catch (error: any) {
      if (error.message === 'Sessão inválida') {
        await supabase.auth.signOut();
      } else if (!error.message?.includes('Failed to fetch')) {
        toast.error('Erro ao verificar sessão');
      }
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      
      // Clear any existing session first
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) throw error;
      
      if (!data.session || !data.user) {
        throw new Error('Login bem-sucedido mas sem sessão/usuário retornado');
      }
      
      if (memorizarLogin) {
        localStorage.setItem(REMEMBERED_LOGIN_KEY, email.trim().toLowerCase());
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      }

      navigate('/dashboard');
      toast.success('Bem-vindo de volta! 👋');
    } catch (error: any) {
      if (error.message?.includes('Invalid login credentials')) {
        toast.error('Email ou senha incorretos');
        return;
      }
      
      if (error.message?.includes('too many')) {
        toast.error('Muitas tentativas de login. Tente novamente em alguns minutos.');
        return;
      }
      
      if (error.message?.includes('Email not confirmed')) {
        toast.error('Email não confirmado. Verifique sua caixa de entrada.');
        return;
      }
      
      // Mostrar erro mais específico
      toast.error(`Erro no login: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6">
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-violet-100/70 to-transparent dark:from-violet-950/25" />
      {/* Círculos decorativos animados com blur */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.15 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-700/10 sm:h-96 sm:w-96"
      />
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.15 }}
        transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
        className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-blue-300/15 blur-3xl dark:bg-blue-700/10 sm:h-96 sm:w-96"
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="login-card relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-glass-lg dark:border-slate-800 dark:bg-slate-900 sm:p-8"
      >
        {/* Logo animado */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.8, bounce: 0.5 }}
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-600/20"
        >
          <Music2 className="h-8 w-8 text-white" />
        </motion.div>

        {/* Título */}
        <div className="mb-7 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="login-text mb-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white"
          >
            Bem-vindo de volta
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="login-subtitle text-sm text-slate-500 dark:text-slate-400"
          >
            Faça login para continuar
          </motion.p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-2"
          >
            <label htmlFor="login-email" className="app-label login-text">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-500 h-5 w-5" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="app-field login-input min-h-12 pl-11 pr-4 text-base"
                placeholder="seu@email.com" 
                required
              />
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-2"
          >
            <label htmlFor="login-password" className="app-label login-text">Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-500 h-5 w-5" />
              <input
                id="login-password"
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                className="app-field login-input min-h-12 pl-11 pr-12 text-base"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((current) => !current)}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-violet-700 dark:hover:bg-slate-800 dark:hover:text-violet-300"
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </motion.div>

          <motion.label
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.65 }}
            className="login-text flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <input
              type="checkbox"
              checked={memorizarLogin}
              onChange={(e) => setMemorizarLogin(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-800"
            />
            <span>Memorizar email</span>
          </motion.label>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="relative min-h-12 w-full rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className={`relative z-10 ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity`}>
              Entrar
            </span>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}
