import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | 'default'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'outline'
    | 'method-get'
    | 'method-post'
    | 'method-put'
    | 'method-delete'
    | 'method-patch';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px] font-medium tracking-tight',
    md: 'px-2 py-0.5 text-xs font-medium tracking-tight',
  };

  const variantClasses = {
    default: 'bg-zinc-800 text-zinc-300 border border-zinc-700/60',
    success: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60',
    warning: 'bg-amber-950/60 text-amber-300 border border-amber-800/60',
    error: 'bg-rose-950/60 text-rose-300 border border-rose-800/60',
    info: 'bg-sky-950/60 text-sky-300 border border-sky-800/60',
    outline: 'bg-transparent text-zinc-400 border border-zinc-700',
    // HTTP Method styles
    'method-get': 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 font-mono font-semibold',
    'method-post': 'bg-sky-950/70 text-sky-400 border border-sky-800/50 font-mono font-semibold',
    'method-put': 'bg-amber-950/70 text-amber-400 border border-amber-800/50 font-mono font-semibold',
    'method-delete': 'bg-rose-950/70 text-rose-400 border border-rose-800/50 font-mono font-semibold',
    'method-patch': 'bg-purple-950/70 text-purple-400 border border-purple-800/50 font-mono font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-sans leading-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export const MethodBadge: React.FC<{ method: string; size?: 'sm' | 'md' }> = ({ method, size = 'sm' }) => {
  const m = method.toUpperCase();
  let variant: BadgeProps['variant'] = 'default';
  if (m === 'GET') variant = 'method-get';
  else if (m === 'POST') variant = 'method-post';
  else if (m === 'PUT') variant = 'method-put';
  else if (m === 'DELETE') variant = 'method-delete';
  else if (m === 'PATCH') variant = 'method-patch';

  return <Badge variant={variant} size={size}>{m}</Badge>;
};

export const StatusCodeBadge: React.FC<{ code: number; size?: 'sm' | 'md' }> = ({ code, size = 'sm' }) => {
  let variant: BadgeProps['variant'] = 'default';
  if (code >= 200 && code < 300) variant = 'success';
  else if (code === 429) variant = 'warning';
  else if (code >= 400 && code < 500) variant = 'warning';
  else if (code >= 500) variant = 'error';

  return (
    <Badge variant={variant} size={size} className="font-mono">
      {code}
    </Badge>
  );
};
