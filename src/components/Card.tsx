import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  hover?: boolean;
  glass?: boolean;
  gradient?: boolean;
  variant?: 'default' | 'glass' | 'gradient';
}

export function Card({ 
  children, 
  hover = true, 
  glass = true,
  gradient = false,
  variant = 'default',
  className = '',
  ...props 
}: CardProps) {
  const baseClasses = 'rounded-2xl shadow-glass';
  const variantClasses = 
    variant === 'glass' ? 'glass dark:glass-dark' :
    variant === 'gradient' ? 'gradient-primary text-white' :
    glass ? 'glass dark:glass-dark' : 'bg-white dark:bg-gray-800';
  const hoverClasses = hover ? 'card-hover' : '';
  const gradientClasses = gradient ? 'gradient-primary text-white' : '';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${baseClasses} ${variantClasses} ${hoverClasses} ${gradientClasses} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-b border-gray-200 dark:border-gray-700 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`text-lg font-bold text-gray-800 dark:text-white ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  loading?: boolean;
  delay?: number;
  gradient?: string;
}

export function StatCard({ 
  title, 
  value, 
  icon, 
  loading = false, 
  delay = 0,
  gradient = 'from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40'
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass dark:glass-dark rounded-2xl p-6 shadow-glass card-hover group"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-white mt-1">
            {loading ? (
              <span className="animate-pulse">...</span>
            ) : (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                {value}
              </motion.span>
            )}
          </p>
        </div>
        <motion.div 
          className={`w-14 h-14 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-neon transition-all`}
          whileHover={{ rotate: 360, scale: 1.1 }}
          transition={{ duration: 0.5 }}
        >
          {icon}
        </motion.div>
      </div>
    </motion.div>
  );
}
