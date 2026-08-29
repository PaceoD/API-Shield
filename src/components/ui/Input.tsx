import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', icon, suffix, hasError, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {icon && (
          <div className="absolute left-3 text-zinc-500 pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full bg-zinc-950/80 border rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 disabled:bg-zinc-900 ${
            icon ? 'pl-9' : ''
          } ${suffix ? 'pr-9' : ''} ${
            hasError
              ? 'border-rose-500 focus:border-rose-500'
              : 'border-zinc-800 focus:border-zinc-600'
          } ${className}`}
          {...props}
        />
        {suffix && (
          <div className="absolute right-3 text-zinc-500 flex items-center">
            {suffix}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', hasError, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full bg-zinc-950/80 border rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 disabled:bg-zinc-900 ${
          hasError
            ? 'border-rose-500 focus:border-rose-500'
            : 'border-zinc-800 focus:border-zinc-600'
        } ${className}`}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  hasError?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, className = '', hasError, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={`w-full appearance-none bg-zinc-950/80 border rounded-md px-3 py-2 pr-8 text-sm text-zinc-100 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 disabled:bg-zinc-900 ${
            hasError
              ? 'border-rose-500 focus:border-rose-500'
              : 'border-zinc-800 focus:border-zinc-600'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-100">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 text-xs">
          ▼
        </div>
      </div>
    );
  }
);
Select.displayName = 'Select';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}) => {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 mt-0.5 ${
          checked ? 'bg-emerald-600' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-xs font-medium text-zinc-200">{label}</span>}
          {description && <span className="text-[11px] text-zinc-500 leading-normal">{description}</span>}
        </div>
      )}
    </label>
  );
};
