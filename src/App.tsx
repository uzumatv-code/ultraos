import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { AppShell } from './components/AppShell';
import { ReminderProvider } from './contexts/ReminderContext';
import { AuthProvider, Permission, useAuth } from './contexts/AuthContext';

const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha').then((module) => ({ default: module.RedefinirSenha })));
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
const DocumentoOSDesigner = lazy(() => import('./pages/DocumentoOSDesigner').then((module) => ({ default: module.DocumentoOSDesigner })));
const NotasFiscais = lazy(() => import('./pages/NotasFiscais').then((module) => ({ default: module.NotasFiscais })));
const AvaliacoesLembretes = lazy(() => import('./pages/AvaliacoesLembretes').then((module) => ({ default: module.AvaliacoesLembretes })));
const Remarketing = lazy(() => import('./pages/Remarketing').then((module) => ({ default: module.Remarketing })));
const OrdemHistorico = lazy(() => import('./pages/OrdemHistorico').then((module) => ({ default: module.OrdemHistorico })));
const Conversas = lazy(() => import('./pages/Conversas').then((module) => ({ default: module.Conversas })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-raised px-5 py-4 text-sm font-medium text-ink-muted shadow-hairline">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-brand" aria-hidden="true" />
        Carregando…
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 rounded-lg border border-hairline bg-surface-raised px-10 py-8 shadow-glass"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-brand/30 bg-brand/15">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          </span>
          <p className="text-sm font-medium text-ink-muted">Preparando sua operação…</p>
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
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {children}
      </motion.div>
    </AppShell>
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
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
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
          path="/conversas"
          element={<ProtectedRoute><Layout><Conversas /></Layout></ProtectedRoute>}
        />
        <Route
          path="/ordens/:id/historico"
          element={<ProtectedRoute><Layout><OrdemHistorico /></Layout></ProtectedRoute>}
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
          path="/configuracoes/documentos"
          element={
            <ProtectedRoute>
              <RequirePermission permission="settings.manage">
                <Layout><DocumentoOSDesigner /></Layout>
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
              <RequirePermission permission="settings.manage">
                <Layout><AvaliacoesLembretes /></Layout>
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/remarketing"
          element={
            <ProtectedRoute>
              <RequirePermission permission="settings.manage">
                <Layout><Remarketing /></Layout>
              </RequirePermission>
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
          style: {
            borderRadius: 'var(--ui-radius-md)',
            padding: '12px 14px',
            fontSize: '14px',
            fontWeight: '500',
            background: 'rgb(var(--ui-surface-2))',
            color: 'rgb(var(--ui-text))',
            border: '1px solid rgb(var(--ui-border))',
            boxShadow: 'var(--ui-shadow-lg)',
          },
          success: {
            style: { borderLeft: '3px solid rgb(var(--ui-success))' },
            iconTheme: { primary: 'rgb(var(--ui-success))', secondary: 'rgb(var(--ui-surface-2))' },
          },
          error: {
            duration: 5000,
            style: { borderLeft: '3px solid rgb(var(--ui-danger))' },
            iconTheme: { primary: 'rgb(var(--ui-danger))', secondary: 'rgb(var(--ui-surface-2))' },
          },
          loading: {
            style: { borderLeft: '3px solid rgb(var(--ui-brand))' },
            iconTheme: { primary: 'rgb(var(--ui-brand))', secondary: 'rgb(var(--ui-surface-2))' },
          },
        }}
      />
      </BrowserRouter>
    </ReminderProvider>
    </AuthProvider>
  );
}

export default App;
