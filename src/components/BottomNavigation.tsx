import { Link, useLocation } from 'react-router-dom';
import { Home, Users, PenTool as Tool, DollarSign, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

export function BottomNavigation() {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Início' },
    { path: '/clientes', icon: Users, label: 'Clientes' },
    { path: '/ordens', icon: Tool, label: 'Ordens' },
    { path: '/notas-fiscais', icon: FileText, label: 'NFS-e' },
    { path: '/financeiro', icon: DollarSign, label: 'Finanças' },
  ];

  return (
    <nav aria-label="Navegação principal" className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-center h-full group px-1"
            >
              {/* Indicador ativo com animação melhorada */}
              {isActive && (
                <motion.div
                  layoutId="bottomNav"
                  className="absolute inset-x-1 inset-y-1 rounded-lg bg-violet-50 dark:bg-violet-950/40"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
                />
              )}
              
              {/* Ícone com animação */}
              <motion.div 
                className={`relative z-10 transition-colors duration-200 ${
                  isActive 
                    ? 'text-primary-600 dark:text-primary-400' 
                    : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                }`}
                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${isActive ? 'drop-shadow-md' : ''}`} />
              </motion.div>
              
              {/* Label com gradiente quando ativo */}
              <span className={`relative z-10 mt-1 max-w-full truncate text-[11px] font-medium transition-colors duration-200 ${
                isActive 
                  ? 'text-gradient font-semibold' 
                  : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
              }`}>
                {item.label}
              </span>
              
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

