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
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 dark:from-transparent dark:via-transparent dark:to-transparent">
      <div className="responsive-page">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 sm:mb-6 flex items-center gap-3"
        >
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 5 }}
            className={`h-11 w-11 sm:h-12 sm:w-12 shrink-0 bg-gradient-to-br ${iconGradient} rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </motion.div>
          <h1 className="responsive-heading bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
            {title}
          </h1>
        </motion.div>
        
        {children}
      </div>
    </div>
  );
}
