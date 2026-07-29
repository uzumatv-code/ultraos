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
  const baseClasses = 'command-card';
  const variantClasses = 
    variant === 'gradient' ? 'border-violet-600 bg-violet-600 text-white' :
    variant === 'glass' || glass ? '' : '';
  const hoverClasses = hover ? 'card-hover' : '';
  const gradientClasses = gradient ? 'border-violet-600 bg-violet-600 text-white' : '';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`${baseClasses} ${variantClasses} ${hoverClasses} ${gradientClasses} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border-b border-[rgb(var(--app-border))] px-4 py-4 sm:px-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`text-base font-bold text-[rgb(var(--app-text))] ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-4 sm:p-5 ${className}`}>
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
      className="group min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-md sm:p-5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
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
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br sm:h-12 sm:w-12 ${gradient}`}
        >
          {icon}
        </motion.div>
      </div>
    </motion.div>
  );
}
