import { motion } from 'framer-motion';
import { Loader2, LucideIcon } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** success/danger/ghost permanecem como aliases compatíveis das três famílias visuais. */
  variant?: 'primary' | 'secondary' | 'text' | 'success' | 'danger' | 'ghost';
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
    const baseClasses = 'relative inline-flex min-w-0 items-center justify-center rounded-xl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 disabled:cursor-not-allowed disabled:opacity-50';
    
    const variantClasses = {
      primary: 'border border-violet-600 bg-violet-600 text-white shadow-sm hover:border-violet-500 hover:bg-violet-500 hover:shadow-neon',
      secondary: 'border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))] shadow-sm hover:border-violet-500/50 hover:bg-violet-500/5',
      text: 'border border-transparent bg-transparent text-violet-600 hover:bg-violet-500/10',
      success: 'border border-violet-600 bg-violet-600 text-white shadow-sm hover:border-violet-500 hover:bg-violet-500 hover:shadow-neon',
      danger: 'border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[#FF4D67] shadow-sm hover:border-[#FF4D67]/50 hover:bg-[#FF4D67]/10',
      ghost: 'border border-transparent bg-transparent text-violet-600 hover:bg-violet-500/10',
    };
    
    const sizeClasses = {
      sm: 'min-h-10 gap-2 px-4 py-2 text-sm',
      md: 'min-h-12 gap-2 px-4 py-2 text-sm',
      lg: 'min-h-14 gap-3 px-6 py-3 text-base',
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
