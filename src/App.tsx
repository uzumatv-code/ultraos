import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Header } from './components/Header';
import { BottomNavigation } from './components/BottomNavigation';
import { ReminderProvider } from './contexts/ReminderContext';
import { AuthProvider, Permission, useAuth } from './contexts/AuthContext';

const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Clientes = lazy(() => import('./pages/Clientes').then((module) => ({ default: module.Clientes })));
const Marcas = lazy(() => import('./pages/Marcas').then((module) => ({ default: module.Marcas })));
const Instrumentos = lazy(() => import('./pages/Instrumentos').then((module) => ({ default: module.Instrumentos })));
const Problemas = lazy(() => import('./pages/Problemas').then((module) => ({ default: module.Problemas })));
const Servicos = lazy(() => import('./pages/Servicos').then((module) => ({ default: module.Servicos })));
const NovaOrdem = lazy(() => import('./pages/NovaOrdem').then((module) => ({ default: module.NovaOrdem })));
const Ordens = lazy(() => import('./pages/Ordens').then((module) => ({ default: module.Ordens })));
const ContasPagar = lazy(() => import('./pages/ContasPagar').then((module) => ({ default: module.ContasPagar })));
const Transacoes = lazy(() => import('./pages/Transacoes').then((module) => ({ default: module.Transacoes })));
const Perfil = lazy(() => import('./pages/Perfil').then((module) => ({ default: module.Perfil })));
const Financeiro = lazy(() => import('./pages/Financeiro').then((module) => ({ default: module.Financeiro })));
const FinanceiroIA = lazy(() => import('./pages/FinanceiroIA').then((module) => ({ default: module.FinanceiroIA })));
const ConfiguracoesWhatsApp = lazy(() => import('./pages/ConfiguracoesWhatsApp').then((module) => ({ default: module.ConfiguracoesWhatsApp })));
const ConfiguracoesCompletas = lazy(() => import('./pages/ConfiguracoesCompletas').then((module) => ({ default: module.ConfiguracoesCompletas })));
const NotasFiscais = lazy(() => import('./pages/NotasFiscais').then((module) => ({ default: module.NotasFiscais })));
const AvaliacoesLembretes = lazy(() => import('./pages/AvaliacoesLembretes').then((module) => ({ default: module.AvaliacoesLembretes })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600 dark:border-slate-700 dark:border-t-violet-400" aria-hidden="true" />
        Carregando conteúdo…
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();

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

function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can, loading } = useAuth();
  if (loading) return <RouteFallback />;
  return can(permission) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950">
      <Header />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="pb-[calc(5rem+env(safe-area-inset-bottom))] pt-16 lg:pb-0 lg:pl-64 lg:pt-16"
      >
        {children}
      </motion.div>
      <BottomNavigation />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
    <ReminderProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
      <Suspense fallback={<RouteFallback />}>
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
          path="/equipamentos"
          element={
            <ProtectedRoute>
              <Layout>
                <Instrumentos />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/instrumentos" element={<Navigate to="/equipamentos" replace />} />
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
              <RequirePermission permission="financeiro.read">
                <Layout><ContasPagar /></Layout>
              </RequirePermission>
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
              <RequirePermission permission="financeiro.read">
                <Layout><Financeiro /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/financeiro/ia"
          element={
            <ProtectedRoute>
              <RequirePermission permission="financeiro.read">
                <Layout><FinanceiroIA /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transacoes"
          element={
            <ProtectedRoute>
              <RequirePermission permission="financeiro.read">
                <Layout><Transacoes /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracoes-whatsapp"
          element={
            <ProtectedRoute>
              <RequirePermission permission="settings.manage">
                <Layout><ConfiguracoesWhatsApp /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <ProtectedRoute>
              <RequirePermission permission="settings.manage">
                <Layout><ConfiguracoesCompletas /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notas-fiscais"
          element={
            <ProtectedRoute>
              <RequirePermission permission="nfse.manage">
                <Layout><NotasFiscais /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notas-fiscais/:id"
          element={
            <ProtectedRoute>
              <RequirePermission permission="nfse.manage">
                <Layout><NotasFiscais /></Layout>
              </RequirePermission>
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
      </Suspense>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          className: '',
          style: {
            borderRadius: '12px',
            padding: '14px 16px',
            fontSize: '14px',
            fontWeight: '500',
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
          },
          success: {
            duration: 4000,
            style: {
              borderLeft: '4px solid #059669',
            },
            iconTheme: {
              primary: '#059669',
              secondary: '#ecfdf5',
            },
          },
          error: {
            duration: 5000,
            style: {
              borderLeft: '4px solid #dc2626',
            },
            iconTheme: {
              primary: '#dc2626',
              secondary: '#fef2f2',
            },
          },
          loading: {
            style: {
              borderLeft: '4px solid #7c3aed',
            },
            iconTheme: {
              primary: '#7c3aed',
              secondary: '#f5f3ff',
            },
          },
        }}
      />
      </BrowserRouter>
    </ReminderProvider>
    </AuthProvider>
  );
}

export default App;
