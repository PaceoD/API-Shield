import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Play,
  Key,
  Shield,
  Clock,
  ExternalLink,
  Edit2,
  Trash2,
  Send,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Plus,
  Lock,
  Server,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Button } from '../components/ui/Button';
import { Badge, MethodBadge, StatusCodeBadge } from '../components/ui/Badge';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { DataTable, Column } from '../components/ui/DataTable';
import { FormField } from '../components/ui/FormField';
import { Input, Textarea, Select, Switch } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CodeBlock, CopyButton, JsonViewer } from '../components/ui/CodeBlock';
import { Skeleton, ErrorState, EmptyState } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { apisService } from '../services/apisService';
import { keysService } from '../services/keysService';
import { analyticsService } from '../services/analyticsService';
import { gatewayService } from '../services/gatewayService';
import {
  ApiConfig,
  ApiKey,
  RequestLog,
  TimeseriesPoint,
  StatusCodeDistribution,
  GatewayTestResponse,
} from '../types/api';

export const ApiDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const currentTab = searchParams.get('tab') || 'test'; // Default to interactive test console for interviews!

  const [api, setApi] = useState<ApiConfig | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [statusCodes, setStatusCodes] = useState<StatusCodeDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Test Gateway State
  const [testMethod, setTestMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [testSubpath, setTestSubpath] = useState('/users');
  const [selectedKeySecret, setSelectedKeySecret] = useState('');
  const [sessionSecrets, setSessionSecrets] = useState<Record<string, string>>({});
  const [testBody, setTestBody] = useState('{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}');
  const [testSending, setTestSending] = useState(false);
  const [testResponse, setTestResponse] = useState<GatewayTestResponse | null>(null);

  // Create Key Modal inside this API
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // Edit API State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editRateLimit, setEditRateLimit] = useState('60');
  const [editRateWindowSeconds, setEditRateWindowSeconds] = useState('60');
  const [editEnabled, setEditEnabled] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete API State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchApiData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [apiData, keysData, logsData, timeseriesData, statusData] = await Promise.all([
        apisService.getById(id),
        keysService.getAll(id),
        analyticsService.getLogs({ apiId: id, limit: 50 }),
        analyticsService.getTimeseries({ apiId: id, range: '24h' }),
        analyticsService.getStatusCodes({ apiId: id, range: '24h' }),
      ]);

      setApi(apiData);
      setKeys(keysData);
      setLogs(logsData.logs);
      setTimeseries(timeseriesData);
      setStatusCodes(statusData);

      // Do NOT pre-select maskedKey as secret credentials. Raw secrets are kept in session state.

      // Pre-fill edit modal form
      setEditName(apiData.name);
      setEditTarget(apiData.targetUrl);
      setEditRateLimit(apiData.rateLimit.toString());
      setEditRateWindowSeconds((apiData.rateWindowSeconds || 60).toString());
      setEditEnabled(apiData.enabled);

      // Adjust subpath suggestion based on target API
      if (apiData.targetUrl.includes('jsonplaceholder')) {
        setTestSubpath('/users');
      } else if (apiData.targetUrl.includes('httpbin')) {
        setTestSubpath('/get');
      } else {
        setTestSubpath('/health');
      }
    } catch (err: any) {
      console.error('Failed to load API details:', err);
      setError(err.message || 'Failed to connect to APIShield service');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchApiData();
  }, [fetchApiData]);

  const handleTabChange = (tabId: string) => {
    setSearchParams({ tab: tabId });
  };

  // Test Request Handler
  const handleSendTestRequest = async () => {
    if (!api) return;
    setTestSending(true);
    try {
      let parsedBody: any = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(testMethod) && testBody.trim()) {
        try {
          parsedBody = JSON.parse(testBody);
        } catch {
          parsedBody = testBody;
        }
      }

      // Match key secret if selected from key list
      const effectiveKey: string | undefined = selectedKeySecret || undefined;

      const res = await gatewayService.testEndpoint({
        apiId: api.id,
        method: testMethod,
        subpath: testSubpath,
        apiKey: effectiveKey,
        body: parsedBody,
      });

      setTestResponse(res);

      if (res.statusCode === 200) {
        toast.success(`200 OK (${res.latencyMs}ms)`, 'Gateway forwarded request to upstream successfully.');
      } else if (res.statusCode === 429) {
        toast.warning('429 Too Many Requests', `Rate limit exceeded! Retry after ${res.retryAfter ?? 1}s.`);
      } else if (res.statusCode === 401) {
        toast.error('401 Unauthorized', 'Authentication failed. Please provide a valid API Key.');
      }

      // Refresh logs & metrics in background
      analyticsService.getLogs({ apiId: api.id, limit: 50 }).then((l) => setLogs(l.logs));
    } catch (err: any) {
      toast.error('Request failed', err.message);
    } finally {
      setTestSending(false);
    }
  };

  // Create Key Handler
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || !api) return;

    setCreatingKey(true);
    try {
      const created = await keysService.create({
        name: newKeyName.trim(),
        apiId: api.id,
      });
      setCreatedSecret(created.secretKey || null);
      if (created.secretKey) {
        setSessionSecrets((prev) => ({ ...prev, [created.id]: created.secretKey! }));
        setSelectedKeySecret(created.secretKey);
      }
      toast.success('API Key created', 'Store the secret key securely.');
      keysService.getAll(api.id).then(setKeys);
    } catch (err: any) {
      toast.error('Failed to create API key', err.message);
    } finally {
      setCreatingKey(false);
    }
  };

  // Revoke Key Handler
  const handleRevokeKey = async (keyId: string) => {
    try {
      await keysService.revoke(keyId);
      toast.success('Key revoked', 'This key can no longer authenticate requests.');
      keysService.getAll(id!).then(setKeys);
    } catch (err: any) {
      toast.error('Failed to revoke key', err.message);
    }
  };

  // Save Edit Handler
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!api) return;
    setSavingEdit(true);
    try {
      const updated = await apisService.update(api.id, {
        name: editName.trim(),
        targetUrl: editTarget.trim(),
        rateLimit: parseInt(editRateLimit, 10),
        rateWindowSeconds: parseInt(editRateWindowSeconds, 10) || 60,
        enabled: editEnabled,
      });
      setApi(updated);
      setIsEditModalOpen(false);
      toast.success('API updated', 'Configuration saved.');
    } catch (err: any) {
      toast.error('Failed to update API', err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete API Handler
  const handleDeleteApi = async () => {
    if (!api) return;
    setDeleting(true);
    try {
      await apisService.delete(api.id);
      toast.success('API deleted', `${api.name} was removed.`);
      navigate('/apis');
    } catch (err: any) {
      toast.error('Failed to delete API', err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !api) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !api) {
    return (
      <ErrorState
        title="API not found"
        message={error || `Could not locate API with ID '${id}'`}
        onRetry={fetchApiData}
      />
    );
  }

  const logColumns: Column<RequestLog>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      width: '18%',
      render: (log) => (
        <span className="font-mono text-[11px] text-zinc-400">
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      width: '12%',
      render: (log) => <MethodBadge method={log.method} size="sm" />,
    },
    {
      key: 'path',
      header: 'Path',
      width: '32%',
      render: (log) => (
        <span className="font-mono text-xs text-zinc-200 truncate">
          {log.targetPath || log.path}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '14%',
      render: (log) => <StatusCodeBadge code={log.statusCode} size="sm" />,
    },
    {
      key: 'latency',
      header: 'Latency',
      width: '12%',
      align: 'right',
      render: (log) => (
        <span className="font-mono text-xs text-zinc-300">
          {log.latencyMs} ms
        </span>
      ),
    },
    {
      key: 'result',
      header: 'State',
      width: '12%',
      align: 'right',
      render: (log) =>
        log.isBlocked ? (
          <Badge variant="warning" size="sm">
            {log.blockedReason === 'RATE_LIMIT_EXCEEDED' ? 'Throttled' : 'Blocked'}
          </Badge>
        ) : (
          <Badge variant="success" size="sm">
            Forwarded
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 sm:p-6 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 truncate">
                {api.name}
              </h1>
              <Badge variant={api.enabled ? 'success' : 'default'} size="sm">
                <span className={`w-1.5 h-1.5 rounded-full ${api.enabled ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                {api.enabled ? 'Active' : 'Disabled'}
              </Badge>
              <Badge variant="info" size="sm" className="hidden sm:inline-flex">
                <Lock className="w-3 h-3" /> Key Protected
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400 font-mono">
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-zinc-500">Target:</span>
                <span className="text-zinc-200">{api.targetUrl}</span>
                <CopyButton text={api.targetUrl} size="xs" />
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-zinc-500">Rate Limit:</span>
                <span className="text-emerald-400 font-semibold">{api.rateLimit} req</span> / {api.rateWindowSeconds === 60 ? 'min' : `${api.rateWindowSeconds}s`}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500">Gateway Route:</span>
                <code className="text-sky-300 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                  /api/gateway/{api.id}
                </code>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              icon={<Edit2 className="w-3.5 h-3.5" />}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs
        activeTab={currentTab}
        onChange={handleTabChange}
        tabs={[
          { id: 'test', label: 'Test Gateway Console', icon: <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/20" /> },
          { id: 'overview', label: 'Metrics & Activity', icon: <Activity className="w-4 h-4" /> },
          { id: 'keys', label: 'API Keys', icon: <Key className="w-4 h-4" />, badge: <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px]">{keys.length}</span> },
          { id: 'logs', label: 'Traffic Logs', icon: <Layers className="w-4 h-4" /> },
        ]}
      />

      {/* TAB 1: TEST GATEWAY CONSOLE (FLAGSHIP INTERVIEW FEATURE) */}
      {currentTab === 'test' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Request Composer (Left 6 cols) */}
          <div className="lg:col-span-6 space-y-4">
            <Card>
              <CardHeader
                title="Gateway Request Dispatcher"
                description="Send live HTTP requests through APIShield to test authentication, rate limiting, and response headers."
              />
              <CardContent className="p-5 space-y-4">
                {/* Method & Subpath Input */}
                <div className="flex gap-2">
                  <div className="w-28 shrink-0">
                    <Select
                      value={testMethod}
                      onChange={(e) => setTestMethod(e.target.value as any)}
                      options={[
                        { value: 'GET', label: 'GET' },
                        { value: 'POST', label: 'POST' },
                        { value: 'PUT', label: 'PUT' },
                        { value: 'PATCH', label: 'PATCH' },
                        { value: 'DELETE', label: 'DELETE' },
                      ]}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={testSubpath}
                      onChange={(e) => setTestSubpath(e.target.value)}
                      placeholder="/users or /posts/1"
                      className="font-mono"
                    />
                  </div>
                </div>

                {/* Live Gateway URL preview */}
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-400 flex items-center justify-between">
                  <span className="truncate">
                    <span className="text-zinc-500">Destination: </span>
                    <span className="text-emerald-400">{testMethod}</span> /api/gateway/{api.id}
                    <span className="text-zinc-200">{testSubpath.startsWith('/') ? testSubpath : `/${testSubpath}`}</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0 ml-2">
                    Active Gateway
                  </span>
                </div>

                {/* API Key Selector */}
                <FormField
                  label="Authentication (X-API-Key)"
                  description="Select an active key or enter a custom key to test authentication & rate limiting."
                >
                  <div className="space-y-2">
                    <Input
                      value={selectedKeySecret}
                      onChange={(e) => setSelectedKeySecret(e.target.value)}
                      placeholder="sk_live_..."
                      className="font-mono text-xs"
                    />
                    {keys.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-500">Active Keys:</span>
                        {keys
                          .filter((k) => k.status === 'active')
                          .map((k) => {
                            const rawSecret = sessionSecrets[k.id];
                            const isAvailable = Boolean(rawSecret);
                            return (
                              <button
                                key={k.id}
                                type="button"
                                onClick={() => {
                                  if (isAvailable && rawSecret) {
                                    setSelectedKeySecret(rawSecret);
                                    toast.info('Active Key Selected', `Using session secret for ${k.name}.`);
                                  } else {
                                    toast.warning(
                                      'Raw Secret Unavailable',
                                      `The secret for "${k.name}" was shown only once at creation. Generate a new key or enter your raw secret manually.`
                                    );
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors flex items-center gap-1.5 ${
                                  isAvailable
                                    ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/60'
                                    : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 border-zinc-700'
                                }`}
                                title={
                                  isAvailable
                                    ? 'Select raw secret stored in session memory'
                                    : 'Raw secret is no longer in memory. Generate a new key or enter it manually.'
                                }
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-400' : 'bg-amber-400/60'}`} />
                                {k.name} ({k.keySuffix})
                              </button>
                            );
                          })}
                      </div>
                    )}
                    {(!selectedKeySecret || selectedKeySecret.includes('•')) && (
                      <p className="text-[11px] text-amber-400/90 flex items-start gap-1 mt-1 font-sans">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                        <span>
                          For security, raw secrets are shown only once at creation. Generate a new key or manually enter a valid raw API key (<code className="font-mono text-amber-300">sk_live_...</code>).
                        </span>
                      </p>
                    )}
                  </div>
                </FormField>

                {/* Request Body (For POST/PUT/PATCH) */}
                {['POST', 'PUT', 'PATCH'].includes(testMethod) && (
                  <FormField
                    label="Request Body (JSON)"
                    description="Payload sent to upstream destination."
                  >
                    <Textarea
                      value={testBody}
                      onChange={(e) => setTestBody(e.target.value)}
                      rows={5}
                      className="font-mono text-xs"
                    />
                  </FormField>
                )}

                {/* Send Button */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-xs text-zinc-500">
                    Target: <span className="font-mono text-zinc-300">{api.targetUrl}</span>
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleSendTestRequest}
                    loading={testSending}
                    icon={<Send className="w-4 h-4" />}
                  >
                    Send Request
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick cURL Equivalent */}
            <CodeBlock
              title="cURL Equivalent Command"
              language="bash"
              code={`curl -X ${testMethod} "http://localhost:3001/api/gateway/${api.id}${testSubpath.startsWith('/') ? testSubpath : `/${testSubpath}`}" \\
  -H "X-API-Key: ${selectedKeySecret || 'YOUR_API_KEY'}" ${['POST', 'PUT'].includes(testMethod) ? `-H "Content-Type: application/json" \\\n  -d '${testBody.replace(/\n/g, '')}'` : ''}`}
            />
          </div>

          {/* Response Inspector (Right 6 cols) */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="h-full flex flex-col">
              <CardHeader
                title="Gateway Response Inspector"
                description="Live HTTP response, latency, and RFC rate-limit headers returned by APIShield."
                action={
                  testResponse ? (
                    <div className="flex items-center gap-2">
                      <StatusCodeBadge code={testResponse.statusCode} size="md" />
                      <span className="font-mono text-xs font-semibold text-zinc-300">
                        {testResponse.latencyMs} ms
                      </span>
                    </div>
                  ) : null
                }
              />
              <CardContent className="p-5 flex-1 flex flex-col justify-between">
                {!testResponse ? (
                  <div className="h-80 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                    <Play className="w-8 h-8 text-zinc-600 mb-2" />
                    <p className="text-xs font-medium text-zinc-400">No request sent yet</p>
                    <p className="text-[11px] text-zinc-500 max-w-xs mt-1">
                      Configure your method and subpath on the left, then click &quot;Send Request&quot; to test APIShield live.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Status & Rate Limit Summary Pill */}
                    <div
                      className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono ${
                        testResponse.statusCode === 200
                          ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                          : testResponse.statusCode === 429
                          ? 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                          : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {testResponse.statusCode === 200 && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {testResponse.statusCode === 429 && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        {testResponse.statusCode >= 400 && testResponse.statusCode !== 429 && (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                        <span>HTTP {testResponse.statusCode} {testResponse.statusText}</span>
                      </div>

                      <div className="flex items-center gap-3 font-sans text-xs">
                        <span>Latency: <strong className="font-mono">{testResponse.latencyMs}ms</strong></span>
                        {testResponse.rateLimitRemaining !== undefined && (
                          <span>
                            Tokens: <strong className="font-mono">{testResponse.rateLimitRemaining}/{testResponse.rateLimitTotal}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* RFC Rate Limit Headers Box */}
                    <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono space-y-1">
                      <div className="text-[10px] uppercase font-sans tracking-wider text-zinc-500 font-semibold mb-1">
                        Gateway RFC Headers
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-zinc-500">X-RateLimit-Limit: </span>
                          <span className="text-zinc-200">{testResponse.headers['x-ratelimit-limit'] ?? 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">X-RateLimit-Remaining: </span>
                          <span className={testResponse.rateLimitRemaining === 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                            {testResponse.headers['x-ratelimit-remaining'] ?? 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">X-RateLimit-Reset: </span>
                          <span className="text-zinc-200">{testResponse.headers['x-ratelimit-reset'] ? `${testResponse.headers['x-ratelimit-reset']}s` : 'N/A'}</span>
                        </div>
                        {testResponse.headers['retry-after'] && (
                          <div>
                            <span className="text-amber-400">Retry-After: </span>
                            <span className="text-amber-300 font-bold">{testResponse.headers['retry-after']}s</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Response Body JSON Viewer */}
                    <div>
                      <div className="text-xs font-medium text-zinc-400 mb-1.5 flex items-center justify-between">
                        <span>Response Body</span>
                        <span className="text-[11px] text-zinc-500 font-mono">application/json</span>
                      </div>
                      <JsonViewer data={testResponse.body} maxHeight="280px" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: OVERVIEW & ACTIVITY */}
      {currentTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <span className="text-xs text-zinc-400 font-medium">TOTAL REQUESTS (24H)</span>
                <div className="text-2xl font-bold font-mono text-zinc-100 mt-2">
                  {api.metrics?.totalRequests.toLocaleString() ?? 0}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Routed to {api.targetUrl}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <span className="text-xs text-zinc-400 font-medium">BLOCKED REQUESTS</span>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
                  {api.metrics?.blockedRequests.toLocaleString() ?? 0}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Rate limit: {api.rateLimit} req / {api.rateWindowSeconds === 60 ? 'min' : `${api.rateWindowSeconds}s`}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <span className="text-xs text-zinc-400 font-medium">AVG UPSTREAM LATENCY</span>
                <div className="text-2xl font-bold font-mono text-purple-400 mt-2">
                  {api.metrics?.avgLatency ?? 0} <span className="text-sm font-sans font-normal text-zinc-400">ms</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  P95: {api.metrics?.p95Latency ?? 0} ms
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Traffic Chart */}
          <Card>
            <CardHeader
              title="24-Hour Traffic Volume"
              description={`Request volume routed through /api/gateway/${api.id}`}
            />
            <CardContent className="p-5">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="apiAllowed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as TimeseriesPoint;
                          return (
                            <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-xs font-mono">
                              <p className="text-zinc-400">{data.label}</p>
                              <p className="text-emerald-400 font-bold">{data.requests} requests</p>
                              <p className="text-zinc-300">{data.avgLatency} ms latency</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={2} fill="url(#apiAllowed)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: API KEYS */}
      {currentTab === 'keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">API Access Credentials</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Keys authorized to authenticate against this protected API.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNewKeyName('');
                setCreatedSecret(null);
                setIsKeyModalOpen(true);
              }}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Generate Key
            </Button>
          </div>

          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Key Name',
                width: '30%',
                render: (k) => <span className="font-semibold text-xs text-zinc-200">{k.name}</span>,
              },
              {
                key: 'maskedKey',
                header: 'Token',
                width: '30%',
                render: (k) => (
                  <code className="font-mono text-xs text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                    {k.maskedKey}
                  </code>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                width: '15%',
                render: (k) => (
                  <Badge variant={k.status === 'active' ? 'success' : 'error'} size="sm">
                    {k.status === 'active' ? 'Active' : 'Revoked'}
                  </Badge>
                ),
              },
              {
                key: 'created',
                header: 'Created',
                width: '15%',
                render: (k) => (
                  <span className="text-xs text-zinc-400 font-mono">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                width: '10%',
                align: 'right',
                render: (k) =>
                  k.status === 'active' ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRevokeKey(k.id)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-xs text-zinc-600">Revoked</span>
                  ),
              },
            ]}
            data={keys}
            keyExtractor={(k) => k.id}
            emptyTitle="No API Keys for this API"
            emptyDescription="Generate an API key to test authenticated requests through the gateway."
            emptyAction={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setNewKeyName('');
                  setCreatedSecret(null);
                  setIsKeyModalOpen(true);
                }}
              >
                Generate Key
              </Button>
            }
          />
        </div>
      )}

      {/* TAB 4: TRAFFIC LOGS */}
      {currentTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Live Gateway Request Stream</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time traffic processed for {api.name}.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyticsService.getLogs({ apiId: api.id, limit: 50 }).then((l) => setLogs(l.logs))}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
          </div>

          <DataTable
            columns={logColumns}
            data={logs}
            keyExtractor={(l) => l.id}
            emptyTitle="No traffic logs yet"
            emptyDescription="Send a request using the Test Gateway tab to see logs appear here in real-time."
          />
        </div>
      )}

      {/* Create Key Modal */}
      <Modal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        title={createdSecret ? 'API Key Created' : `Create Key for ${api.name}`}
        description={
          createdSecret
            ? 'This secret key will only be shown once. Copy and store it securely.'
            : 'Generate a secret token used in the X-API-Key header to authenticate.'
        }
        footer={
          createdSecret ? (
            <Button variant="primary" size="sm" onClick={() => setIsKeyModalOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsKeyModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCreateKey} loading={creatingKey}>
                Generate Secret
              </Button>
            </>
          )
        }
      >
        {createdSecret ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-zinc-950 border border-emerald-800/60 flex items-center justify-between gap-2">
              <code className="font-mono text-xs text-emerald-400 break-all select-all">
                {createdSecret}
              </code>
              <CopyButton text={createdSecret} label="Copy" />
            </div>
            <p className="text-xs text-amber-300/90 leading-relaxed">
              ⚠️ Make sure to copy your API key now. You will not be able to see it again!
            </p>
          </div>
        ) : (
          <form onSubmit={handleCreateKey} className="space-y-4">
            <FormField label="Key Name" required description="Descriptive identifier for this client.">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production Client / Backend Worker"
                required
              />
            </FormField>
          </form>
        )}
      </Modal>

      {/* Edit API Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit ${api.name}`}
        description="Update routing and rate limit parameters."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit} loading={savingEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <FormField label="API Name" required>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </FormField>
          <FormField label="Target URL" required>
            <Input value={editTarget} onChange={(e) => setEditTarget(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Rate Limit (Requests)" required>
              <Input type="number" value={editRateLimit} onChange={(e) => setEditRateLimit(e.target.value)} />
            </FormField>
            <FormField label="Window Duration" required>
              <Select
                value={editRateWindowSeconds}
                onChange={(e) => setEditRateWindowSeconds(e.target.value)}
                options={[
                  { value: '10', label: '10 seconds' },
                  { value: '60', label: '1 minute (60s)' },
                  { value: '300', label: '5 minutes (300s)' },
                  { value: '3600', label: '1 hour (3600s)' },
                ]}
              />
            </FormField>
          </div>
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
            <Switch
              checked={editEnabled}
              onChange={setEditEnabled}
              label="API Enabled"
              description="Disable to block all incoming traffic with 403 Forbidden"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteApi}
        loading={deleting}
        title={`Delete "${api.name}"?`}
        message="This API will be permanently removed from the gateway."
      />
    </div>
  );
};
