import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { redis } from '../redis/client';
import { ServiceUnavailableError, BadRequestError } from '../errors/AppError';

export interface RateLimitCheckInput {
  apiId: string;
  apiKeyId: string;
  limit: number;
  windowSeconds: number;
  requestId?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds until next token is available
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Lua script from file or use embedded fallback
const luaScriptPath = path.resolve(__dirname, 'sliding-window.lua');
let luaScript = '';
try {
  if (fs.existsSync(luaScriptPath)) {
    luaScript = fs.readFileSync(luaScriptPath, 'utf8');
  }
} catch {
  // fallback
}

if (!luaScript) {
  luaScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])
local member_suffix = tostring(ARGV[3])

local time_arr = redis.call('TIME')
local now_sec = tonumber(time_arr[1])
local now_usec = tonumber(time_arr[2])
local now_ms = (now_sec * 1000) + math.floor(now_usec / 1000)

local window_ms = window_seconds * 1000
local window_start_ms = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start_ms)
local current_count = redis.call('ZCARD', key)

if current_count < limit then
    local member = tostring(now_ms) .. ':' .. member_suffix
    redis.call('ZADD', key, now_ms, member)
    redis.call('EXPIRE', key, window_seconds + 60)

    local remaining = limit - current_count - 1
    if remaining < 0 then remaining = 0 end
    local reset_at_sec = math.ceil((now_ms + window_ms) / 1000)
    return {1, limit, remaining, reset_at_sec, 0}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldest_ts = now_ms
    if oldest and #oldest >= 2 then
        oldest_ts = tonumber(oldest[2])
    end
    local reset_at_ms = oldest_ts + window_ms
    local retry_after_sec = math.max(1, math.ceil((reset_at_ms - now_ms) / 1000))
    local reset_at_sec = math.ceil(reset_at_ms / 1000)
    return {0, limit, 0, reset_at_sec, retry_after_sec}
end
`;
}

export class RateLimiterService {
  /**
   * Constructs the deterministic Redis key scoped to API and API key ID.
   */
  public getRateLimitKey(apiId: string, apiKeyId: string): string {
    return `ratelimit:${apiId}:${apiKeyId}`;
  }

  /**
   * Evaluates the atomic sliding-window rate limit inside Redis via Lua.
   * Enforces fail-closed policy: throws 503 ServiceUnavailableError if Redis is down.
   */
  public async checkRateLimit(input: RateLimitCheckInput): Promise<RateLimitResult> {
    const { apiId, apiKeyId, limit, windowSeconds } = input;

    if (!apiId || !apiKeyId) {
      throw new BadRequestError('apiId and apiKeyId are required for rate limit evaluation.');
    }
    if (limit <= 0) {
      throw new BadRequestError('Rate limit must be greater than zero.');
    }
    if (windowSeconds <= 0) {
      throw new BadRequestError('Rate window seconds must be greater than zero.');
    }

    const key = this.getRateLimitKey(apiId, apiKeyId);
    const memberSuffix = input.requestId || crypto.randomBytes(6).toString('hex');

    try {
      if (redis.status === 'wait') {
        await redis.connect();
      }

      // Execute atomic Lua script
      const result = (await redis.eval(
        luaScript,
        1,
        key,
        limit.toString(),
        windowSeconds.toString(),
        memberSuffix
      )) as [number, number, number, number, number];

      const [allowedNum, limitNum, remainingNum, resetAtNum, retryAfterNum] = result;

      return {
        allowed: allowedNum === 1,
        limit: Number(limitNum),
        remaining: Math.max(0, Number(remainingNum)),
        resetAt: Number(resetAtNum),
        retryAfter: Number(retryAfterNum),
      };
    } catch (err: any) {
      console.error('RateLimiter Redis failure (fail-closed activated):', err.message);

      // Fail-closed: return 503 rather than bypassing rate limiting
      throw new ServiceUnavailableError(
        'Rate limiting is temporarily unavailable. Upstream request was blocked for security.'
      );
    }
  }

  /**
   * Helper to reset a specific rate-limit key (used for test isolation).
   */
  public async resetKey(apiId: string, apiKeyId: string): Promise<void> {
    try {
      const key = this.getRateLimitKey(apiId, apiKeyId);
      await redis.del(key);
    } catch {
      //
    }
  }
}

export const rateLimiterService = new RateLimiterService();
