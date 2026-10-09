import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../database/prisma.js';
import { checkRedisConnection } from '../redis/client.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', async (req: Request, res: Response) => {
  const [isDbConnected, isRedisConnected] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
  ]);

  const isHealthy = isDbConnected && isRedisConnected;

  const healthData = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'APIShield Backend',
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.env,
    database: {
      status: isDbConnected ? 'connected' : 'disconnected',
      type: 'PostgreSQL',
    },
    redis: {
      status: isRedisConnected ? 'connected' : 'disconnected',
      type: 'Redis Rate Limiter',
    },
  };

  return res.status(200).json(healthData);
});
