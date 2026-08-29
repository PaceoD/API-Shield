import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Server,
  Database,
  Cpu,
  Save,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { FormField } from '../components/ui/FormField';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton, ErrorState } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { systemService } from '../services/systemService';
import { SystemInfo, SystemSettings } from '../types/api';

export const SettingsPage: React.FC = () => {
  const toast = useToast();

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultLimit, setDefaultLimit] = useState('60');
  const [defaultWindow, setDefaultWindow] = useState('60000');
  const [timeoutMs, setTimeoutMs] = useState('10000');
  const [corsOrigins, setCorsOrigins] = useState('*');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [infoData, settingsData] = await Promise.all([
        systemService.getSystemInfo(),
        systemService.getSettings(),
      ]);
      setInfo(infoData);
      setSettings(settingsData);

      setBaseUrl(settingsData.gatewayBaseUrl);
      setDefaultLimit(settingsData.defaultRateLimit.toString());
      setDefaultWindow(settingsData.defaultRateWindowMs.toString());
      setTimeoutMs(settingsData.requestTimeoutMs.toString());
      setCorsOrigins(settingsData.corsAllowedOrigins);
    } catch (err: any) {
      setError(err.message || 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const windowLabel =
        defaultWindow === '10000'
          ? '10 seconds'
          : defaultWindow === '60000'
          ? '1 minute'
          : defaultWindow === '300000'
          ? '5 minutes'
          : '1 hour';

      const res = await systemService.saveSettings({
        gatewayBaseUrl: baseUrl.trim(),
        defaultRateLimit: parseInt(defaultLimit, 10),
        defaultRateWindowMs: parseInt(defaultWindow, 10),
        defaultRateWindowLabel: windowLabel,
        requestTimeoutMs: parseInt(timeoutMs, 10),
        corsAllowedOrigins: corsOrigins.trim(),
      });
      setSettings(res.data);
      toast.success('Settings saved', res.message);
    } catch (err: any) {
      toast.error('Failed to save settings', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !info) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gateway Settings & Engine Status"
        description="Configure runtime proxy defaults, rate-limit thresholds, and inspect engine metrics."
        badge={
          <Badge variant="success" size="sm">
            Engine Online
          </Badge>
        }
      />

      {error && <ErrorState title="System Error" message={error} onRetry={fetchData} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gateway Configuration Form (7 cols) */}
        <div className="lg:col-span-7">
          <Card>
            <CardHeader
              title="Gateway Engine Configuration"
              description="Default settings applied to newly created API proxies and routing."
            />
            <form onSubmit={handleSave}>
              <CardContent className="p-5 space-y-4">
                <FormField
                  label="Gateway Base URL"
                  description="Root entry URL used in documentation and cURL generation."
                >
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:3001"
                  />
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Default Rate Limit (Requests)"
                    description="Standard threshold per window."
                  >
                    <Input
                      type="number"
                      value={defaultLimit}
                      onChange={(e) => setDefaultLimit(e.target.value)}
                      min="1"
                    />
                  </FormField>

                  <FormField
                    label="Default Rate Window"
                    description="Standard sliding window size."
                  >
                    <Select
                      value={defaultWindow}
                      onChange={(e) => setDefaultWindow(e.target.value)}
                      options={[
                        { value: '10000', label: '10 seconds' },
                        { value: '60000', label: '1 minute' },
                        { value: '300000', label: '5 minutes' },
                        { value: '3600000', label: '1 hour' },
                      ]}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Upstream Request Timeout (ms)"
                    description="Time before returning 504 Gateway Timeout."
                  >
                    <Input
                      type="number"
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(e.target.value)}
                      min="1000"
                      step="1000"
                    />
                  </FormField>

                  <FormField
                    label="CORS Allowed Origins"
                    description="Access-Control-Allow-Origin header."
                  >
                    <Input
                      value={corsOrigins}
                      onChange={(e) => setCorsOrigins(e.target.value)}
                      placeholder="*"
                    />
                  </FormField>
                </div>
              </CardContent>

              <CardFooter className="justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={saving}
                  icon={<Save className="w-3.5 h-3.5" />}
                >
                  Save Gateway Settings
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        {/* System & Runtime Information (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader
              title="System Information"
              description="Live telemetry from the Node.js APIShield engine."
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={fetchData}
                  icon={<RefreshCw className="w-3 h-3" />}
                />
              }
            />
            <CardContent className="p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Gateway Engine</span>
                <span className="text-emerald-400 font-semibold">{info?.version ?? '1.2.0-core'}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Node.js Runtime</span>
                <span className="text-zinc-200">{info?.nodeVersion ?? 'v20+'}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Gateway Uptime</span>
                <span className="text-zinc-200">{info?.uptimeSeconds ?? 0} seconds</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Heap Memory</span>
                <span className="text-purple-400 font-bold">{info?.memoryUsageMb ?? 0} MB</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-zinc-500 font-sans">Storage Engine</span>
                <span className="text-zinc-300">{info?.storageEngine}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-sans">Total Logs Stored</span>
                <span className="text-sky-400 font-bold">{info?.totalLogsStored ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Developer Preferences"
              description="Workspace UI & theme preferences."
            />
            <CardContent className="p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Theme</span>
                <Badge variant="outline" size="sm">Dark (Default)</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Font Family</span>
                <span className="font-mono text-zinc-400">Inter & JetBrains Mono</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Keyboard Shortcuts</span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-400">
                  ⌘K / Ctrl+K
                </kbd>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
