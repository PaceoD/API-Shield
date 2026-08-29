import { prisma } from '../database/prisma';
import { AnalyticsOverview, TimeseriesPoint, EndpointStat, StatusCodeDistribution } from '../types';
import { BadRequestError } from '../errors/AppError';

function getFilterTimeWindow(range?: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();

  if (from || to) {
    const start = from ? new Date(from) : new Date(now.getTime() - 24 * 3600 * 1000);
    const end = to ? new Date(to) : now;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestError('Invalid date format for from/to filter.');
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestError("'from' date must be earlier than or equal to 'to' date.");
    }
    return { start, end };
  }

  switch (range) {
    case '1h':
      return { start: new Date(now.getTime() - 3600 * 1000), end: now };
    case '7d':
      return { start: new Date(now.getTime() - 7 * 24 * 3600 * 1000), end: now };
    case '30d':
      return { start: new Date(now.getTime() - 30 * 24 * 3600 * 1000), end: now };
    case '24h':
    default:
      return { start: new Date(now.getTime() - 24 * 3600 * 1000), end: now };
  }
}

export interface DetailedAnalyticsQuery {
  apiId?: string;
  from?: string;
  to?: string;
  endpoint?: string;
  status?: string;
  blocked?: boolean;
}

export class AnalyticsService {
  /**
   * Persists a real request statistic record in PostgreSQL for live gateway traffic.
   * Non-blocking: logs safely on failure without breaking the client response.
   */
  public async recordGatewayStat(data: {
    apiId: string;
    apiKeyId?: string | null;
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs?: number | null;
    blocked?: boolean;
  }): Promise<void> {
    try {
      await prisma.requestStat.create({
        data: {
          apiId: data.apiId,
          apiKeyId: data.apiKeyId || null,
          endpoint: data.endpoint,
          method: data.method.toUpperCase(),
          statusCode: data.statusCode,
          latencyMs: data.latencyMs !== undefined ? data.latencyMs : null,
          blocked: data.blocked || false,
        },
      });
    } catch (err) {
      console.error('Failed to record gateway request statistic to database:', err);
    }
  }

