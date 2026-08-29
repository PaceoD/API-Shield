import { Router, Request, Response, NextFunction } from 'express';
import { keysService } from '../api-keys/keys.service';
import { requireAuthenticatedUser } from '../auth/auth.middleware';

export const keysRouter = Router();

// Enforce authentication on all control-plane API key management routes
keysRouter.use(requireAuthenticatedUser);

// GET all keys (masked prefix only, no raw secrets or hashes)
keysRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiId = req.query.apiId as string | undefined;
    const keys = await keysService.listKeys(req.user!.id, apiId);
    return res.json({ data: keys });
  } catch (err) {
    next(err);
  }
});

// POST create key (returns secretKey ONCE)
keysRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, apiId } = req.body;
    const { keyRecord, rawKeySecret } = await keysService.createKey(req.user!.id, apiId, name);

    return res.status(201).json({
      data: {
        ...keyRecord,
        secretKey: rawKeySecret, // One-time secret
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST revoke key
keysRouter.post('/:id/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revoked = await keysService.revokeKey(req.user!.id, String(req.params.id));
    return res.json({ data: revoked });
  } catch (err) {
    next(err);
  }
});

// DELETE key
keysRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await keysService.deleteKey(req.user!.id, String(req.params.id));
    return res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});
