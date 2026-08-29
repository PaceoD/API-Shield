import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('3001')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgresql://postgres:postgres@localhost:5432/apishield?schema=public'),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .default('redis://localhost:6379'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('apishield_dev_super_secret_session_key_2026'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const config = {
  env: parsedEnv.data.NODE_ENV,
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isTest: parsedEnv.data.NODE_ENV === 'test',
  port: parsedEnv.data.PORT,
  db: {
    url: parsedEnv.data.DATABASE_URL,
  },
  redis: {
    url: parsedEnv.data.REDIS_URL,
  },
  auth: {
    jwtSecret: parsedEnv.data.JWT_SECRET,
    cookieName: 'apiShield_session',
    sessionDurationSeconds: 7 * 24 * 60 * 60, // 7 days
  },
} as const;

export type Config = typeof config;
