import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, Mail, Music2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ToastCustom';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
    <div className="min-h-screen gradient-bg dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4 relative overflow-hidden login-page">
      {/* Círculos decorativos animados com blur */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.15 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary-400 to-accent-400 blur-3xl -top-1/4 -right-1/4"
      />
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.15 }}
        transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
        className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-br from-accent-400 to-primary-400 blur-3xl -bottom-1/4 -left-1/4"
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="glass dark:glass-dark p-10 rounded-3xl shadow-glass-lg w-full max-w-md relative z-10 login-card"
      >
        {/* Logo animado */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.8, bounce: 0.5 }}
          className="w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-glass"
        >
          <Music2 className="w-10 h-10 text-white drop-shadow-lg" />
        </motion.div>

        {/* Título */}
        <div className="text-center mb-8">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-4xl font-bold text-gradient mb-3 login-text"
          >
            Bem-vindo de volta
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-gray-600 dark:text-gray-400 login-subtitle"
          >
            Faça login para continuar
          </motion.p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-2"
          >
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 login-text">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-500 h-5 w-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-300 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 shadow-inner-lg login-input"
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
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 login-text">Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-500 h-5 w-5" />
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-300 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 shadow-inner-lg login-input"
                placeholder="••••••••"
                required
              />
            </div>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.02, boxShadow: "0 10px 30px rgba(139, 92, 246, 0.3)" }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full gradient-primary hover:opacity-90 text-white font-semibold py-4 px-4 rounded-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed shadow-glass relative overflow-hidden group"
          >
            {/* Efeito shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            
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
    </div>
  );
}