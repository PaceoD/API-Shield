import { PrismaClient } from '@prisma/client';
import { config } from '../config';

// Declare global Prisma instance to prevent multiple client instances in development hot-reloads
declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const dbUrl = config.db.url.includes('connection_limit')
  ? config.db.url
  : `${config.db.url}${config.db.url.includes('?') ? '&' : '?'}connection_limit=3`;

export const prisma =
  global.prismaGlobal ||
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: config.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (config.isDevelopment) {
  global.prismaGlobal = prisma;
}

/**
 * Probes database connectivity for health checks without throwing unhandled exceptions.
 * @returns boolean indicating if the database is reachable
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (process.env.VERCEL && config.db.url.includes('localhost')) {
      return false;
    }
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Graceful disconnect on application shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
