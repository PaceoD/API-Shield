import { Redis, RedisOptions } from 'ioredis';
import { config } from '../config';

// Declare global Redis instance to prevent multiple client connections in hot-reload
declare global {
  // eslint-disable-next-line no-var
  var redisGlobal: Redis | undefined;
}

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null; // stop retrying fast in local/dev if offline
    return Math.min(times * 100, 1000);
  },
};

export const redis =
  global.redisGlobal ||
  new Redis(config.redis.url, redisOptions);

redis.on('error', (err) => {
  // Safe logging without credentials
  if (config.isDevelopment) {
    // suppress spam in dev if redis is offline
  } else {
    console.error('Redis connection error:', err.message);
  }
});

if (config.isDevelopment) {
  global.redisGlobal = redis;
}

/**
 * Checks Redis connectivity safely for health checks and status probes.
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnects the Redis client on application shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    if (redis.status !== 'end' && redis.status !== 'close') {
      await redis.quit();
    }
  } catch {
    redis.disconnect();
  }
}
