import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Clientes } from './pages/Clientes';
import { Marcas } from './pages/Marcas';
import { Instrumentos } from './pages/Instrumentos';
import { Problemas } from './pages/Problemas';
import { Servicos } from './pages/Servicos';
import { NovaOrdem } from './pages/NovaOrdem';
import { Ordens } from './pages/Ordens';
import { ContasPagar } from './pages/ContasPagar'; 
import { Transacoes } from './pages/Transacoes';
import { Perfil } from './pages/Perfil';
import { Financeiro } from './pages/Financeiro';
import { ConfiguracoesWhatsApp } from './pages/ConfiguracoesWhatsApp';
import { ConfiguracoesCompletas } from './pages/ConfiguracoesCompletas';
import { NotasFiscais } from './pages/NotasFiscais';
import { AvaliacoesLembretes } from './pages/AvaliacoesLembretes';
import { supabase } from './lib/supabase';
import { Header } from './components/Header';
import { BottomNavigation } from './components/BottomNavigation';
import { toast } from './components/ToastCustom';
import { ReminderProvider } from './contexts/ReminderContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthenticated(false);
        return;
      }
      
      if (!session.access_token || !session.user?.aud) {
        await supabase.auth.signOut();
        setAuthenticated(false);
        return;
      }

      setAuthenticated(!!session);
    } catch (error: any) {
      console.error('Erro ao verificar autenticação:', error);
      if (!error?.message?.includes('Failed to fetch')) {
        toast.error('Erro ao verificar autenticação');
      }
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass rounded-3xl p-10 shadow-glass-lg"
        >
          <div className="flex flex-col items-center gap-4">
            <motion.div
              animate={{ 
                rotate: 360,
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                scale: { duration: 1, repeat: Infinity, ease: "easeInOut" }
              }}
              className="w-16 h-16 gradient-primary rounded-2xl shadow-neon"
            />
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="h-2 w-32 bg-primary-200 rounded-full overflow-hidden"
            >
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="h-full w-1/2 gradient-primary"
              />
            </motion.div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Carregando...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen gradient-bg dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Header />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="pb-20 lg:pb-0"
      >
        {children}
      </motion.div>
      <BottomNavigation />
    </div>
  );
}

function App() {
  return (
    <ReminderProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes"
          element={
            <ProtectedRoute>
              <Layout>
                <Clientes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marcas"
          element={
            <ProtectedRoute>
              <Layout>
                <Marcas />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/instrumentos"
          element={
            <ProtectedRoute>
              <Layout>
                <Instrumentos />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/servicos"
          element={
            <ProtectedRoute>
              <Layout>
                <Servicos />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/problemas"
          element={
            <ProtectedRoute>
              <Layout>
                <Problemas />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ordens"
          element={
            <ProtectedRoute>
              <Layout>
                <Ordens />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ordens/nova"
          element={
            <ProtectedRoute>
              <Layout>
                <NovaOrdem />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ordens/editar/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <NovaOrdem />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/contas"
          element={
            <ProtectedRoute>
              <Layout>
                <ContasPagar />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/perfil"
          element={
            <ProtectedRoute>
              <Layout>
                <Perfil />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/financeiro"
          element={
            <ProtectedRoute>
              <Layout>
                <Financeiro />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transacoes"
          element={
            <ProtectedRoute>
              <Layout>
                <Transacoes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracoes-whatsapp"
          element={
            <ProtectedRoute>
              <Layout>
                <ConfiguracoesWhatsApp />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <ProtectedRoute>
              <Layout>
                <ConfiguracoesCompletas />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notas-fiscais"
          element={
            <ProtectedRoute>
              <Layout>
                <NotasFiscais />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notas-fiscais/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <NotasFiscais />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/avaliacoes"
          element={
            <ProtectedRoute>
              <Layout>
                <AvaliacoesLembretes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          className: '',
          style: {
            borderRadius: '12px',
            padding: '16px',
            fontSize: '14px',
            fontWeight: '500',
          },
          success: {
            duration: 4000,
            style: {
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              boxShadow: '0 10px 40px -10px rgba(16, 185, 129, 0.4)',
            },
            iconTheme: {
              primary: '#ffffff',
              secondary: '#10b981',
            },
          },
          error: {
            duration: 5000,
            style: {
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#ffffff',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              boxShadow: '0 10px 40px -10px rgba(239, 68, 68, 0.4)',
            },
            iconTheme: {
              primary: '#ffffff',
              secondary: '#ef4444',
            },
          },
          loading: {
            style: {
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: '#ffffff',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              boxShadow: '0 10px 40px -10px rgba(139, 92, 246, 0.4)',
            },
            iconTheme: {
              primary: '#ffffff',
              secondary: '#8b5cf6',
            },
          },
        }}
      />
      </BrowserRouter>
    </ReminderProvider>
  );
}

export default App;