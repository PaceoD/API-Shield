import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from './AppError';

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `The endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
      statusCode: 404,
    },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // 1. Handled Operational Application Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload or parameters',
        statusCode: 400,
        details: formattedErrors,
      },
    });
    return;
  }

  // 3. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'An account or resource with this email or identifier already exists.',
          statusCode: 409,
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested record was not found in database.',
          statusCode: 404,
        },
      });
      return;
    }
  }

  // 4. Prisma Database Connection / Initialization Errors
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('Database Connection Error (PostgreSQL unavailable):', err.message);
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database service is currently unreachable. Please ensure PostgreSQL is running (e.g. docker compose up -d).',
        statusCode: 503,
      },
    });
    return;
  }

  // 5. Unhandled Server / Runtime Errors (Safe Redaction)
  console.error('Unhandled Internal Server Error:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred. Please try again later.',
      statusCode: 500,
    },
  });
}
