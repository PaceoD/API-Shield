import { Router, Request, Response } from 'express';
import { prisma } from '../database/prisma.js';
import { SystemInfo, SystemSettings } from '../types.js';

export const systemRouter = Router();

const serverStartTime = Date.now();

let currentSettings: SystemSettings = {
  gatewayBaseUrl: 'http://localhost:3001',
  defaultRateLimit: 60,
  defaultRateWindowSeconds: 60,
  requestTimeoutMs: 15000,
  logsRetentionDays: 30,
  corsAllowedOrigins: 'http://localhost:5173',
};

systemRouter.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'APIShield Gateway Engine',
  });
});

systemRouter.get('/system', async (req: Request, res: Response) => {
  const memory = process.memoryUsage();
  let logsCount = 0;
  try {
    logsCount = await prisma.requestStat.count();
  } catch {
    //
  }

  const info: SystemInfo = {
    version: '1.2.0-core',
    nodeVersion: process.version,
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    status: 'healthy',
    gatewayActive: true,
    totalLogsStored: logsCount,
    memoryUsageMb: Math.round(memory.heapUsed / 1024 / 1024),
    storageEngine: 'PostgreSQL Database Engine',
  };

  return res.json({ data: info });
});

systemRouter.get('/settings', (req: Request, res: Response) => {
  return res.json({ data: currentSettings });
});

systemRouter.post('/settings', (req: Request, res: Response) => {
  currentSettings = { ...currentSettings, ...req.body };
  return res.json({ data: currentSettings, message: 'Settings saved successfully' });
});
