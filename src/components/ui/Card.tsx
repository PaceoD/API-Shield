import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hoverable = false,
  ...props
}) => {
  return (
    <div
      className={`bg-zinc-900/60 border border-zinc-800/80 rounded-lg backdrop-blur-sm ${
        hoverable ? 'hover:border-zinc-700/80 transition-colors duration-150' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, action, className = '' }) => {
  return (
    <div className={`p-4 sm:p-5 border-b border-zinc-800/80 flex items-start justify-between gap-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-zinc-100 tracking-tight">{title}</h3>
        {description && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
};

export const CardContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
};

export const CardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <div className={`p-3.5 sm:p-4 border-t border-zinc-800/80 bg-zinc-950/30 rounded-b-lg flex items-center justify-between gap-3 text-xs text-zinc-400 ${className}`}>
      {children}
    </div>
  );
};
