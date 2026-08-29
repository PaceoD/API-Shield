import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none rounded-md select-none';

  const sizeClasses = {
    xs: 'px-2 py-1 text-xs gap-1.5',
    sm: 'px-2.5 py-1.5 text-xs font-medium gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
    lg: 'px-4 py-2.5 text-base gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-emerald-600 text-zinc-950 font-semibold hover:bg-emerald-500 shadow-sm shadow-emerald-950/40 border border-emerald-500/20',
    secondary:
      'bg-zinc-800 text-zinc-100 hover:bg-zinc-700/80 border border-zinc-700/60 shadow-sm',
    outline:
      'bg-transparent text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 border border-zinc-700',
    ghost:
      'bg-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
    destructive:
      'bg-rose-950/60 text-rose-300 hover:bg-rose-900/80 hover:text-rose-100 border border-rose-800/60 shadow-sm',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
};
