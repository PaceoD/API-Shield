import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield } from 'lucide-react';

export const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-600/50 flex items-center justify-center text-emerald-400 animate-pulse">
          <Shield className="w-6 h-6 fill-emerald-500/20" />
        </div>
        <span className="text-xs font-mono text-zinc-500">Verifying session...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};
