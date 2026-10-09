import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { UnauthorizedError, BadRequestError } from '../errors/AppError';
import { config } from '../config';

/**
 * Middleware that requires a valid authenticated user session.
 * Strictly enforces authentication across all environments without development bypasses.
 */
export async function requireAuthenticatedUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken =
    req.cookies?.[config.auth.cookieName] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!sessionToken) {
    next(new UnauthorizedError('Authentication required. Please log in.'));
    return;
  }

  const session = authService.verifySessionToken(sessionToken);
  if (!session) {
    next(new UnauthorizedError('Session expired or invalid. Please log in.'));
    return;
  }

  const user = await authService.getUserById(session.sub);
  if (!user) {
    next(new UnauthorizedError('User account no longer exists.'));
    return;
  }

  req.user = user;
  next();
}

/**
 * Optional authentication helper: attaches req.user if a valid session exists.
 */
export async function optionalAuthenticatedUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken =
    req.cookies?.[config.auth.cookieName] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (sessionToken) {
    const session = authService.verifySessionToken(sessionToken);
    if (session) {
      const user = await authService.getUserById(session.sub);
      if (user) {
        req.user = user;
      }
    }
  }
  next();
}

/**
 * Middleware that verifies the authenticated user owns the target API.
 * Uses 404 on mismatched owner to prevent resource leakage.
 */
export function requireApiOwnershipMiddleware(paramName = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required.'));
      return;
    }

    const rawApiId = req.params[paramName];
    if (!rawApiId) {
      next(new BadRequestError(`Missing required API identifier parameter '${paramName}'.`));
      return;
    }
    const apiId = String(rawApiId);

    try {
      const api = await authService.verifyApiOwnership(req.user.id, apiId);
      (req as any).api = api;
      next();
    } catch (err) {
      next(err);
    }
  };
}
