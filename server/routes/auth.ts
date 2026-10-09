import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../auth/auth.service';
import { requireAuthenticatedUser } from '../auth/auth.middleware';
import { validateRequest } from '../validation/validate';
import { RegisterRequestSchema, LoginRequestSchema } from '../auth/auth.validation';
import { config } from '../config';

export const authRouter = Router();

// Helper to configure standard secure session cookie
function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: config.auth.sessionDurationSeconds * 1000,
    path: '/',
  });
}

/**
 * POST /api/auth/register
 * Registers a new user account, creates session, and delivers HTTP-only cookie.
 */
authRouter.post(
  '/register',
  validateRequest({ body: RegisterRequestSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.registerUser(req.body);
      const sessionToken = authService.createSessionToken(user);
      setSessionCookie(res, sessionToken);

      return res.status(201).json({
        data: {
          user: {
            id: user.id,
            email: user.email,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/login
 * Validates credentials, creates session, and delivers HTTP-only cookie.
 */
authRouter.post(
  '/login',
  validateRequest({ body: LoginRequestSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.loginUser(req.body);
      const sessionToken = authService.createSessionToken(user);
      setSessionCookie(res, sessionToken);

      return res.status(200).json({
        data: {
          user: {
            id: user.id,
            email: user.email,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/logout
 * Clears session cookie and returns success status.
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  });

  return res.status(200).json({
    data: {
      success: true,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user information from session.
 */
authRouter.get(
  '/me',
  requireAuthenticatedUser,
  (req: Request, res: Response) => {
    return res.status(200).json({
      data: {
        user: req.user,
      },
    });
  }
);
