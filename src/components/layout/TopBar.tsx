import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  BookOpen,
  Activity,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

interface TopBarProps {
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenMobileMenu,
  onOpenCommandPalette,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === '/') return [{ label: 'Workspace' }, { label: 'Overview' }];
    if (path.startsWith('/apis/')) return [{ label: 'APIs', href: '/apis' }, { label: 'API Details' }];
    if (path === '/apis') return [{ label: 'Workspace' }, { label: 'APIs' }];
    if (path === '/keys') return [{ label: 'Workspace' }, { label: 'API Keys' }];
    if (path === '/analytics') return [{ label: 'Observability' }, { label: 'Analytics' }];
    if (path === '/docs') return [{ label: 'Developer' }, { label: 'Documentation' }];
    if (path === '/settings') return [{ label: 'System' }, { label: 'Settings' }];
    return [{ label: 'Workspace' }];
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shrink-0">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden text-zinc-400 hover:text-zinc-100 p-1 rounded-md"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-zinc-600">/</span>}
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="hover:text-zinc-200 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={idx === breadcrumbs.length - 1 ? 'text-zinc-200 font-medium' : ''}>
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right: Search, Docs Shortcut, Live Gateway Status, User Profile & Logout */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors shadow-sm"
        >
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <span className="hidden sm:inline-block">Search platform...</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 rounded">
            ⌘K
          </kbd>
        </button>

        {/* Live Gateway Pill */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-300 font-mono">
          <Activity className="w-3 h-3 text-emerald-400" />
          <span>Active (127.0.0.1:3001)</span>
        </div>

        {/* Documentation Link */}
        <Link to="/docs">
          <Button variant="ghost" size="sm" icon={<BookOpen className="w-3.5 h-3.5" />}>
            <span className="hidden sm:inline">Docs</span>
          </Button>
        </Link>

        {/* User Profile & Logout */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-[11px] font-medium text-zinc-200 font-mono truncate max-w-[140px]">
                {user.email}
              </span>
              <span className="text-[9px] text-emerald-400 font-mono">Authenticated</span>
            </div>
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
