import { Router, Request, Response, NextFunction } from 'express';
import { analyticsService } from '../analytics/analytics.service';
import { requireAuthenticatedUser } from '../auth/auth.middleware';

export const analyticsRouter = Router();

// Enforce authentication on all analytics queries
analyticsRouter.use(requireAuthenticatedUser);

// GET /api/analytics - Detailed filter query
analyticsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.query.apiId as string | undefined;
    const range = req.query.range as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const [overview, timeseries, endpoints, statusCodes] = await Promise.all([
      analyticsService.getOverview(req.user!.id, apiId, range, from, to),
      analyticsService.getTimeseries(req.user!.id, range, apiId, undefined, from, to),
      analyticsService.getTopEndpoints(req.user!.id, range, apiId, from, to),
      analyticsService.getStatusCodes(req.user!.id, range, apiId, from, to),
    ]);

    return res.json({
      data: {
        summary: overview,
        timeseries,
        topEndpoints: endpoints,
        statusCodes,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/overview - High-level overview metrics
analyticsRouter.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.query.apiId as string | undefined;
    const range = req.query.range as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const overview = await analyticsService.getOverview(req.user!.id, apiId, range, from, to);
    return res.json({ data: overview });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/timeseries - Timeseries points
analyticsRouter.get('/timeseries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const range = (req.query.range as string) || '24h';
    const apiId = req.query.apiId as string | undefined;
    const traffic = req.query.traffic as 'all' | 'allowed' | 'blocked' | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const buckets = await analyticsService.getTimeseries(req.user!.id, range, apiId, traffic, from, to);
    return res.json({ data: buckets });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/endpoints - Top endpoints
analyticsRouter.get('/endpoints', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.query.apiId as string | undefined;
    const range = req.query.range as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const endpoints = await analyticsService.getTopEndpoints(req.user!.id, range, apiId, from, to);
    return res.json({ data: endpoints });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/status-codes - Status code distribution
analyticsRouter.get('/status-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.query.apiId as string | undefined;
    const range = req.query.range as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const distribution = await analyticsService.getStatusCodes(req.user!.id, range, apiId, from, to);
    return res.json({ data: distribution });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/logs - Live request logs feed
analyticsRouter.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.query.apiId as string | undefined;
    const traffic = req.query.traffic as 'all' | 'allowed' | 'blocked' | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const result = await analyticsService.getLogs(req.user!.id, {
      apiId,
      traffic,
      status,
      limit,
      offset,
      from,
      to,
    });

    return res.json({
      data: result.logs,
      pagination: {
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});
