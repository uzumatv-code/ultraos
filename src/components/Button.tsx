import { motion } from 'framer-motion';
import { Loader2, LucideIcon } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    children, 
    variant = 'primary', 
    size = 'md', 
    loading = false, 
    icon: Icon,
    fullWidth = false,
    className = '',
    disabled,
    ...props 
  }, ref) => {
    const baseClasses = 'relative inline-flex min-w-0 items-center justify-center rounded-lg font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-50';
    
    const variantClasses = {
      primary: 'border border-violet-600 bg-violet-600 text-white shadow-sm hover:border-violet-700 hover:bg-violet-700',
      secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
      success: 'border border-emerald-600 bg-emerald-600 text-white shadow-sm hover:border-emerald-700 hover:bg-emerald-700',
      danger: 'border border-red-600 bg-red-600 text-white shadow-sm hover:border-red-700 hover:bg-red-700',
      ghost: 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
    };
    
    const sizeClasses = {
      sm: 'min-h-9 px-3 py-1.5 text-sm gap-1.5',
      md: 'min-h-11 px-4 py-2 text-sm gap-2',
      lg: 'min-h-12 px-5 py-2.5 text-base gap-2.5',
    };
    
    const widthClass = fullWidth ? 'w-full' : '';
    
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {/* Content */}
        <span className={`relative z-10 flex min-w-0 items-center justify-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity`}>
          {Icon && <Icon className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} shrink-0`} />}
          <span className="min-w-0">{children}</span>
        </span>
        
        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className={`animate-spin ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'}`} />
          </div>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
