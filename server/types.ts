export interface ApiConfig {
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
}

export interface ApiKey {
  id: string;
  apiId: string;
  apiName: string;
  name: string;
  keyPrefix: string;
  keySuffix: string;
  maskedKey: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  apiId: string;
  apiName: string;
  method: string;
  path: string;
  targetPath: string;
  statusCode: number;
  latencyMs: number;
  keyId: string | null;
  keyName: string | null;
  isBlocked: boolean;
  blockedReason: 'RATE_LIMIT_EXCEEDED' | 'INVALID_API_KEY' | 'API_DISABLED' | 'FORBIDDEN_KEY_API_MISMATCH' | null;
  rateLimitTotal: number;
}

export interface AnalyticsOverview {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  blockRate: number;
  activeApisCount: number;
  totalApisCount: number;
  activeKeysCount: number;
  avgLatency: number;
  p95Latency: number;
  mostBlockedApi: {
    apiId: string;
    apiName: string;
    blockedCount: number;
  } | null;
}

export interface TimeseriesPoint {
  timestamp: string;
  label: string;
  requests: number;
  allowed: number;
  blocked: number;
  avgLatency: number;
  p95Latency: number;
}

export interface EndpointStat {
  method: string;
  path: string;
  requests: number;
  percentage: number;
  avgLatency: number;
  errorCount: number;
  blockedCount: number;
}

export interface StatusCodeDistribution {
  codeGroup: string;
  count: number;
  percentage: number;
}

export interface SystemSettings {
  gatewayBaseUrl: string;
  defaultRateLimit: number;
  defaultRateWindowSeconds: number;
  requestTimeoutMs: number;
  logsRetentionDays: number;
  corsAllowedOrigins: string;
}

export interface SystemInfo {
  version: string;
  nodeVersion: string;
  uptimeSeconds: number;
  status: 'healthy' | 'degraded';
  gatewayActive: boolean;
  totalLogsStored: number;
  memoryUsageMb: number;
  storageEngine: string;
}