  /**
   * Calculates high-level overview metrics from real RequestStat rows.
   */
  public async getOverview(
    userId: string,
    apiId?: string,
    range?: string,
    from?: string,
    to?: string
  ): Promise<AnalyticsOverview> {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);

    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...(apiId && apiId !== 'all' ? { id: apiId } : {}),
        },
      },
      select: {
        apiId: true,
        statusCode: true,
        latencyMs: true,
        blocked: true,
        api: { select: { name: true } },
      },
    });

    const totalApisCount = await prisma.api.count({ where: { userId } });
    const activeApisCount = await prisma.api.count({ where: { userId, enabled: true } });
    const activeKeysCount = await prisma.apiKey.count({
      where: { api: { userId }, revokedAt: null },
    });

    const totalRequests = stats.length;
    const blockedRequests = stats.filter((s) => s.blocked).length;
    const allowedRequests = totalRequests - blockedRequests;
    const blockRate = totalRequests > 0 ? Number(((blockedRequests / totalRequests) * 100).toFixed(1)) : 0;

    const latencies = stats.map((s) => s.latencyMs || 0).sort((a, b) => a - b);
    const avgLatency =
      totalRequests > 0
        ? Math.round(latencies.reduce((acc, lat) => acc + lat, 0) / totalRequests)
        : 0;
    const p95Latency =
      latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    // Find most blocked API
    const blockedMap: Record<string, { apiId: string; apiName: string; blockedCount: number }> = {};
    for (const s of stats) {
      if (s.blocked) {
        if (!blockedMap[s.apiId]) {
          blockedMap[s.apiId] = { apiId: s.apiId, apiName: s.api.name, blockedCount: 0 };
        }
        blockedMap[s.apiId].blockedCount++;
      }
    }
    const sortedBlocked = Object.values(blockedMap).sort((a, b) => b.blockedCount - a.blockedCount);
    const mostBlockedApi = sortedBlocked.length > 0 && sortedBlocked[0].blockedCount > 0 ? sortedBlocked[0] : null;

    return {
      totalRequests,
      blockedRequests,
      allowedRequests,
      blockRate,
      activeApisCount,
      totalApisCount,
      activeKeysCount,
      avgLatency,
      p95Latency,
      mostBlockedApi,
    };
  }

  /**
   * Generates time-bucketed request statistics from real RequestStat records.
   */
  public async getTimeseries(
    userId: string,
    range = '24h',
    apiId?: string,
    traffic?: 'all' | 'allowed' | 'blocked',
    from?: string,
    to?: string
  ): Promise<TimeseriesPoint[]> {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);
    const windowStartMs = windowStart.getTime();
    const windowEndMs = windowEnd.getTime();

    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...(apiId && apiId !== 'all' ? { id: apiId } : {}),
        },
        ...(traffic === 'allowed' ? { blocked: false } : {}),
        ...(traffic === 'blocked' ? { blocked: true } : {}),
      },
      select: {
        createdAt: true,
        latencyMs: true,
        blocked: true,
      },
    });

    let bucketCount = 24;
    let bucketDurationMs = (windowEndMs - windowStartMs) / bucketCount;

    if (range === '1h') {
      bucketCount = 12;
      bucketDurationMs = 5 * 60 * 1000;
    } else if (range === '7d') {
      bucketCount = 14;
      bucketDurationMs = 12 * 3600 * 1000;
    } else if (range === '30d') {
      bucketCount = 30;
      bucketDurationMs = 24 * 3600 * 1000;
    }

    const buckets: TimeseriesPoint[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bStart = windowStartMs + i * bucketDurationMs;
      const bEnd = bStart + bucketDurationMs;
      const bucketDate = new Date(bEnd);

      let label = '';
      if (range === '1h' || range === '24h') {
        label = bucketDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        label = bucketDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      const bucketStats = stats.filter((s) => {
        const t = s.createdAt.getTime();
        return t >= bStart && t < bEnd;
      });

      const requests = bucketStats.length;
      const blocked = bucketStats.filter((s) => s.blocked).length;
      const allowed = requests - blocked;
      const latencies = bucketStats.map((s) => s.latencyMs || 0).sort((a, b) => a - b);
      const avgLatency =
        requests > 0
          ? Math.round(latencies.reduce((acc, l) => acc + l, 0) / requests)
          : 0;
      const p95Latency =
        latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : avgLatency;

      buckets.push({
        timestamp: new Date(bEnd).toISOString(),
        label,
        requests,
        allowed,
        blocked,
        avgLatency,
        p95Latency,
      });
    }

    return buckets;
  }

  /**
   * Aggregates real endpoint access frequencies and error rates.
   */
  public async getTopEndpoints(
    userId: string,
    range?: string,
    apiId?: string,
    from?: string,
    to?: string
  ): Promise<EndpointStat[]> {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);

    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...(apiId && apiId !== 'all' ? { id: apiId } : {}),
        },
      },
      select: {
        endpoint: true,
        method: true,
        statusCode: true,
        latencyMs: true,
        blocked: true,
      },
    });

    const totalLogs = stats.length;
    const endpointMap: Record<
      string,
      { method: string; path: string; requests: number; totalLatency: number; errorCount: number; blockedCount: number }
    > = {};

    for (const s of stats) {
      const key = `${s.method} ${s.endpoint}`;
      if (!endpointMap[key]) {
        endpointMap[key] = {
          method: s.method,
          path: s.endpoint,
          requests: 0,
          totalLatency: 0,
          errorCount: 0,
          blockedCount: 0,
        };
      }
      endpointMap[key].requests++;
      endpointMap[key].totalLatency += s.latencyMs || 0;
      if (s.statusCode >= 400) {
        endpointMap[key].errorCount++;
      }
      if (s.blocked) {
        endpointMap[key].blockedCount++;
      }
    }

    return Object.values(endpointMap)
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)
      .map((e) => ({
        method: e.method,
        path: e.path,
        requests: e.requests,
        percentage: totalLogs > 0 ? Number(((e.requests / totalLogs) * 100).toFixed(1)) : 0,
        avgLatency: Math.round(e.totalLatency / e.requests),
        errorCount: e.errorCount,
        blockedCount: e.blockedCount,
      }));
  }

  /**
   * Computes status code distribution from authentic RequestStat rows.
   */
  public async getStatusCodes(
    userId: string,
    range?: string,
    apiId?: string,
    from?: string,
    to?: string
  ): Promise<StatusCodeDistribution[]> {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);

    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...(apiId && apiId !== 'all' ? { id: apiId } : {}),
        },
      },
      select: {
        statusCode: true,
      },
    });

    const total = stats.length;
    let c2xx = 0;
    let c429 = 0;
    let c4xx = 0;
    let c5xx = 0;

    for (const s of stats) {
      if (s.statusCode === 429) {
        c429++;
      } else if (s.statusCode >= 200 && s.statusCode < 300) {
        c2xx++;
      } else if (s.statusCode >= 400 && s.statusCode < 500) {
        c4xx++;
      } else if (s.statusCode >= 500) {
        c5xx++;
      }
    }

    return [
      { codeGroup: '2xx Success', count: c2xx, percentage: total > 0 ? Number(((c2xx / total) * 100).toFixed(1)) : 0 },
      { codeGroup: '429 Rate Limited', count: c429, percentage: total > 0 ? Number(((c429 / total) * 100).toFixed(1)) : 0 },
      { codeGroup: '4xx Client Errors', count: c4xx, percentage: total > 0 ? Number(((c4xx / total) * 100).toFixed(1)) : 0 },
      { codeGroup: '5xx Server Errors', count: c5xx, percentage: total > 0 ? Number(((c5xx / total) * 100).toFixed(1)) : 0 },
    ];
  }

  /**
   * Queries real RequestStat rows with pagination and authentic metadata.
   * Zero synthetic / fabricated fields.
   */
  public async getLogs(
    userId: string,
    options: {
      apiId?: string;
      traffic?: 'all' | 'allowed' | 'blocked';
      status?: string;
      limit?: number;
      offset?: number;
      from?: string;
      to?: string;
    }
  ): Promise<{ logs: any[]; total: number }> {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;

    const whereClause: any = {
      api: {
        userId,
        ...(options.apiId && options.apiId !== 'all' ? { id: options.apiId } : {}),
      },
    };

    if (options.from || options.to) {
      const { start, end } = getFilterTimeWindow(undefined, options.from, options.to);
      whereClause.createdAt = { gte: start, lte: end };
    }

    if (options.traffic === 'allowed') {
      whereClause.blocked = false;
    } else if (options.traffic === 'blocked') {
      whereClause.blocked = true;
    }

    if (options.status) {
      if (options.status.startsWith('2')) whereClause.statusCode = { gte: 200, lt: 300 };
      else if (options.status.startsWith('4') && options.status !== '429') whereClause.statusCode = { gte: 400, lt: 500, not: 429 };
      else if (options.status === '429') whereClause.statusCode = 429;
      else if (options.status.startsWith('5')) whereClause.statusCode = { gte: 500, lt: 600 };
    }

    const [stats, total] = await Promise.all([
      prisma.requestStat.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          api: { select: { id: true, name: true, rateLimit: true } },
          apiKey: { select: { id: true, name: true } },
        },
      }),
      prisma.requestStat.count({ where: whereClause }),
    ]);

    const formattedLogs = stats.map((s) => ({
      id: s.id,
      apiId: s.apiId,
      apiName: s.api.name,
      method: s.method,
      path: s.endpoint,
      targetPath: s.endpoint,
      statusCode: s.statusCode,
      latencyMs: s.latencyMs || 0,
      timestamp: s.createdAt.toISOString(),
      keyId: s.apiKeyId,
      keyName: s.apiKey?.name || null,
      isBlocked: s.blocked,
      blockedReason: s.blocked ? (s.statusCode === 429 ? 'RATE_LIMIT_EXCEEDED' : 'UNAUTHORIZED') : null,
      rateLimitTotal: s.api.rateLimit,
    }));

    return {
      logs: formattedLogs,
      total,
    };
  }
}

export const analyticsService = new AnalyticsService();
