import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bookmark,
  ChevronDown,
  DollarSign,
  FileText,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Music2,
  PenTool as Tool,
  Receipt,
  Settings,
  Sparkles,
  Star,
  Users,
  Wrench,
  AlertTriangle,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { NotificacoesModal } from './NotificacoesModal';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { loadBrandLogoDataUrl } from '../utils/tenant-customization-service';
import { addDaysToDateOnly, todayLocalDate } from '../utils/dates';
import type { ContaPagar, OrdemServico } from '../types/database';
import { Permission, useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';

const mainItems: Array<{ path: string; icon: typeof Home; label: string; permission?: Permission }> = [
  { path: '/dashboard', icon: Home, label: 'Dashboard' },
  { path: '/clientes', icon: Users, label: 'Clientes' },
  { path: '/ordens', icon: Tool, label: 'Ordens de Serviço' },
  { path: '/conversas', icon: MessageCircle, label: 'Conversas' },
  { path: '/financeiro', icon: DollarSign, label: 'Financeiro', permission: 'financeiro.read' },
  { path: '/notas-fiscais', icon: FileText, label: 'Notas Fiscais', permission: 'nfse.manage' },
  { path: '/financeiro/ia', icon: DollarSign, label: 'IA Financeira', permission: 'financeiro.read' },
  { path: '/contas', icon: Receipt, label: 'Contas a Pagar', permission: 'financeiro.read' },
];

const supportItems: Array<{ path: string; icon: typeof Home; label: string; permission?: Permission }> = [
  { path: '/marcas', icon: Bookmark, label: 'Marcas' },
  { path: '/equipamentos', icon: Music2, label: 'Equipamentos' },
  { path: '/servicos', icon: Wrench, label: 'Serviços' },
  { path: '/problemas', icon: AlertTriangle, label: 'Problemas' },
  { path: '/avaliacoes', icon: Star, label: 'Avaliações', permission: 'settings.manage' },
  { path: '/remarketing', icon: Sparkles, label: 'Manutenção preventiva', permission: 'settings.manage' },
  { path: '/configuracoes', icon: Settings, label: 'Configurações', permission: 'settings.manage' },
];

function isItemActive(pathname: string, path: string) {
  return pathname === path || (path !== '/dashboard' && pathname.startsWith(`${path}/`));
}

export function Header() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSupport, setShowSupport] = useState(true);
  const [ordensHoje, setOrdensHoje] = useState<OrdemServico[]>([]);
  const [contasHoje, setContasHoje] = useState<ContaPagar[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [siteTitle, setSiteTitle] = useState('Sistema OS');
  const [displayName, setDisplayName] = useState('Usuário');
  const [displayRole, setDisplayRole] = useState('Usuário');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);

  const atualizarPerfil = useCallback((user: any) => {
    if (!user) return;

    const nome = user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuário';
    const nivel = user.app_metadata?.nivel || 'usuario';
    setDisplayName(nome);
    setDisplayRole(nivel === 'admin' ? 'Administrador' : 'Operador');
    setAvatarUrl(user.user_metadata?.avatar_url || '');
  }, []);

  const carregarConfiguracoes = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      atualizarPerfil(user);

      const [systemResult, companyResult, tenantLogo] = await Promise.all([
        supabase.from('system_settings').select('*').maybeSingle(),
        supabase.from('configuracoes_empresa').select('*').maybeSingle(),
        loadBrandLogoDataUrl().catch(() => ''),
      ]);
      if (systemResult.error && systemResult.error.code !== 'PGRST116') throw systemResult.error;
      if (companyResult.error && companyResult.error.code !== 'PGRST116') throw companyResult.error;
      setLogoUrl(tenantLogo || systemResult.data?.logo_url || '');
      setSiteTitle(companyResult.data?.nome_empresa || systemResult.data?.site_title || 'Sistema OS');
    } catch (error: any) {
      if (error?.message && !error.message.includes('Failed to fetch')) {
        toast.error('Erro ao carregar configurações do sistema');
      }
    }
  }, [atualizarPerfil]);

  async function buscarOrdensHoje() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) return;

      const today = todayLocalDate();
      const tomorrow = addDaysToDateOnly(today, 1);
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*,cliente:clientes(*),marca:marcas(*)')
        .eq('user_id', user.id)
        .eq('status', 'pendente')
        .gte('data_previsao', today)
        .lt('data_previsao', tomorrow);

      if (error) throw error;
      setOrdensHoje(data || []);
    } catch (error: any) {
      if (!error?.message?.includes('Failed to fetch')) console.error('Erro ao buscar ordens:', error);
    } finally {
      setLoading(false);
    }
  }

  async function buscarContasHoje() {
    if (!can('financeiro.read')) {
      setContasHoje([]);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) return;

      const today = todayLocalDate();
      const tomorrow = addDaysToDateOnly(today, 1);
      const { data, error } = await supabase
        .from('contas_pagar')
        .select('*,categoria:categorias_financeiras(*)')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .gte('data_vencimento', today)
        .lt('data_vencimento', tomorrow);

      if (error) throw error;
      setContasHoje(data || []);
    } catch (error: any) {
      if (!error?.message?.includes('Failed to fetch')) console.error('Erro ao buscar contas:', error);
    }
  }

  useEffect(() => {
    buscarOrdensHoje();
    buscarContasHoje();
    carregarConfiguracoes();

    const handleBrandingUpdate = () => carregarConfiguracoes();
    window.addEventListener('tenant-branding-updated', handleBrandingUpdate);

    const interval = setInterval(() => {
      buscarOrdensHoje();
      buscarContasHoje();
    }, 15000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('tenant-branding-updated', handleBrandingUpdate);
    };
  }, [carregarConfiguracoes]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      atualizarPerfil(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [atualizarPerfil]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      navigate('/login');
      toast.success('Até logo!');
    } catch {
      toast.error('Erro ao sair.');
    }
  }

  const notificationCount = ordensHoje.length + contasHoje.length;
  const displayInitial = displayName.trim().charAt(0).toUpperCase() || 'U';
  const visibleMainItems = mainItems.filter((item) => !item.permission || can(item.permission));
  const visibleSupportItems = supportItems.filter((item) => !item.permission || can(item.permission));
  const sidebar = (
    <aside className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-7 w-7 object-contain" /> : <Music2 className="h-6 w-6" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{siteTitle}</p>
          <p className="truncate text-xs text-slate-400">Gestão de serviços</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {visibleMainItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                active ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-950/40' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setShowSupport((value) => !value)}
          className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-white/10"
        >
          Cadastros
          <ChevronDown className={`h-4 w-4 transition ${showSupport ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence initial={false}>
          {showSupport && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1 overflow-hidden">
              {visibleSupportItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(location.pathname, item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      active ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => navigate('/perfil')}
          className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
            {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : displayInitial}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{displayRole}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-200"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</div>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex h-16 items-center justify-between px-4">
          <button type="button" onClick={() => setMobileOpen(true)} className="app-icon-button" aria-label="Abrir menu principal">
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <Music2 className="h-5 w-5" />
            </div>
            <span className="truncate text-sm font-semibold text-gray-950">{siteTitle}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          <div className="relative">
            <button type="button" onClick={() => setShowNotifications((value) => !value)} className="app-icon-button relative" aria-label="Abrir notificações">
              <Bell className="h-5 w-5" />
              {!loading && notificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{notificationCount}</span>
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute right-0 mt-2 w-[calc(100vw-1rem)] max-w-80 rounded-lg border border-gray-100 bg-white shadow-lg">
                  <NotificacoesModal ordens={ordensHoje} contas={contasHoje} onClose={() => setShowNotifications(false)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden">
              <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10" aria-label="Fechar menu principal">
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header className="fixed left-64 right-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur lg:flex dark:border-slate-800 dark:bg-slate-950/95">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{siteTitle}</p>
        <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="relative">
          <button type="button" onClick={() => setShowNotifications((value) => !value)} className="app-icon-button relative border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Abrir notificações">
            <Bell className="h-5 w-5" />
            {!loading && notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{notificationCount}</span>
            )}
          </button>
          <AnimatePresence>
            {showNotifications && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-100 bg-white shadow-lg">
                <NotificacoesModal ordens={ordensHoje} contas={contasHoje} onClose={() => setShowNotifications(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowProfileMenu((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : displayInitial}
            </span>
            <span className="max-w-36 truncate">{displayName}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          <AnimatePresence>
            {showProfileMenu && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-100 bg-white py-2 shadow-lg">
                <button type="button" onClick={() => navigate('/perfil')} className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Perfil</button>
                <button type="button" onClick={() => navigate('/configuracoes')} className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Configurações</button>
                <button type="button" onClick={handleLogout} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">Sair</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>
      </header>
    </>
  );
}
