import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  ShieldAlert,
  Clock,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, MethodBadge, StatusCodeBadge } from '../components/ui/Badge';
import { Select } from '../components/ui/Input';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { JsonViewer, CopyButton } from '../components/ui/CodeBlock';
import { Skeleton, ErrorState } from '../components/ui/Skeleton';
import { analyticsService } from '../services/analyticsService';
import { apisService } from '../services/apisService';
import {
  AnalyticsOverview,
  TimeseriesPoint,
  EndpointStat,
  StatusCodeDistribution,
  RequestLog,
  ApiConfig,
} from '../types/api';

export const AnalyticsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters read from URL search params for bookmarkable/refreshable URLs
  const range = (searchParams.get('range') as '1h' | '24h' | '7d' | '30d') || '24h';
  const apiId = searchParams.get('api') || 'all';
  const traffic = (searchParams.get('traffic') as 'all' | 'allowed' | 'blocked') || 'all';
  const status = searchParams.get('status') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointStat[]>([]);
  const [statusCodes, setStatusCodes] = useState<StatusCodeDistribution[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Log Detail Modal
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || !value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const [apisData, overviewData, timeseriesData, endpointsData, statusData, logsData] =
          await Promise.all([
            apisService.getAll(),
            analyticsService.getOverview({ range, apiId }),
            analyticsService.getTimeseries({ range, apiId, traffic, status }),
            analyticsService.getEndpoints({ range, apiId }),
            analyticsService.getStatusCodes({ range, apiId }),
            analyticsService.getLogs({
              range,
              apiId,
              traffic,
              status,
              limit: 25,
              offset: (page - 1) * 25,
            }),
          ]);

        setApis(apisData);
        setOverview(overviewData);
        setTimeseries(timeseriesData);
        setEndpoints(endpointsData);
        setStatusCodes(statusData);
        setLogs(logsData.logs);
        setTotalLogs(logsData.total);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, apiId, traffic, status, page]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const logColumns: Column<RequestLog>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      width: '16%',
      render: (l) => (
        <span className="font-mono text-xs text-zinc-400">
          {new Date(l.timestamp).toLocaleTimeString()}
        </span>
      ),
    },
    {
      key: 'api',
      header: 'API',
      width: '18%',
      render: (l) => (
        <span className="font-medium text-xs text-zinc-200 truncate">{l.apiName}</span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      width: '10%',
      render: (l) => <MethodBadge method={l.method} size="sm" />,
    },
    {
      key: 'path',
      header: 'Endpoint Path',
      width: '24%',
      render: (l) => (
        <span className="font-mono text-xs text-zinc-300 truncate">
          {l.targetPath || l.path}
        </span>
      ),
    },
    {
      key: 'statusCode',
      header: 'Status',
      width: '12%',
      render: (l) => <StatusCodeBadge code={l.statusCode} size="sm" />,
    },
    {
      key: 'latency',
      header: 'Latency',
      width: '10%',
      align: 'right',
      render: (l) => (
        <span className="font-mono text-xs text-zinc-300">{l.latencyMs} ms</span>
      ),
    },
    {
      key: 'result',
      header: 'State',
      width: '10%',
      align: 'right',
      render: (l) =>
        l.isBlocked ? (
          <Badge variant="warning" size="sm">
            Blocked
          </Badge>
        ) : (
          <Badge variant="success" size="sm">
            Allowed
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            Analytics & Observability
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Deep-dive traffic trends, latency distribution, rate-limit throttles, and gateway request streams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            loading={refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorState title="Analytics Error" message={error} onRetry={() => fetchData()} />}

      {/* URL Synchronized Filter Bar */}
      <Card>
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            {/* API Filter */}
            <div className="w-44">
              <Select
                value={apiId}
                onChange={(e) => updateParam('api', e.target.value)}
                options={[
                  { value: 'all', label: 'All APIs' },
                  ...apis.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </div>

            {/* Traffic Type Filter */}
            <div className="w-36">
              <Select
                value={traffic}
                onChange={(e) => updateParam('traffic', e.target.value)}
                options={[
                  { value: 'all', label: 'All Traffic' },
                  { value: 'allowed', label: 'Allowed Only' },
                  { value: 'blocked', label: 'Blocked Only' },
                ]}
              />
            </div>

            {/* Status Code Filter */}
            <div className="w-36">
              <Select
                value={status}
                onChange={(e) => updateParam('status', e.target.value)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: '2xx', label: '2xx Success' },
                  { value: '429', label: '429 Rate Limit' },
                  { value: '4xx', label: '4xx Errors' },
                  { value: '5xx', label: '5xx Server' },
                ]}
              />
            </div>

            {/* Time Range Selector */}
            <div className="ml-auto flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs">
              {(['1h', '24h', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => updateParam('range', r)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    range === r
                      ? 'bg-zinc-800 text-zinc-100 font-semibold text-emerald-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <span className="text-xs text-zinc-400 font-medium">TOTAL REQUESTS</span>
            <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">
              {overview?.totalRequests.toLocaleString() ?? 0}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Within selected filters</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <span className="text-xs text-zinc-400 font-medium">ALLOWED / BLOCKED</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1 flex items-baseline gap-2">
              <span>{overview?.allowedRequests.toLocaleString() ?? 0}</span>
              <span className="text-xs font-normal text-amber-400">
                / {overview?.blockedRequests ?? 0} blk ({overview?.blockRate ?? 0}%)
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-1">Sliding-window throttled</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <span className="text-xs text-zinc-400 font-medium">AVERAGE LATENCY</span>
            <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
              {overview?.avgLatency ?? 0} <span className="text-sm font-normal text-zinc-400">ms</span>
            </div>
            <div className="text-xs text-zinc-500 mt-1">P95: {overview?.p95Latency ?? 0} ms</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <span className="text-xs text-zinc-400 font-medium">ACTIVE APIS</span>
            <div className="text-2xl font-bold font-mono text-sky-400 mt-1">
              {overview?.activeApisCount ?? 0}
              <span className="text-xs text-zinc-500 font-normal ml-1">
                / {overview?.totalApisCount ?? 0}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {overview?.activeKeysCount ?? 0} authenticated keys
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visualizations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Traffic Area Chart (8 cols) */}
        <div className="lg:col-span-8">
          <Card className="h-full">
            <CardHeader
              title="Request Volume Over Time"
              description="Allowed vs Blocked throughput in selected time window."
            />
            <CardContent className="p-4 sm:p-6">
              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <Skeleton className="w-full h-full rounded" />
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="analyticsAllowed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="analyticsBlocked" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
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
                                <p className="text-zinc-400 font-sans pb-1 border-b border-zinc-800">
                                  {data.label}
                                </p>
                                <p className="text-emerald-400">Allowed: {data.allowed}</p>
                                <p className="text-amber-400">Blocked: {data.blocked}</p>
                                <p className="text-purple-400">Latency: {data.avgLatency}ms</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="allowed"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#analyticsAllowed)"
                      />
                      <Area
                        type="monotone"
                        dataKey="blocked"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#analyticsBlocked)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Codes Distribution (4 cols) */}
        <div className="lg:col-span-4">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader
              title="Status Code Distribution"
              description="HTTP status breakdown across requests."
            />
            <CardContent className="p-4 sm:p-5 space-y-4">
              {statusCodes.map((sc) => {
                let barColor = 'bg-emerald-500';
                if (sc.codeGroup.includes('429')) barColor = 'bg-amber-500';
                else if (sc.codeGroup.includes('4xx')) barColor = 'bg-sky-500';
                else if (sc.codeGroup.includes('5xx')) barColor = 'bg-rose-500';

                return (
                  <div key={sc.codeGroup} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-300 font-medium">{sc.codeGroup}</span>
                      <span className="text-zinc-400">
                        {sc.count} ({sc.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-all duration-300`}
                        style={{ width: `${Math.max(sc.percentage, sc.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Latency & Top Endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Latency Trend Area Chart (6 cols) */}
        <div className="lg:col-span-6">
          <Card>
            <CardHeader
              title="Latency Trends (P50 & P95)"
              description="Response roundtrip latency in milliseconds over time."
            />
            <CardContent className="p-4 sm:p-6">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
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
                            <div className="bg-zinc-900 border border-zinc-700 p-2.5 rounded-lg text-xs font-mono">
                              <p className="text-zinc-400">{data.label}</p>
                              <p className="text-purple-400">Avg Latency: {data.avgLatency} ms</p>
                              <p className="text-purple-300">P95 Latency: {data.p95Latency} ms</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="avgLatency"
                      stroke="#a855f7"
                      strokeWidth={2}
                      fill="url(#latencyGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Endpoints Table (6 cols) */}
        <div className="lg:col-span-6">
          <Card>
            <CardHeader
              title="Top Ranked Endpoints"
              description="Endpoints ranked by traffic volume and error rates."
            />
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
                {endpoints.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    No endpoint traffic recorded.
                  </div>
                ) : (
                  endpoints.map((ep, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 px-4 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MethodBadge method={ep.method} size="sm" />
                        <span className="font-mono text-zinc-200 truncate">{ep.path}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 font-mono text-xs text-right">
                        <div>
                          <span className="text-zinc-200 font-semibold">{ep.requests}</span>
                          <span className="text-zinc-500 text-[10px] ml-1">({ep.percentage}%)</span>
                        </div>
                        <span className="text-zinc-400 w-12 text-right">{ep.avgLatency}ms</span>
                        {ep.blockedCount > 0 && (
                          <Badge variant="warning" size="sm">
                            {ep.blockedCount} blk
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live Request Logs Stream */}
      <Card>
        <CardHeader
          title="Live Gateway Request Stream"
          description="Detailed inspection of every request processed by APIShield. Click any log row to inspect payload and header details."
          action={
            <Badge variant="outline" size="sm">
              {totalLogs} requests recorded
            </Badge>
          }
        />
        <CardContent className="p-0">
          <DataTable
            columns={logColumns}
            data={logs}
            keyExtractor={(l) => l.id}
            loading={loading}
            onRowClick={(log) => setSelectedLog(log)}
            pagination={{
              currentPage: page,
              pageSize: 25,
              totalItems: totalLogs,
              onPageChange: (newPage) => updateParam('page', newPage.toString()),
            }}
          />
        </CardContent>
      </Card>

      {/* Log Detail Drawer / Modal */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title={
            <div className="flex items-center gap-2.5 font-mono text-sm">
              <MethodBadge method={selectedLog.method} />
              <span>{selectedLog.path}</span>
            </div>
          }
          description={`Log ID: ${selectedLog.id} • ${new Date(selectedLog.timestamp).toLocaleString()}`}
          footer={
            <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4 text-xs font-mono">
            {/* Status overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block">Status Code</span>
                <StatusCodeBadge code={selectedLog.statusCode} size="md" />
              </div>
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block">Roundtrip Latency</span>
                <span className="text-zinc-200 font-bold">{selectedLog.latencyMs} ms</span>
              </div>
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block">API Key</span>
                <span className="text-zinc-300 truncate block">{selectedLog.keyName || 'Unauthenticated'}</span>
              </div>
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block">Rate Limit Quota</span>
                <span className="text-emerald-400 font-bold">
                  {selectedLog.rateLimitTotal} req/window
                </span>
              </div>
            </div>

            {/* Blocked reason */}
            {selectedLog.isBlocked && (
              <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded text-amber-300">
                <strong>Throttled: </strong>
                {selectedLog.blockedReason === 'RATE_LIMIT_EXCEEDED'
                  ? 'Request rejected because client exceeded maximum allowed requests in window (HTTP 429).'
                  : selectedLog.blockedReason === 'INVALID_API_KEY'
                  ? 'Request rejected due to missing, invalid, or revoked API Key (HTTP 401).'
                  : 'Request blocked.'}
              </div>
            )}

            {/* Metadata JSON */}
            <div>
              <div className="text-zinc-400 font-sans font-medium mb-1">Full Request Metadata</div>
              <JsonViewer data={selectedLog} maxHeight="220px" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
