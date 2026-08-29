import React from 'react';
import { AlertCircle, RefreshCw, Inbox } from 'lucide-react';
import { Button } from './Button';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-zinc-800/60 rounded ${className}`} />;
};

export const MetricCardSkeleton: React.FC = () => {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 sm:p-5 flex flex-col justify-between h-32 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 bg-zinc-800 rounded w-24"></div>
        <div className="h-4 w-4 bg-zinc-800 rounded"></div>
      </div>
      <div className="h-7 bg-zinc-800 rounded w-32 my-2"></div>
      <div className="h-3 bg-zinc-800/70 rounded w-36"></div>
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, action, icon, className = '' }) => {
  return (
    <div
      className={`border border-zinc-800/80 rounded-lg bg-zinc-900/20 p-10 text-center flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center text-zinc-400 mb-3.5 shadow-sm">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      <p className="text-xs text-zinc-400 mt-1.5 max-w-md leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while communicating with the APIShield service.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`border border-rose-900/40 rounded-lg bg-rose-950/10 p-8 text-center flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400 mb-3">
        <AlertCircle className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-rose-200">{title}</h3>
      <p className="text-xs text-rose-300/80 mt-1 max-w-md leading-relaxed">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
};

export const StatusDot: React.FC<{ status: 'active' | 'inactive' | 'revoked' | 'warning' }> = ({ status }) => {
  const colors = {
    active: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    inactive: 'bg-zinc-500',
    revoked: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]',
    warning: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  };

  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
};
