import { prisma } from '../database/prisma';
import { NotFoundError, BadRequestError } from '../errors/AppError';
import { assertSafeTargetUrl } from '../gateway/ssrf';

export interface CreateApiInput {
  name: string;
  description?: string;
  targetUrl: string;
  enabled?: boolean;
  rateLimit?: number;
  rateWindowSeconds?: number;
}

export interface UpdateApiInput {
  name?: string;
  description?: string;
  targetUrl?: string;
  enabled?: boolean;
  rateLimit?: number;
  rateWindowSeconds?: number;
}

export interface FormattedApi {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  targetUrl: string;
  pathPrefix: string;
  rateLimit: number;
  rateWindowSeconds: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  metrics?: {
    totalRequests: number;
    blockedRequests: number;
    avgLatency: number;
    p95Latency?: number;
  };
}

function formatApiRecord(api: any, metrics?: any): FormattedApi {
  const windowSeconds = api.rateWindowSeconds || 60;
  return {
    id: api.id,
    userId: api.userId,
    name: api.name,
    slug: api.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'api',
    description: api.description || '',
    targetUrl: api.targetUrl,
    pathPrefix: api.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'api',
    rateLimit: api.rateLimit,
    rateWindowSeconds: windowSeconds,
    enabled: api.enabled,
    createdAt: api.createdAt instanceof Date ? api.createdAt.toISOString() : api.createdAt,
    updatedAt: api.updatedAt instanceof Date ? api.updatedAt.toISOString() : api.updatedAt,
    metrics,
  };
}

export class ApisService {
  /**
   * Lists all APIs owned by the authenticated user with aggregated metrics.
   */
  public async listApis(userId: string): Promise<FormattedApi[]> {
    const apis = await prisma.api.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        requestStats: {
          select: {
            latencyMs: true,
            blocked: true,
          },
        },
      },
    });

    return apis.map((api) => {
      const stats = api.requestStats;
      const totalRequests = stats.length;
      const blockedRequests = stats.filter((s) => s.blocked).length;
      const validLatencies = stats.map((s) => s.latencyMs || 0);
      const avgLatency =
        totalRequests > 0
          ? Math.round(validLatencies.reduce((acc, lat) => acc + lat, 0) / totalRequests)
          : 0;

      return formatApiRecord(api, {
        totalRequests,
        blockedRequests,
        avgLatency,
      });
    });
  }

  /**
   * Retrieves a single API by ID with verified ownership and detailed metrics.
   */
  public async getApiById(userId: string, apiId: string): Promise<FormattedApi> {
    const api = await prisma.api.findUnique({
      where: { id: apiId },
      include: {
        requestStats: {
          select: {
            latencyMs: true,
            blocked: true,
          },
        },
      },
    });

    if (!api || api.userId !== userId) {
      throw new NotFoundError('API not found');
    }

    const stats = api.requestStats;
    const totalRequests = stats.length;
    const blockedRequests = stats.filter((s) => s.blocked).length;
    const sortedLatencies = stats.map((s) => s.latencyMs || 0).sort((a, b) => a - b);
    const avgLatency =
      totalRequests > 0
        ? Math.round(sortedLatencies.reduce((acc, lat) => acc + lat, 0) / totalRequests)
        : 0;
    const p95Latency =
      sortedLatencies.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]
        : 0;

    return formatApiRecord(api, {
      totalRequests,
      blockedRequests,
      avgLatency,
      p95Latency,
    });
  }

  /**
   * Creates a new API protected under the user's account.
   * Awaits asynchronous SSRF target URL validation prior to database persistence.
   */
  public async createApi(userId: string, input: CreateApiInput): Promise<FormattedApi> {
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError('API name is required.');
    }
    if (!input.targetUrl || !input.targetUrl.trim()) {
      throw new BadRequestError('Target URL is required.');
    }

    // SSRF target check: strictly awaited
    await assertSafeTargetUrl(input.targetUrl.trim());

    const rateLimit = input.rateLimit && input.rateLimit > 0 ? input.rateLimit : 60;
    const rateWindowSeconds = input.rateWindowSeconds && input.rateWindowSeconds > 0 ? input.rateWindowSeconds : 60;

    const created = await prisma.api.create({
      data: {
        userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        targetUrl: input.targetUrl.trim(),
        enabled: input.enabled !== false,
        rateLimit,
        rateWindowSeconds,
      },
    });

    return formatApiRecord(created, {
      totalRequests: 0,
      blockedRequests: 0,
      avgLatency: 0,
    });
  }

  /**
   * Updates an existing API owned by the user.
   * Awaits asynchronous SSRF target URL validation prior to database update.
   */
  public async updateApi(userId: string, apiId: string, input: UpdateApiInput): Promise<FormattedApi> {
    // Verify ownership first
    await this.getApiById(userId, apiId);

    if (input.targetUrl) {
      await assertSafeTargetUrl(input.targetUrl.trim());
    }

    const rateWindowSeconds = input.rateWindowSeconds && input.rateWindowSeconds > 0 ? input.rateWindowSeconds : undefined;

    const updated = await prisma.api.update({
      where: { id: apiId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl.trim() } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.rateLimit !== undefined && input.rateLimit > 0 ? { rateLimit: input.rateLimit } : {}),
        ...(rateWindowSeconds !== undefined ? { rateWindowSeconds } : {}),
      },
    });

    return formatApiRecord(updated);
  }

  /**
   * Deletes an API owned by the user.
   */
  public async deleteApi(userId: string, apiId: string): Promise<boolean> {
    await this.getApiById(userId, apiId);
    await prisma.api.delete({
      where: { id: apiId },
    });
    return true;
  }

  /**
   * Resolves an API for Gateway proxying without user ownership constraint.
   */
  public async getApiForGateway(apiId: string): Promise<any | null> {
    return await prisma.api.findUnique({
      where: { id: apiId },
    });
  }
}

export const apisService = new ApisService();
