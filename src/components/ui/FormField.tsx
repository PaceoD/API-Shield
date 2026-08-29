import React from 'react';

export interface FormFieldProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  description,
  error,
  required,
  children,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
          {label}
          {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      {children}
      {description && !error && (
        <p className="text-[11px] text-zinc-500 leading-normal">{description}</p>
      )}
      {error && (
        <p className="text-[11px] text-rose-400 font-medium leading-normal animate-in fade-in">
          {error}
        </p>
      )}
    </div>
  );
};
