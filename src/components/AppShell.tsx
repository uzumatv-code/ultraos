/**
 * Shell da aplicação: sidebar, topbar, navegação mobile e paleta de comandos.
 *
 * Substitui o antigo `Header` + `BottomNavigation`. Três mudanças de fundo:
 *  1. navegação agrupada por domínio (Operação, Financeiro, Cadastros…),
 *     em vez de uma lista única com financeiro e cadastro misturados;
 *  2. os alertas vêm de um único endpoint agregado, com atualização por foco
 *     da janela — o polling de 15 s contra duas tabelas foi removido;
 *  3. paleta de comandos (Ctrl/⌘ + K) para alcançar qualquer tela sem mouse.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Banknote, Bell, Bookmark, ChevronDown, ChevronsLeft, CreditCard,
  FileText, Gauge, LayoutGrid, LogOut, Menu, MessageCircle, Music2, PanelsTopLeft,
  PenTool, Receipt, Search, Settings, Sparkles, Star, User, Users, Wallet, Wrench, X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { NotificacoesModal } from './NotificacoesModal';
import { supabase } from '../lib/supabase';
import { apiRequest } from '../lib/api-client';
import { toast } from './ToastCustom';
import { loadBrandLogoDataUrl } from '../utils/tenant-customization-service';
import type { ContaPagar, OrdemServico } from '../types/database';
import { type Permission, useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';

type NavItem = { path: string; icon: LucideIcon; label: string; permission?: Permission; hint?: string };
type NavGroup = { id: string; label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      { path: '/dashboard', icon: Gauge, label: 'Painel', hint: 'Prioridades do dia' },
      { path: '/ordens', icon: PenTool, label: 'Ordens de serviço', hint: 'Bancada e prazos' },
      { path: '/clientes', icon: Users, label: 'Clientes' },
      { path: '/conversas', icon: MessageCircle, label: 'Conversas', hint: 'WhatsApp' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      { path: '/financeiro', icon: Wallet, label: 'Visão financeira', permission: 'financeiro.read', hint: 'Caixa, resultado e projeção' },
      { path: '/contas', icon: Receipt, label: 'Contas a pagar', permission: 'financeiro.read' },
      { path: '/transacoes', icon: Banknote, label: 'Lançamentos', permission: 'financeiro.read' },
      { path: '/notas-fiscais', icon: FileText, label: 'Notas fiscais', permission: 'nfse.manage' },
      { path: '/financeiro/ia', icon: Sparkles, label: 'Assistente financeiro', permission: 'financeiro.read' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    items: [
      { path: '/equipamentos', icon: Music2, label: 'Equipamentos' },
      { path: '/marcas', icon: Bookmark, label: 'Marcas' },
      { path: '/servicos', icon: Wrench, label: 'Serviços' },
      { path: '/problemas', icon: AlertTriangle, label: 'Problemas' },
    ],
  },
  {
    id: 'relacionamento',
    label: 'Relacionamento',
    items: [
      { path: '/avaliacoes', icon: Star, label: 'Avaliações', permission: 'settings.manage' },
      { path: '/remarketing', icon: CreditCard, label: 'Manutenção preventiva', permission: 'settings.manage' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { path: '/configuracoes', icon: Settings, label: 'Configurações', permission: 'settings.manage' },
      { path: '/perfil', icon: User, label: 'Meu perfil' },
    ],
  },
];

const mobileTabs: NavItem[] = [
  { path: '/dashboard', icon: Gauge, label: 'Painel' },
  { path: '/ordens', icon: PenTool, label: 'Ordens' },
  { path: '/clientes', icon: Users, label: 'Clientes' },
  { path: '/financeiro', icon: Wallet, label: 'Finanças', permission: 'financeiro.read' },
  { path: '/conversas', icon: MessageCircle, label: 'Conversas' },
];

type AlertSummary = {
  entregas_hoje: number;
  atrasadas: number;
  contas_hoje: number;
  contas_vencidas: number;
  mensagens_nao_lidas: number;
  ordens: OrdemServico[];
  contas: ContaPagar[];
};

const emptyAlerts: AlertSummary = {
  entregas_hoje: 0, atrasadas: 0, contas_hoje: 0, contas_vencidas: 0,
  mensagens_nao_lidas: 0, ordens: [], contas: [],
};

function isItemActive(pathname: string, path: string) {
  if (path === '/dashboard') return pathname === path;
  if (path === '/financeiro') return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('ultraos:sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('ultraos:sidebar', next ? 'collapsed' : 'expanded');
      } catch {
        /* preferência de interface não é crítica */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, toggle: toggleCollapsed } = useCollapsed();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertSummary>(emptyAlerts);
  const [brand, setBrand] = useState({ name: 'Ultra OS', logo: '' });
  const [profile, setProfile] = useState({ name: 'Usuário', role: 'Operador', avatar: '' });

  const visibleGroups = useMemo(
    () =>
      navigation
        .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) }))
        .filter((group) => group.items.length > 0),
    [can],
  );

  const activeItem = useMemo(() => {
    const all = visibleGroups.flatMap((group) => group.items);
    return all.find((item) => isItemActive(location.pathname, item.path));
  }, [location.pathname, visibleGroups]);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await apiRequest<AlertSummary>('/api/notificacoes/resumo'));
    } catch {
      // Alertas são complementares: falhar aqui não pode travar a navegação.
    }
  }, []);

  const loadBranding = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setProfile({
          name: user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuário',
          role: user.app_metadata?.nivel === 'admin' ? 'Administrador' : 'Operador',
          avatar: user.user_metadata?.avatar_url || '',
        });
      }

      const [systemResult, companyResult, tenantLogo] = await Promise.all([
        supabase.from('system_settings').select('*').maybeSingle(),
        supabase.from('configuracoes_empresa').select('*').maybeSingle(),
        loadBrandLogoDataUrl().catch(() => ''),
      ]);

      setBrand({
        logo: tenantLogo || systemResult.data?.logo_url || '',
        name: companyResult.data?.nome_empresa || systemResult.data?.site_title || 'Ultra OS',
      });
    } catch {
      // Branding é cosmético; erro aqui não merece interromper o usuário.
    }
  }, []);

  useEffect(() => {
    void loadBranding();
    const handleBranding = () => void loadBranding();
    window.addEventListener('tenant-branding-updated', handleBranding);
    return () => window.removeEventListener('tenant-branding-updated', handleBranding);
  }, [loadBranding]);

  // Alertas: carrega ao abrir, ao voltar o foco e a cada 5 minutos.
  useEffect(() => {
    void loadAlerts();
    const onFocus = () => void loadAlerts();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void loadAlerts(), 300_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [loadAlerts]);

  useEffect(() => {
    setDrawerOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      navigate('/login');
      toast.success('Sessão encerrada.');
    } catch {
      toast.error('Não foi possível sair agora.');
    }
  }

  const alertCount = alerts.atrasadas + alerts.contas_vencidas + alerts.entregas_hoje + alerts.contas_hoje;
  const initial = profile.name.trim().charAt(0).toUpperCase() || 'U';

  const sidebar = (compact: boolean) => (
    <aside className="flex h-full flex-col border-r border-hairline bg-surface">
      <div className={`flex items-center gap-3 border-b border-hairline px-4 ${compact ? 'justify-center px-2' : ''} h-16 shrink-0`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-brand/30 bg-brand/15 text-brand-soft">
          {brand.logo ? <img src={brand.logo} alt="" className="h-6 w-6 object-contain" /> : <Music2 className="h-4 w-4" />}
        </span>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{brand.name}</p>
            <p className="truncate text-2xs uppercase tracking-[0.16em] text-ink-subtle">Centro de operações</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
        {visibleGroups.map((group) => (
          <div key={group.id}>
            {!compact && <p className="ui-nav-section">{group.label}</p>}
            {compact && group.id !== visibleGroups[0].id && <div className="my-2 border-t border-hairline" />}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(location.pathname, item.path);
              const count =
                item.path === '/ordens' ? alerts.atrasadas
                : item.path === '/contas' ? alerts.contas_vencidas
                : item.path === '/conversas' ? alerts.mensagens_nao_lidas
                : 0;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  title={compact ? item.label : undefined}
                  className={`ui-nav-link ${compact ? 'justify-center px-0' : ''}`}
                >
                  <Icon aria-hidden />
                  {!compact && <span className="truncate">{item.label}</span>}
                  {!compact && count > 0 && <span className="ui-nav-count">{count}</span>}
                  {compact && count > 0 && <span className="absolute ml-5 -mt-4 h-1.5 w-1.5 rounded-full bg-signal-danger" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-hairline p-2">
        <button
          type="button"
          onClick={handleLogout}
          className={`ui-nav-link w-full hover:!bg-signal-danger/10 hover:!text-signal-danger ${compact ? 'justify-center px-0' : ''}`}
        >
          <LogOut aria-hidden />
          {!compact && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar fixa (desktop) */}
      <div className={`fixed inset-y-0 left-0 z-40 hidden lg:block ${collapsed ? 'w-16' : 'w-64'} transition-[width] duration-200`}>
        {sidebar(collapsed)}
      </div>

      {/* Drawer (mobile) */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden"
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="app-icon-button absolute right-2 top-3 z-10"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
              {sidebar(false)}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Topbar */}
      <header
        className={`fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-2 border-b border-hairline bg-surface/85 px-3 backdrop-blur-xl sm:px-4 ${
          collapsed ? 'lg:left-16' : 'lg:left-64'
        } transition-[left] duration-200`}
      >
        <button type="button" onClick={() => setDrawerOpen(true)} className="app-icon-button lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="app-icon-button hidden lg:inline-flex"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelsTopLeft className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{activeItem?.label ?? brand.name}</p>
          {activeItem?.hint && <p className="truncate text-2xs text-ink-subtle">{activeItem.hint}</p>}
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-9 items-center gap-2 rounded-md border border-hairline bg-surface-muted px-3 text-xs text-ink-muted transition hover:border-brand/40 hover:text-ink md:inline-flex"
        >
          <Search className="h-3.5 w-3.5" />
          Ir para…
          <kbd className="ml-2 rounded border border-hairline bg-surface px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold">Ctrl K</kbd>
        </button>

        <button type="button" onClick={() => setPaletteOpen(true)} className="app-icon-button md:hidden" aria-label="Buscar">
          <Search className="h-5 w-5" />
        </button>

        <ThemeToggle />

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className="app-icon-button relative"
            aria-label={`Alertas${alertCount ? ` (${alertCount})` : ''}`}
          >
            <Bell className="h-5 w-5" />
            {alertCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-danger px-1 text-[0.625rem] font-bold text-white">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-hairline bg-surface-raised shadow-glass-lg"
              >
                <NotificacoesModal ordens={alerts.ordens} contas={alerts.contas} onClose={() => setNotificationsOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex h-10 items-center gap-2 rounded-md border border-hairline bg-surface-raised px-2 text-sm text-ink transition hover:border-brand/40 sm:px-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-2xs font-bold text-brand-soft">
              {profile.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : initial}
            </span>
            <span className="hidden max-w-32 truncate sm:inline">{profile.name}</span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-ink-subtle sm:inline" />
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-hairline bg-surface-raised py-1 shadow-glass-lg"
              >
                <div className="border-b border-hairline px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{profile.name}</p>
                  <p className="text-2xs uppercase tracking-[0.14em] text-ink-subtle">{profile.role}</p>
                </div>
                <button type="button" onClick={() => navigate('/perfil')} className="w-full px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink">
                  Meu perfil
                </button>
                {can('settings.manage') && (
                  <button type="button" onClick={() => navigate('/configuracoes')} className="w-full px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink">
                    Configurações
                  </button>
                )}
                <button type="button" onClick={handleLogout} className="w-full px-3 py-2 text-left text-sm text-signal-danger transition hover:bg-signal-danger/10">
                  Sair
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Conteúdo */}
      <div
        className={`pt-16 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'} transition-[padding] duration-200`}
      >
        {children}
      </div>

      {/* Navegação inferior (mobile) */}
      <nav
        aria-label="Navegação rápida"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-lg items-stretch">
          {mobileTabs
            .filter((item) => !item.permission || can(item.permission))
            .map((item) => {
              const Icon = item.icon;
              const active = isItemActive(location.pathname, item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1"
                >
                  {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand" />}
                  <Icon className={`h-5 w-5 ${active ? 'text-brand-soft' : 'text-ink-subtle'}`} />
                  <span className={`max-w-full truncate text-[0.625rem] font-semibold ${active ? 'text-ink' : 'text-ink-subtle'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={visibleGroups} />
    </div>
  );
}

/* ----------------------------------------------------- Paleta de comandos */

function CommandPalette({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: NavGroup[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = useMemo(
    () => [
      { path: '/ordens/nova', icon: LayoutGrid, label: 'Nova ordem de serviço', group: 'Ações' },
      ...groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
    ],
    [groups],
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(term));
  }, [actions, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-hairline bg-surface-raised shadow-glass-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tela ou ação…"
            className="h-12 w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
          <kbd className="shrink-0 rounded border border-hairline bg-surface px-1.5 py-0.5 text-[0.625rem] font-semibold text-ink-subtle">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">Nada encontrado para “{query}”.</p>
          ) : (
            results.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-subtle" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 text-2xs uppercase tracking-[0.12em] text-ink-subtle">{item.group}</span>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
