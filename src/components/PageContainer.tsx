import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface PageContainerProps {
  children: React.ReactNode;
  title: string;
  icon: LucideIcon;
  iconGradient?: string;
}

export function PageContainer({ 
  children, 
  title, 
  icon: Icon,
  iconGradient = 'from-purple-500 to-blue-600'
}: PageContainerProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="responsive-page">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3"
        >
          <motion.div 
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${iconGradient}`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </motion.div>
          <h1 className="responsive-heading text-slate-950 dark:text-white">
            {title}
          </h1>
        </motion.div>
        
        {children}
      </div>
    </div>
  );
}
