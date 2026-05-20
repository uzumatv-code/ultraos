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
    <div className="min-h-screen bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 dark:from-transparent dark:via-transparent dark:to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center space-x-3"
        >
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 5 }}
            className={`w-12 h-12 bg-gradient-to-br ${iconGradient} rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30`}
          >
            <Icon className="w-6 h-6 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
            {title}
          </h1>
        </motion.div>
        
        {children}
      </div>
    </div>
  );
}
