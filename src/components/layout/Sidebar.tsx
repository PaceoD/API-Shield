import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  Key,
  BarChart2,
  BookOpen,
  Settings,
  Shield,
  X,
  ExternalLink,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const navSections = [
    {
      group: 'WORKSPACE',
      items: [
        { name: 'Overview', to: '/', icon: <LayoutDashboard className="w-4 h-4" /> },
        { name: 'APIs', to: '/apis', icon: <Radio className="w-4 h-4" /> },
        { name: 'API Keys', to: '/keys', icon: <Key className="w-4 h-4" /> },
        { name: 'Analytics', to: '/analytics', icon: <BarChart2 className="w-4 h-4" /> },
      ],
    },
    {
      group: 'DEVELOPER',
      items: [
        { name: 'Documentation', to: '/docs', icon: <BookOpen className="w-4 h-4" /> },
      ],
    },
    {
      group: 'SYSTEM',
      items: [
        { name: 'Settings', to: '/settings', icon: <Settings className="w-4 h-4" /> },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800/80 w-64 select-none">
      {/* Brand Header */}
      <div className="h-14 px-5 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
        <NavLink
          to="/"
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 group focus:outline-none"
        >
          <div className="w-7 h-7 rounded-md bg-emerald-950/80 border border-emerald-600/50 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500 transition-colors">
            <Shield className="w-4 h-4 fill-emerald-500/20" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors flex items-center gap-1.5">
              APIShield
              <span className="text-[9px] font-mono px-1 py-0.2 bg-zinc-800 text-emerald-400 border border-zinc-700/80 rounded">
                v1.2
              </span>
            </span>
          </div>
        </NavLink>

        {mobileOpen && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.group}>
            <div className="px-3 mb-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              {section.group}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-zinc-800/90 text-zinc-100 shadow-sm border border-zinc-700/40 text-emerald-400 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-emerald-400' : 'text-zinc-500'}>
                        {item.icon}
                      </span>
                      <span>{item.name}</span>
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Gateway Engine Status Footer */}
      <div className="p-3.5 border-t border-zinc-800/80 bg-zinc-950/60">
        <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-zinc-200">Gateway Engine</span>
              <span className="text-[10px] text-zinc-500 font-mono">127.0.0.1:3001</span>
            </div>
          </div>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 hover:text-zinc-300 p-1"
            title="Inspect health status"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 flex h-full animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
