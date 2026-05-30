import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Music2, LogOut, Bell, User, Users, PenTool as Tool, Home, ChevronDown, Bookmark, Wrench, AlertTriangle, DollarSign, Receipt, Settings, Menu, X, FileText, Layers, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlterarSenhaModal } from './AlterarSenhaModal';
import { NovoUsuarioModal } from './NovoUsuarioModal';
import { ConfiguracoesModal } from './ConfiguracoesModal';
import { NotificacoesModal } from './NotificacoesModal';
import { supabase } from '../lib/supabase';
import { toast } from './ToastCustom';
import { addDaysToDateOnly, todayLocalDate } from '../utils/dates';
import type { OrdemServico, ContaPagar } from '../types/database';

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAlterarSenhaModal, setShowAlterarSenhaModal] = useState(false);
  const [showNovoUsuarioModal, setShowNovoUsuarioModal] = useState(false);
  const [showConfiguracoesModal, setShowConfiguracoesModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUteisMenu, setShowUteisMenu] = useState(false);
  const [ordensHoje, setOrdensHoje] = useState<OrdemServico[]>([]);
  const [contasHoje, setContasHoje] = useState<ContaPagar[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [siteTitle, setSiteTitle] = useState('Sistema OS');
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const uteisButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buscarOrdensHoje();
    buscarContasHoje();
    carregarConfiguracoes();

    // Set up polling interval
    const interval = setInterval(() => {
      buscarOrdensHoje();
      buscarContasHoje();
    }, 3000); // Poll every 3 seconds

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.uteis-menu-container')) {
        setShowUteisMenu(false);
      }
      if (!target.closest('.profile-menu-container')) {
        setShowProfileMenu(false);
      }
      if (!target.closest('.notifications-container')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Effect to handle notification count changes
  useEffect(() => {
    const totalNotificacoes = ordensHoje.length + contasHoje.length;
    if (totalNotificacoes > notificationCount && notificationCount !== 0) {
      const novasOrdens = ordensHoje.length - (notificationCount - contasHoje.length);
      const novasContas = contasHoje.length - (notificationCount - ordensHoje.length);
      
      if (novasOrdens > 0) {
        toast.info(`${novasOrdens} nova(s) ordem(ns) para hoje!`);
      }
      if (novasContas > 0) {
        toast.info(`${novasContas} nova(s) conta(s) para pagar hoje!`);
      }
    }
    setNotificationCount(totalNotificacoes);
  }, [ordensHoje.length, contasHoje.length]);

  const carregarConfiguracoes = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // If no settings exist yet, use defaults
      if (error && error.code === 'PGRST116') {
        // Create default settings
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert([{
            user_id: user.id,
            logo_url: '',
            site_title: 'Sistema OS'
          }]);

        if (insertError) throw insertError;
        
        setLogoUrl('');
        setSiteTitle('Sistema OS');
      } else if (error) {
        throw error;
      } else if (data) {
        setLogoUrl(data.logo_url || '');
        setSiteTitle(data.site_title || 'Sistema OS');
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('Failed to fetch')) {
        toast.error('Erro ao carregar configurações do sistema');
      }
    }
  }, []);

  async function buscarOrdensHoje() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) return;

      const today = todayLocalDate();
      const tomorrow = addDaysToDateOnly(today, 1);

      const { data, error } = await supabase
        .from('ordens_servico')
        .select(`
          *,
          cliente:clientes(*),
          marca:marcas(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pendente')
        .gte('data_previsao', today)
        .lt('data_previsao', tomorrow);

      if (error) throw error;
      setOrdensHoje(data || []);
    } catch (error: any) {
      if (!error?.message?.includes('Failed to fetch')) {
        console.error('Erro ao buscar ordens:', error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function buscarContasHoje() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !user?.aud) return;

      const today = todayLocalDate();
      const tomorrow = addDaysToDateOnly(today, 1);

      const { data, error } = await supabase
        .from('contas_pagar')
        .select(`
          *,
          categoria:categorias_financeiras(*)
        `)
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .gte('data_vencimento', today)
        .lt('data_vencimento', tomorrow);

      if (error) throw error;
      setContasHoje(data || []);
    } catch (error: any) {
      if (!error?.message?.includes('Failed to fetch')) {
        console.error('Erro ao buscar contas:', error);
      }
    }
  }

  const menuItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/clientes', icon: Users, label: 'Clientes' },
    { path: '/ordens', icon: Tool, label: 'Ordens' },
    { path: '/notas-fiscais', icon: FileText, label: 'Notas Fiscais' },
    { path: '/financeiro', icon: DollarSign, label: 'Financeiro' },
    { path: '/financeiro/ia', icon: DollarSign, label: 'IA Financeira' },
    { path: '/contas', icon: Receipt, label: 'Contas a Pagar' },
  ];

  const uteisMenuItems = [
    { path: '/marcas', icon: Bookmark, label: 'Marcas' },
    { path: '/instrumentos', icon: Music2, label: 'Instrumentos' },
    { path: '/servicos', icon: Wrench, label: 'Serviços' },
    { path: '/problemas', icon: AlertTriangle, label: 'Problemas' },
    { path: '/avaliacoes', icon: Star, label: 'Avaliações' },
  ];

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      navigate('/login');
      toast.success('Até logo!');
    } catch (error) {
      toast.error('Erro ao sair.');
    }
  }

  return (
    <header className="sticky top-0 z-[90] w-full max-w-full overflow-x-clip bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto min-w-0">
        {/* Barra Superior */}
        <div className="px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Botão Hambúrguer Mobile */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-lg hover:bg-gray-100"
            >
              {showMobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain" />
              ) : (
                <Music2 className="w-6 h-6 text-white" />
              )}
            </div>
            <h1 className="hidden min-w-0 truncate text-lg sm:block sm:text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              {siteTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {/* Notificações */}
            <div className="relative notifications-container">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-lg hover:bg-gray-100"
              >
                <Bell className="w-5 h-5" />
                {!loading && (ordensHoje.length > 0 || contasHoje.length > 0) && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {ordensHoje.length + contasHoje.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-[calc(100vw-1rem)] max-w-80 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-[100]"
                  >
                    <NotificacoesModal
                      ordens={ordensHoje}
                      contas={contasHoje}
                      onClose={() => setShowNotifications(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Perfil */}
            <div className="relative profile-menu-container">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-2 p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-lg hover:bg-gray-100"
              >
                <User className="w-5 h-5" />
                <ChevronDown className="w-4 h-4" />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-48 max-w-[calc(100vw-1rem)] bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-[100]"
                  >
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/perfil');
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center space-x-2"
                    >
                      <User className="w-4 h-4" />
                      <span>Perfil</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/configuracoes');
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center space-x-2"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Configurações</span>
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sair</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Menu de Navegação Desktop */}
        <div className="hidden lg:flex px-4 sm:px-6 lg:px-8 py-2 items-center gap-1 overflow-x-auto overscroll-x-contain">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  group relative flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium
                  transition-all duration-200 whitespace-nowrap overflow-hidden
                  ${isActive 
                    ? 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 shadow-md' 
                    : 'text-gray-600 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:text-gray-800'}
                `}
              >
                {/* Barra inferior de destaque */}
                {isActive && (
                  <motion.div
                    layoutId="activeDesktopMenuItem"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-600 to-blue-600"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                
                <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          
          {/* Menu Úteis Dropdown */}
          <div className="relative uteis-menu-container static lg:relative">
            <button
              ref={uteisButtonRef}
              onClick={() => setShowUteisMenu(!showUteisMenu)}
              className={`
                flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200 whitespace-nowrap
                ${uteisMenuItems.some(item => location.pathname === item.path)
                  ? 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 shadow-md' 
                  : 'text-gray-600 hover:bg-gradient-to-r hover:from-gray-100 hover:to-gray-50 hover:text-gray-800'}
              `}
            >
              <Layers className="w-4 h-4" />
              <span>Úteis</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showUteisMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showUteisMenu && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[998]"
                    onClick={() => setShowUteisMenu(false)}
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="fixed mt-2 w-64 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden z-[999]"
                    style={{
                      top: uteisButtonRef.current ? `${uteisButtonRef.current.getBoundingClientRect().bottom + 8}px` : '60px',
                      left: uteisButtonRef.current ? `${uteisButtonRef.current.getBoundingClientRect().left}px` : 'auto',
                    }}
                  >
                    {/* Header do Menu */}
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-700 dark:to-blue-700 px-4 py-3">
                      <div className="flex items-center space-x-2 text-white">
                        <Layers className="w-5 h-5" />
                        <span className="font-semibold text-sm">Menu Úteis</span>
                      </div>
                    </div>

                    {/* Items do Menu */}
                    <div className="p-2 space-y-1">
                      {uteisMenuItems.map((item, index) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        
                        return (
                          <motion.div
                            key={item.path}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Link
                              to={item.path}
                              onClick={() => setShowUteisMenu(false)}
                              className={`
                                group flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium
                                transition-all duration-200 relative overflow-hidden
                                ${isActive 
                                  ? 'bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-400 shadow-md' 
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-gray-700/50 dark:hover:to-gray-700/30 hover:text-gray-900 dark:hover:text-gray-100'}
                              `}
                            >
                              {/* Barra lateral de destaque */}
                              {isActive && (
                                <motion.div
                                  layoutId="activeUtilMenuItem"
                                  className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 rounded-r"
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              )}
                              
                              {/* Ícone com background */}
                              <div className={`
                                flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                                ${isActive 
                                  ? 'bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 text-white shadow-lg' 
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 group-hover:bg-gradient-to-br group-hover:from-purple-100 group-hover:to-blue-100 dark:group-hover:from-purple-900/50 dark:group-hover:to-blue-900/50 group-hover:text-purple-600 dark:group-hover:text-purple-400'}
                              `}>
                                <Icon className="w-5 h-5" />
                              </div>
                              
                              {/* Label */}
                              <span className="flex-1">{item.label}</span>
                              
                              {/* Badge indicador ativo */}
                              {isActive && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full"
                                />
                              )}
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Footer decorativo */}
                    <div className="h-1 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 dark:from-purple-500 dark:via-blue-500 dark:to-purple-500"></div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Menu Mobile */}
        <AnimatePresence>
          {showMobileMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden overflow-hidden border-t border-gray-100 max-h-[calc(100dvh-4rem)] overflow-y-auto"
            >
              <nav className="px-4 py-3 space-y-1">
                {menuItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <motion.div
                      key={item.path}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        to={item.path}
                        onClick={() => setShowMobileMenu(false)}
                        className={`
                          group flex items-center space-x-3 px-4 py-3.5 rounded-xl text-sm font-medium
                          transition-all duration-200 relative overflow-hidden
                          ${isActive 
                            ? 'bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-400 shadow-md' 
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-gray-700/50 dark:hover:to-gray-700/30 hover:text-gray-800 dark:hover:text-gray-100'}
                        `}
                      >
                        {/* Barra lateral de destaque */}
                        {isActive && (
                          <motion.div
                            layoutId="activeMobileMenuItem"
                            className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 rounded-r"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        
                        {/* Ícone com background */}
                        <div className={`
                          flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                          ${isActive 
                            ? 'bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 text-white shadow-lg' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 group-hover:bg-gradient-to-br group-hover:from-purple-100 group-hover:to-blue-100 dark:group-hover:from-purple-900/50 dark:group-hover:to-blue-900/50 group-hover:text-purple-600 dark:group-hover:text-purple-400'}
                        `}>
                          <Icon className="w-5 h-5" />
                        </div>
                        
                        <span className="flex-1">{item.label}</span>
                        
                        {/* Badge indicador ativo */}
                        {isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full"
                          />
                        )}
                      </Link>
                    </motion.div>
                  );
                })}

                {/* Menu Úteis no Mobile */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: menuItems.length * 0.05 }}
                >
                  <button
                    onClick={() => setShowUteisMenu(!showUteisMenu)}
                    className={`
                      w-full group flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-medium
                      transition-all duration-200 relative overflow-hidden
                      ${uteisMenuItems.some(item => location.pathname === item.path)
                        ? 'bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-400 shadow-md' 
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-gray-700/50 dark:hover:to-gray-700/30 hover:text-gray-800 dark:hover:text-gray-100'}
                    `}
                  >
                    {/* Barra lateral de destaque se algum item estiver ativo */}
                    {uteisMenuItems.some(item => location.pathname === item.path) && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 rounded-r" />
                    )}
                    
                    <div className="flex items-center space-x-3">
                      {/* Ícone com background */}
                      <div className={`
                        flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                        ${uteisMenuItems.some(item => location.pathname === item.path)
                          ? 'bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 text-white shadow-lg' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 group-hover:bg-gradient-to-br group-hover:from-purple-100 group-hover:to-blue-100 dark:group-hover:from-purple-900/50 dark:group-hover:to-blue-900/50 group-hover:text-purple-600 dark:group-hover:text-purple-400'}
                      `}>
                        <Layers className="w-5 h-5" />
                      </div>
                      <span>Úteis</span>
                    </div>
                    
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${showUteisMenu ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showUteisMenu && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-2 space-y-1 overflow-hidden"
                      >
                        {/* Container com fundo e border */}
                        <div className="ml-2 pl-4 border-l-2 border-gradient-to-b from-purple-600 to-blue-600 space-y-1">
                          {uteisMenuItems.map((item, index) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            
                            return (
                              <motion.div
                                key={item.path}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                              >
                                <Link
                                  to={item.path}
                                  onClick={() => {
                                    setShowUteisMenu(false);
                                    setShowMobileMenu(false);
                                  }}
                                  className={`
                                    group flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium
                                    transition-all duration-200 relative overflow-hidden
                                    ${isActive 
                                      ? 'bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-400 shadow-md' 
                                      : 'text-gray-600 dark:text-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-gray-700/50 dark:hover:to-gray-700/30 hover:text-gray-800 dark:hover:text-gray-100'}
                                  `}
                                >
                                  {/* Barra lateral de destaque */}
                                  {isActive && (
                                    <motion.div
                                      layoutId="activeUtilMobileItem"
                                      className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 rounded-r"
                                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                  )}
                                  
                                  {/* Ícone com background */}
                                  <div className={`
                                    flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200
                                    ${isActive 
                                      ? 'bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500 text-white shadow-lg' 
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 group-hover:bg-gradient-to-br group-hover:from-purple-100 group-hover:to-blue-100 dark:group-hover:from-purple-900/50 dark:group-hover:to-blue-900/50 group-hover:text-purple-600 dark:group-hover:text-purple-400'}
                                  `}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  
                                  <span className="flex-1">{item.label}</span>
                                  
                                  {/* Badge indicador ativo */}
                                  {isActive && (
                                    <motion.div
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full"
                                    />
                                  )}
                                </Link>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modais */}
      <AlterarSenhaModal
        isOpen={showAlterarSenhaModal}
        onClose={() => setShowAlterarSenhaModal(false)}
      />

      <NovoUsuarioModal
        isOpen={showNovoUsuarioModal}
        onClose={() => setShowNovoUsuarioModal(false)}
      />

      <ConfiguracoesModal
        isOpen={showConfiguracoesModal}
        onClose={() => setShowConfiguracoesModal(false)}
      />
    </header>
  );
}
