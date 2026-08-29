import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const CopyButton: React.FC<{
  text: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'xs';
}> = ({ text, label, className = '', size = 'xs' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 transition-colors text-xs font-mono select-none ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          {label && <span className="text-emerald-400">Copied!</span>}
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-zinc-400" />
          {label && <span>{label}</span>}
        </>
      )}
    </button>
  );
};

export const CodeBlock: React.FC<{
  code: string;
  language?: string;
  title?: string;
  showCopy?: boolean;
  className?: string;
}> = ({ code, language = 'bash', title, showCopy = true, className = '' }) => {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden text-xs font-mono ${className}`}>
      {(title || showCopy) && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/90 border-b border-zinc-800/80 text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
              {language}
            </span>
            {title && <span className="text-zinc-300">{title}</span>}
          </div>
          {showCopy && <CopyButton text={code} label="Copy" />}
        </div>
      )}
      <div className="p-3.5 overflow-x-auto text-zinc-200 leading-relaxed font-mono">
        <pre>{code}</pre>
      </div>
    </div>
  );
};

export const JsonViewer: React.FC<{ data: any; maxHeight?: string; className?: string }> = ({
  data,
  maxHeight = '350px',
  className = '',
}) => {
  let formatted = '';
  try {
    formatted = typeof data === 'string' ? JSON.stringify(JSON.parse(data), null, 2) : JSON.stringify(data, null, 2);
  } catch {
    formatted = String(data);
  }

  return (
    <div className={`relative rounded-lg border border-zinc-800 bg-zinc-950/90 font-mono text-xs ${className}`}>
      <div className="absolute top-2.5 right-2.5 z-10">
        <CopyButton text={formatted} label="Copy JSON" />
      </div>
      <div
        className="p-4 overflow-auto text-emerald-400 leading-relaxed font-mono selection:bg-emerald-950"
        style={{ maxHeight }}
      >
        <pre className="text-zinc-200">{formatted}</pre>
      </div>
    </div>
  );
};
