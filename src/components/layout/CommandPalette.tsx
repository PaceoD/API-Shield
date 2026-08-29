import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Radio,
  Key,
  BarChart2,
  BookOpen,
  Settings,
  Plus,
  Zap,
} from 'lucide-react';
import { ApiConfig } from '../../types/api';
import { apisService } from '../../services/apisService';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateApi?: () => void;
  onOpenCreateKey?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenCreateApi,
  onOpenCreateKey,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      apisService.getAll().then(setApis).catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // open triggered from parent
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const defaultNavigation = [
    { label: 'Overview Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate('/') },
    { label: 'Protected APIs', icon: <Radio className="w-4 h-4" />, action: () => navigate('/apis') },
    { label: 'API Keys Management', icon: <Key className="w-4 h-4" />, action: () => navigate('/keys') },
    { label: 'Traffic & Latency Analytics', icon: <BarChart2 className="w-4 h-4" />, action: () => navigate('/analytics') },
    { label: 'Developer Documentation', icon: <BookOpen className="w-4 h-4" />, action: () => navigate('/docs') },
    { label: 'Gateway Settings', icon: <Settings className="w-4 h-4" />, action: () => navigate('/settings') },
  ];

  const quickActions = [
    {
      label: 'Create New Protected API',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onClose();
        if (onOpenCreateApi) onOpenCreateApi();
        else navigate('/apis');
      },
    },
    {
      label: 'Generate New API Key',
      icon: <Key className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onClose();
        if (onOpenCreateKey) onOpenCreateKey();
        else navigate('/keys');
      },
    },
  ];

  const apiResults = apis
    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()) || (a.slug && a.slug.includes(query.toLowerCase())))
    .map((a) => ({
      label: `API: ${a.name}`,
      description: `${a.targetUrl} • ${a.rateLimit} req / ${a.rateWindowSeconds === 60 ? 'min' : `${a.rateWindowSeconds}s`}`,
      icon: <Zap className="w-4 h-4 text-sky-400" />,
      action: () => {
        navigate(`/apis/${a.id}`);
        onClose();
      },
    }));

  const filteredNav = defaultNavigation.filter((n) =>
    n.label.toLowerCase().includes(query.toLowerCase())
  );

  const allItems = [
    ...quickActions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase())),
    ...apiResults,
    ...filteredNav,
  ];

  const handleSelect = (index: number) => {
    if (allItems[index]) {
      allItems[index].action();
      onClose();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % allItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(selectedIndex);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800 bg-zinc-950/60">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search APIs, keys, navigation, or actions... (Esc to exit)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 rounded">
            ESC
          </kbd>
        </div>

        <div className="p-2 max-h-80 overflow-y-auto divide-y divide-zinc-800/40">
          {allItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              No matching commands or APIs found for &quot;{query}&quot;
            </div>
          ) : (
            allItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="shrink-0">{item.icon}</span>
                    <span className="font-medium truncate">{item.label}</span>
                    {(item as any).description && (
                      <span className="text-[11px] text-zinc-500 font-mono truncate">
                        {(item as any).description}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <kbd className="text-[10px] text-zinc-400 font-mono bg-zinc-700/60 px-1.5 py-0.5 rounded">
                      ↵
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-zinc-950/80 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Navigate with ↑ ↓</span>
          <span>Select with ↵</span>
        </div>
      </div>
    </div>
  );
};
