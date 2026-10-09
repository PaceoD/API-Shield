import { Router, Request, Response } from 'express';
import { config } from '../config.js';

export const echoRouter = Router();

let echoRequestCount = 0;

export function getEchoRequestCount(): number {
  return echoRequestCount;
}

export function resetEchoRequestCount(): void {
  echoRequestCount = 0;
}

// Track received requests to verify rate limiter pre-proxying in integration tests
echoRouter.use((req, res, next) => {
  if (!req.path.startsWith('/_counter')) {
    echoRequestCount++;
  }
  next();
});

// Diagnostic counter endpoints for automated testing (development and test only)
if (!config.isProduction) {
  echoRouter.get('/_counter', (req: Request, res: Response) => {
    return res.json({ count: echoRequestCount });
  });

  echoRouter.post('/_counter/reset', (req: Request, res: Response) => {
    echoRequestCount = 0;
    return res.json({ count: 0, reset: true });
  });
}

// 1. Mock users endpoints for demo gateway calls
echoRouter.get('/users', (req: Request, res: Response) => {
  return res.json([
    { id: 1, name: 'Leanne Graham', email: 'sincere@april.biz', company: { name: 'Romaguera-Crona' } },
    { id: 2, name: 'Ervin Howell', email: 'shanna@melissa.tv', company: { name: 'Deckow-Crist' } },
    { id: 3, name: 'Clementine Bauch', email: 'nathan@yesenia.net', company: { name: 'Romaguera-Jacobson' } },
  ]);
});

echoRouter.get('/users/:id', (req: Request, res: Response) => {
  const userId = parseInt(String(req.params.id), 10) || 1;
  return res.json({
    id: userId,
    name: 'Leanne Graham',
    username: 'Bret',
    email: 'sincere@april.biz',
    phone: '1-770-736-8031 x56442',
    website: 'hildegard.org',
  });
});

// 2. Generic REST operations
echoRouter.post('/users', (req: Request, res: Response) => {
  return res.status(201).json({
    id: 101,
    ...req.body,
    createdAt: new Date().toISOString(),
  });
});

echoRouter.put('/users/:id', (req: Request, res: Response) => {
  return res.json({
    id: parseInt(String(req.params.id), 10) || 1,
    ...req.body,
    updatedAt: new Date().toISOString(),
  });
});

echoRouter.patch('/users/:id', (req: Request, res: Response) => {
  return res.json({
    id: parseInt(String(req.params.id), 10) || 1,
    ...req.body,
    patchedAt: new Date().toISOString(),
  });
});

echoRouter.delete('/users/:id', (req: Request, res: Response) => {
  return res.json({
    success: true,
    deletedId: req.params.id,
    message: 'Resource successfully deleted.',
  });
});

// 3. Fallback echo handler for arbitrary paths & methods
echoRouter.all('*', (req: Request, res: Response) => {
  return res.json({
    service: 'APIShield Local Echo Target',
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'x-request-id': req.headers['x-request-id'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
    },
    body: req.body,
    timestamp: new Date().toISOString(),
  });
});
