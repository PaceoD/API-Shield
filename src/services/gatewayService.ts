import { GatewayTestRequest, GatewayTestResponse } from '../types/api';

export const gatewayService = {
  async testEndpoint(req: GatewayTestRequest): Promise<GatewayTestResponse> {
    const cleanSubpath = req.subpath.startsWith('/') ? req.subpath : `/${req.subpath}`;
    const url = `/api/gateway/${req.apiId}${cleanSubpath}`;

    const headers: Record<string, string> = {
      ...(req.customHeaders || {}),
    };

    if (req.apiKey && req.apiKey.trim() && !req.apiKey.includes('•')) {
      headers['X-API-Key'] = req.apiKey.trim();
    }

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) && req.body
          ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
          : undefined,
      });

      const clientLatency = Math.round(performance.now() - startTime);

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        respHeaders[key] = val;
      });

      let parsedBody: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          parsedBody = await response.json();
        } catch {
          parsedBody = null;
        }
      } else {
        parsedBody = await response.text();
        try {
          parsedBody = JSON.parse(parsedBody);
        } catch {
          // keep as string
        }
      }

      const rateLimitRemaining = respHeaders['x-ratelimit-remaining']
        ? parseInt(respHeaders['x-ratelimit-remaining'], 10)
        : undefined;
      const rateLimitTotal = respHeaders['x-ratelimit-limit']
        ? parseInt(respHeaders['x-ratelimit-limit'], 10)
        : undefined;
      const rateLimitReset = respHeaders['x-ratelimit-reset']
        ? parseInt(respHeaders['x-ratelimit-reset'], 10)
        : undefined;
      const retryAfter = respHeaders['retry-after']
        ? parseInt(respHeaders['retry-after'], 10)
        : undefined;

      const serverLatency = respHeaders['x-gateway-latency-ms']
        ? parseInt(respHeaders['x-gateway-latency-ms'], 10)
        : clientLatency;

      return {
        statusCode: response.status,
        statusText: response.statusText || `${response.status}`,
        latencyMs: serverLatency,
        headers: respHeaders,
        rateLimitRemaining,
        rateLimitTotal,
        rateLimitReset,
        retryAfter,
        body: parsedBody,
      };
    } catch (err: any) {
      const clientLatency = Math.round(performance.now() - startTime);
      return {
        statusCode: 0,
        statusText: 'Network Error',
        latencyMs: clientLatency,
        headers: {},
        body: { error: err.message || 'Could not connect to APIShield Gateway' },
        error: err.message,
      };
    }
  },
};
