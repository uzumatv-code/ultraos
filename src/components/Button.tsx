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
    const baseClasses = 'relative inline-flex min-w-0 items-center justify-center font-semibold rounded-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group';
    
    const variantClasses = {
      primary: 'gradient-primary text-white shadow-glass hover:shadow-glass-lg hover:scale-105 active:scale-95',
      secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 shadow-md hover:shadow-lg',
      success: 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-glass hover:shadow-glass-lg hover:scale-105 active:scale-95',
      danger: 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-glass hover:shadow-glass-lg hover:scale-105 active:scale-95',
      ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
    };
    
    const sizeClasses = {
      sm: 'px-3 py-2 text-sm gap-1.5',
      md: 'px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base gap-2',
      lg: 'px-5 sm:px-7 py-3 sm:py-4 text-base sm:text-lg gap-2.5',
    };
    
    const widthClass = fullWidth ? 'w-full' : '';
    
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {/* Shimmer effect */}
        {variant !== 'ghost' && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        )}
        
        {/* Content */}
        <span className={`relative z-10 flex min-w-0 items-center justify-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity`}>
          {Icon && <Icon className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} shrink-0`} />}
          <span className="min-w-0 truncate">{children}</span>
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
