import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OverviewPage } from './pages/OverviewPage';
import { ApisPage } from './pages/ApisPage';
import { ApiDetailsPage } from './pages/ApiDetailsPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DocsPage } from './pages/DocsPage';
import { SettingsPage } from './pages/SettingsPage';
import { EmptyState } from './components/ui/Skeleton';
import { Button } from './components/ui/Button';

const NotFoundPage: React.FC = () => {
  return (
    <div className="py-16">
      <EmptyState
        title="404 — Page Not Found"
        description="The requested dashboard route does not exist."
        action={
          <a href="/">
            <Button variant="primary" size="sm">
              Return to Overview
            </Button>
          </a>
        }
      />
    </div>
  );
};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Authentication Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Authenticated Application Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/apis" element={<ApisPage />} />
                <Route path="/apis/:id" element={<ApiDetailsPage />} />
                <Route path="/keys" element={<ApiKeysPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
