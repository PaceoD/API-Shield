import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { gatewayRouter } from './routes/gateway';
import { apisRouter } from './routes/apis';
import { keysRouter } from './routes/keys';
import { analyticsRouter } from './routes/analytics';
import { systemRouter } from './routes/system';
import { echoRouter } from './routes/echo';
import { errorHandler, notFoundHandler } from './errors/errorHandler';
import { disconnectDatabase } from './database/prisma';
import { disconnectRedis } from './redis/client';

const app = express();

const allowedOrigins = config.isProduction
  ? [process.env.CORS_ORIGIN || 'http://localhost:5173']
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      `http://localhost:${config.port}`,
      `http://127.0.0.1:${config.port}`,
    ];

// Global Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, test suites, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow Vercel production and preview deployment origins
      if (
        origin.endsWith('.vercel.app') ||
        (process.env.VERCEL_URL && origin.includes(process.env.VERCEL_URL)) ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL && origin.includes(process.env.VERCEL_PROJECT_PRODUCTION_URL))
      ) {
        return callback(null, true);
      }

      callback(new Error(`Origin '${origin}' not permitted by CORS policy`));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Normalize req.url when running under Vercel Serverless Function rewrites
app.use((req, res, next) => {
  if (process.env.VERCEL && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  next();
});

// Core Health & Authentication Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

// Local Echo Target for Deterministic Testing & Demos
app.use('/api/echo', echoRouter);

// Application & Gateway Routes
app.use('/api/gateway', gatewayRouter);
app.use('/api/apis', apisRouter);
app.use('/api/keys', keysRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api', systemRouter);

// 404 Not Found Handler
app.use(notFoundHandler);

// Centralized Error Handling Middleware
app.use(errorHandler);

// Start Server (only when not running in Vercel Serverless environment)
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    console.log(`\n🛡️  APIShield Backend running in [${config.env}] mode`);
    console.log(`📡 Listening on: http://localhost:${config.port}`);
    console.log(`🔑 Auth Endpoints: http://localhost:${config.port}/api/auth/register, /login, /logout, /me`);
    console.log(`🩺 Health Check: http://localhost:${config.port}/api/health`);
    console.log(`⚡ Gateway Router: http://localhost:${config.port}/api/gateway/:apiId/*`);
    console.log(`🎯 Local Echo Target: http://localhost:${config.port}/api/echo/*`);
    console.log(`📊 Management APIs: http://localhost:${config.port}/api/apis, /api/keys, /api/analytics\n`);
  });

  // Graceful Shutdown Handlers
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await Promise.all([
          disconnectDatabase(),
          disconnectRedis(),
        ]);
        console.log('Database and Redis connections closed.');
      } catch (err) {
        console.error('Error during disconnect:', err);
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export default app;
