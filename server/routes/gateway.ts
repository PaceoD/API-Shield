import { Router, Request, Response, NextFunction } from 'express';
import axios, { AxiosRequestConfig, Method } from 'axios';
import crypto from 'crypto';
import { apisService } from '../apis/apis.service';
import { keysService } from '../api-keys/keys.service';
import { analyticsService } from '../analytics/analytics.service';
import { rateLimiterService } from '../rate-limit/rateLimiter.service';
import { validateTargetUrl } from '../gateway/ssrf';

export const gatewayRouter = Router();

gatewayRouter.all('/:apiId*', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const apiIdParam = String(req.params.apiId);
  const subpath = req.params[0] ? String(req.params[0]) : '';

  // 1. Request ID Generation / Correlation
  const requestId =
    (req.headers['x-request-id'] as string) ||
    `req_${crypto.randomBytes(8).toString('hex')}`;
  res.setHeader('X-Request-ID', requestId);

  try {
    // 2. Resolve API Configuration from PostgreSQL
    const api = await apisService.getApiForGateway(apiIdParam);
    if (!api) {
      return res.status(404).json({
        error: {
          code: 'API_NOT_FOUND',
          message: `API with identifier '${apiIdParam}' is not configured in APIShield.`,
          statusCode: 404,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const endpointPath = subpath ? (subpath.startsWith('/') ? subpath : `/${subpath}`) : '/';

    // 3. Check if API is enabled
    if (!api.enabled) {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 403,
        latencyMs: latency,
        blocked: true,
      });

      console.log(`[${requestId}] GATEWAY BLOCKED: API '${api.name}' is disabled (403)`);

      return res.status(403).json({
        error: {
          code: 'API_DISABLED',
          message: `API '${api.name}' is currently disabled in APIShield.`,
          statusCode: 403,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 4. API Key Authentication Check
    const apiKeyHeader =
      (req.headers['x-api-key'] as string) ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!apiKeyHeader) {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 401,
        latencyMs: latency,
        blocked: true,
      });

      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing required API key. Provide a valid key via the X-API-Key header.',
          statusCode: 401,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const authResult = await keysService.authenticateKeyForGateway(apiKeyHeader, api.id);

    // 4a. Key is invalid or revoked (401)
    if (!authResult.success && authResult.reason === 'INVALID_OR_REVOKED') {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 401,
        latencyMs: latency,
        blocked: true,
      });

      return res.status(401).json({
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key or key has been revoked.',
          statusCode: 401,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 4b. Key belongs to another API (403 Forbidden)
    if (!authResult.success && authResult.reason === 'API_MISMATCH') {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: authResult.keyId,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 403,
        latencyMs: latency,
        blocked: true,
      });

      console.log(`[${requestId}] FORBIDDEN: Key is bound to a different API (403)`);

      return res.status(403).json({
        error: {
          code: 'FORBIDDEN_KEY_API_MISMATCH',
          message: 'API key is not authorized for this specific API service.',
          statusCode: 403,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const matchedKey = (authResult as { success: true; key: { id: string; name: string; apiId: string } }).key;

    // 5. Atomic Redis Sliding-Window Rate Limiter
    let rateCheck;
    try {
      rateCheck = await rateLimiterService.checkRateLimit({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        limit: api.rateLimit,
        windowSeconds: api.rateWindowSeconds || 60,
        requestId,
      });
    } catch {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 503,
        latencyMs: latency,
        blocked: true,
      });

      // Fail-Closed: Return 503 Service Unavailable without forwarding to target
      return res.status(503).json({
        error: {
          code: 'RATE_LIMITER_UNAVAILABLE',
          message: 'Rate limiting engine is temporarily unavailable. Request blocked for security.',
          statusCode: 503,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Set RFC-compliant RateLimit response headers
    res.setHeader('X-RateLimit-Limit', rateCheck.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateCheck.resetAt.toString());
    res.setHeader('X-APIShield-Gateway', 'v1.0-production');

    if (!rateCheck.allowed) {
      const latency = Date.now() - startTime;
      res.setHeader('Retry-After', rateCheck.retryAfter.toString());

      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 429,
        latencyMs: latency,
        blocked: true,
      });

      console.log(`[${requestId}] RATE LIMIT EXCEEDED: key=${matchedKey.name} api=${api.name} (429)`);

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too Many Requests. Rate limit of ${api.rateLimit} requests per ${api.rateWindowSeconds || 60} seconds exceeded.`,
          statusCode: 429,
          rateLimit: api.rateLimit,
          retryAfterSeconds: rateCheck.retryAfter,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 6. SSRF Target Validation
    const ssrfCheck = await validateTargetUrl(api.targetUrl);
    if (!ssrfCheck.isValid) {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 400,
        latencyMs: latency,
        blocked: true,
      });

      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `Gateway rejected target request for security: ${ssrfCheck.reason}`,
          statusCode: 400,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 7. Safe Upstream Target URL Construction
    const baseClean = api.targetUrl.replace(/\/+$/, '');
    const pathClean = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const destinationUrl = `${baseClean}${pathClean}${queryString}`;

    // 8. Safe Header Forwarding (Strip session cookies, DB credentials, client X-API-Key)
    const forwardHeaders: Record<string, string> = {};
    const ignoredHeaders = [
      'host',
      'connection',
      'content-length',
      'x-api-key',
      'authorization',
      'cookie',
    ];

    for (const [headerKey, headerVal] of Object.entries(req.headers)) {
      if (!ignoredHeaders.includes(headerKey.toLowerCase()) && typeof headerVal === 'string') {
        forwardHeaders[headerKey] = headerVal;
      }
    }
    forwardHeaders['x-forwarded-proto'] = req.protocol;
    forwardHeaders['x-request-id'] = requestId;

    const axiosConfig: AxiosRequestConfig = {
      method: req.method as Method,
      url: destinationUrl,
      headers: forwardHeaders,
      data: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase()) ? req.body : undefined,
      timeout: 15000,
      validateStatus: () => true, // capture all status codes
      responseType: 'json',
    };

    try {
      const upstreamResponse = await axios(axiosConfig);
      const latency = Date.now() - startTime;

      res.setHeader('X-Gateway-Latency-Ms', latency.toString());

      // 9. Non-blocking telemetry persistence
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: upstreamResponse.status,
        latencyMs: latency,
        blocked: false,
      });

      console.log(
        `[${requestId}] ${req.method} ${api.name} ${endpointPath} -> ${upstreamResponse.status} (${latency}ms)`
      );

      // Return raw upstream response status and body faithfully
      return res.status(upstreamResponse.status).json(upstreamResponse.data);
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const isTimeout = err.code === 'ECONNABORTED';
      const statusCode = isTimeout ? 504 : 502;

      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode,
        latencyMs: latency,
        blocked: false,
      });

      console.error(
        `[${requestId}] UPSTREAM ERROR: ${req.method} ${api.name} ${endpointPath} -> ${statusCode} (${err.message})`
      );

      // Return safe errors without leaking internal target details or stack traces
      return res.status(statusCode).json({
        error: {
          code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
          message: isTimeout
            ? 'The target API timed out after 15 seconds.'
            : 'The target API could not be reached. Please verify upstream server availability.',
          statusCode,
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    next(err);
  }
});
