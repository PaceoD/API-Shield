import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Activity,
  ShieldAlert,
  Radio,
  Clock,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Plus,
  Play,
  CheckCircle2,
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
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, MethodBadge, StatusCodeBadge } from '../components/ui/Badge';
import { Skeleton, MetricCardSkeleton, ErrorState } from '../components/ui/Skeleton';
import { analyticsService } from '../services/analyticsService';
import { apisService } from '../services/apisService';
import {
  AnalyticsOverview,
  TimeseriesPoint,
  EndpointStat,
  ApiConfig,
} from '../types/api';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointStat[]>([]);
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [overviewData, timeseriesData, endpointsData, apisData] = await Promise.all([
        analyticsService.getOverview({ range: timeRange }),
        analyticsService.getTimeseries({ range: timeRange }),
        analyticsService.getEndpoints({ range: timeRange }),
        apisService.getAll(),
      ]);

      setOverview(overviewData);
      setTimeseries(timeseriesData);
      setEndpoints(endpointsData);
      setApis(apisData);
    } catch (err: any) {
      console.error('Error fetching overview metrics:', err);
      setError(err.message || 'Failed to connect to APIShield service');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rangeLabels = {
    '1h': 'Last 1 hour',
    '24h': 'Last 24 hours',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            Gateway Overview
            <Badge variant="success" size="sm" className="hidden sm:inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time traffic performance, rate limits, and gateway metrics.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Time range selector */}
          <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-medium">
            {(['1h', '24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  timeRange === r
                    ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            loading={refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
            title="Refresh metrics"
          />

          <Link to="/apis">
            <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
              <span className="hidden sm:inline">Add API</span>
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Could not load gateway metrics"
          message={error}
          onRetry={() => fetchData()}
        />
      )}

      {/* 1. Top Section - High Value Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            {/* Total Requests */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                  <span>REQUESTS</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
                  {overview?.totalRequests.toLocaleString() ?? 0}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{rangeLabels[timeRange]}</span>
                  <span className="text-emerald-400 flex items-center gap-0.5 font-mono">
                    <TrendingUp className="w-3 h-3" />
                    {overview?.allowedRequests.toLocaleString()} allowed
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Blocked Requests */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                  <span>BLOCKED REQUESTS</span>
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-zinc-100 flex items-baseline gap-2">
                  <span>{overview?.blockedRequests.toLocaleString() ?? 0}</span>
                  <span className="text-xs font-sans font-medium text-amber-400/90">
                    ({overview?.blockRate ?? 0}% rate)
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>Rate limited & unauthorized</span>
                  <span className="text-amber-400 font-mono">429 / 401</span>
                </div>
              </CardContent>
            </Card>

            {/* Active APIs */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                  <span>ACTIVE APIS</span>
                  <Radio className="w-4 h-4 text-sky-400" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
                  {overview?.activeApisCount ?? 0}
                  <span className="text-xs font-sans font-normal text-zinc-500 ml-1.5">
                    / {overview?.totalApisCount ?? 0} configured
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{overview?.activeKeysCount ?? 0} active keys</span>
                  <Link to="/apis" className="text-sky-400 hover:underline flex items-center gap-0.5">
                    Manage <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Latency */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                  <span>AVG LATENCY</span>
                  <Clock className="w-4 h-4 text-purple-400" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-zinc-100">
                  {overview?.avgLatency ?? 0} <span className="text-sm font-sans font-normal text-zinc-400">ms</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 font-mono">
                  <span>P95: {overview?.p95Latency ?? 0} ms</span>
                  <span className="text-emerald-400 font-sans text-[11px]">Upstream direct</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 2. Primary Request Traffic Chart */}
      <Card>
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <span>Request Traffic Volume</span>
              <span className="text-xs font-normal text-zinc-500">({rangeLabels[timeRange]})</span>
            </div>
          }
          description="Traffic requests routed through the APIShield gateway over time."
          action={
            <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />
                Allowed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" />
                Blocked
              </span>
            </div>
          }
        />
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <Skeleton className="w-full h-full rounded" />
            </div>
          ) : timeseries.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-500 text-xs">
              No request traffic data recorded for {rangeLabels[timeRange]}.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="allowedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="blockedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#27272a' }}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#27272a' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as TimeseriesPoint;
                        return (
                          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-xs space-y-1 font-mono">
                            <p className="text-zinc-400 font-sans pb-1 border-b border-zinc-800">
                              {data.label}
                            </p>
                            <p className="text-zinc-200">
                              Total Requests:{' '}
                              <span className="font-bold text-zinc-100">{data.requests}</span>
                            </p>
                            <p className="text-emerald-400">
                              Allowed: <span className="font-bold">{data.allowed}</span>
                            </p>
                            <p className="text-amber-400">
                              Blocked: <span className="font-bold">{data.blocked}</span>
                            </p>
                            <p className="text-purple-400">
                              Avg Latency: <span className="font-bold">{data.avgLatency} ms</span>
                            </p>
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
                    fillOpacity={1}
                    fill="url(#allowedGrad)"
                    name="Allowed"
                  />
                  <Area
                    type="monotone"
                    dataKey="blocked"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#blockedGrad)"
                    name="Blocked"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. API Usage Breakdown & Top Endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Usage Breakdown */}
        <Card>
          <CardHeader
            title="API Usage Breakdown"
            description="Traffic distribution across configured APIs."
            action={
              <Link to="/apis" className="text-xs text-emerald-400 hover:underline">
                View all APIs
              </Link>
            }
          />
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            ) : apis.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                No APIs created yet.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {apis.map((api) => {
                  const reqCount = api.metrics?.totalRequests ?? 0;
                  const blocked = api.metrics?.blockedRequests ?? 0;
                  const lat = api.metrics?.avgLatency ?? 0;

                  return (
                    <div
                      key={api.id}
                      onClick={() => navigate(`/apis/${api.id}`)}
                      className="p-4 hover:bg-zinc-800/30 cursor-pointer transition-colors flex items-center justify-between gap-4 group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-xs text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
                            {api.name}
                          </span>
                          <Badge variant={api.enabled ? 'success' : 'default'} size="sm">
                            {api.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-mono truncate mt-0.5">
                          {api.targetUrl}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 text-right font-mono text-xs">
                        <div>
                          <div className="text-zinc-200 font-medium">{reqCount.toLocaleString()}</div>
                          <div className="text-[10px] text-zinc-500 font-sans">requests</div>
                        </div>
                        <div>
                          <div className={`font-medium ${blocked > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {blocked}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-sans">blocked</div>
                        </div>
                        <div>
                          <div className="text-zinc-300">{lat}ms</div>
                          <div className="text-[10px] text-zinc-500 font-sans">latency</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Endpoints */}
        <Card>
          <CardHeader
            title="Top Endpoints"
            description="Busiest endpoint paths routed by the gateway."
            action={
              <Link to="/analytics" className="text-xs text-emerald-400 hover:underline">
                Full analytics
              </Link>
            }
          />
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-8 w-full rounded" />
                <Skeleton className="h-8 w-full rounded" />
                <Skeleton className="h-8 w-full rounded" />
              </div>
            ) : endpoints.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                No endpoint request history recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {endpoints.slice(0, 5).map((ep, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 px-4 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MethodBadge method={ep.method} size="sm" />
                      <span className="font-mono text-zinc-300 truncate text-[11px]">
                        {ep.path}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 font-mono text-xs text-right">
                      <div>
                        <span className="text-zinc-200 font-medium">{ep.requests}</span>
                        <span className="text-zinc-500 text-[10px] ml-1">({ep.percentage}%)</span>
                      </div>
                      <span className="text-zinc-400 text-[11px] w-12 text-right">
                        {ep.avgLatency}ms
                      </span>
                      {ep.blockedCount > 0 ? (
                        <Badge variant="warning" size="sm">
                          {ep.blockedCount} blk
                        </Badge>
                      ) : (
                        <span className="w-12" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Rate Limiting & Latency Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rate Limit Activity Card */}
        <Card className="lg:col-span-1">
          <CardHeader
            title="Rate Limit Activity"
            description="Core throttling and block metrics."
          />
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="text-xs text-zinc-400">Total Allowed</span>
              <span className="font-mono text-sm font-semibold text-emerald-400">
                {overview?.allowedRequests.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="text-xs text-zinc-400">Total Blocked (429 / 401)</span>
              <span className="font-mono text-sm font-semibold text-amber-400">
                {overview?.blockedRequests.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="text-xs text-zinc-400">Block Rate</span>
              <span className="font-mono text-sm font-semibold text-zinc-200">
                {overview?.blockRate ?? 0}%
              </span>
            </div>

            {overview?.mostBlockedApi ? (
              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg">
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                  Most Blocked Resource
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-medium text-zinc-200">
                    {overview.mostBlockedApi.apiName}
                  </span>
                  <Badge variant="warning" size="sm">
                    {overview.mostBlockedApi.blockedCount} blocked
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All gateway traffic flowing within configured thresholds.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Test Gateway CTA Banner */}
        <Card className="lg:col-span-2 flex flex-col justify-between">
          <CardHeader
            title="Interactive Gateway Console"
            description="Test your rate limits, X-API-Key authentication, and upstream response latency in real-time."
          />
          <CardContent className="p-5">
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
              <div className="space-y-1">
                <div className="text-zinc-400">
                  <span className="text-emerald-400 font-semibold">GET</span> /api/gateway/
                  <span className="text-sky-300">jsonplaceholder</span>/users
                </div>
                <div className="text-zinc-500 text-[11px]">
                  Header: <span className="text-zinc-300">X-API-Key: sk_live_••••••••</span>
                </div>
              </div>

              {apis.length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/apis/${apis[0].id}?tab=test`)}
                  icon={<Play className="w-3.5 h-3.5 fill-current" />}
                >
                  Test Gateway Now
                </Button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <div className="text-xs text-zinc-400">RFC Response Headers</div>
                <div className="text-xs font-mono font-medium text-emerald-400 mt-1">
                  X-RateLimit-Limit
                </div>
              </div>
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <div className="text-xs text-zinc-400">Real Upstream Latency</div>
                <div className="text-xs font-mono font-medium text-sky-400 mt-1">
                  {overview?.avgLatency ?? 0} ms average
                </div>
              </div>
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <div className="text-xs text-zinc-400">429 Throttling</div>
                <div className="text-xs font-mono font-medium text-amber-400 mt-1">
                  Sliding Window
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
