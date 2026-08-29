import { Router, Request, Response, NextFunction } from 'express';
import { apisService } from '../apis/apis.service';
import { keysService } from '../api-keys/keys.service';
import { analyticsService } from '../analytics/analytics.service';
import { requireAuthenticatedUser } from '../auth/auth.middleware';

export const apisRouter = Router();

// Enforce authentication on all control-plane API management routes
apisRouter.use(requireAuthenticatedUser);

// GET all APIs for the authenticated user
apisRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apis = await apisService.listApis(req.user!.id);
    return res.json({ data: apis });
  } catch (err) {
    next(err);
  }
});

// GET single API by ID with ownership verification
apisRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const api = await apisService.getApiById(req.user!.id, String(req.params.id));
    return res.json({ data: api });
  } catch (err) {
    next(err);
  }
});

// GET statistics for a single API owned by the authenticated user
apisRouter.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = String(req.params.id);
    const range = (req.query.range as string) || '24h';

    // Verify ownership first (throws 404 on mismatch)
    const api = await apisService.getApiById(req.user!.id, apiId);

    const [overview, timeseries, endpoints, statusCodes] = await Promise.all([
      analyticsService.getOverview(req.user!.id, apiId, range),
      analyticsService.getTimeseries(req.user!.id, range, apiId),
      analyticsService.getTopEndpoints(req.user!.id, range, apiId),
      analyticsService.getStatusCodes(req.user!.id, range, apiId),
    ]);

    return res.json({
      data: {
        apiId: api.id,
        apiName: api.name,
        overview,
        timeseries,
        endpoints,
        statusCodes,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET keys for a specific API
apisRouter.get('/:id/keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = String(req.params.id);
    await apisService.getApiById(req.user!.id, apiId);
    const keys = await keysService.listKeys(req.user!.id, apiId);
    return res.json({ data: keys });
  } catch (err) {
    next(err);
  }
});

// POST create key for a specific API
apisRouter.post('/:id/keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = String(req.params.id);
    const { name } = req.body;
    const { keyRecord, rawKeySecret } = await keysService.createKey(req.user!.id, apiId, name);
    return res.status(201).json({
      data: {
        ...keyRecord,
        secretKey: rawKeySecret,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST Create new API
apisRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newApi = await apisService.createApi(req.user!.id, req.body);
    return res.status(201).json({ data: newApi });
  } catch (err) {
    next(err);
  }
});

// PUT Update API with ownership verification
apisRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await apisService.updateApi(req.user!.id, String(req.params.id), req.body);
    return res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE API with ownership verification and cascade deletion
apisRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await apisService.deleteApi(req.user!.id, String(req.params.id));
    return res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});
