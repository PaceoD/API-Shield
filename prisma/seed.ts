import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret.trim()).digest('hex');
}

async function main() {
  console.log('🌱 Seeding APIShield Deterministic Demo Environment...\n');

  // ==========================================
  // 1. DEMO USER ACCOUNT
  // ==========================================
  const demoEmail = 'demo@apishield.local';
  const demoPassword = 'apishield_demo_password_2026';
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash },
    create: {
      email: demoEmail,
      passwordHash,
    },
  });

  console.log(`👤 Demo User Configured:`);
  console.log(`   Email: ${demoUser.email} (Development demo account)\n`);

  // ==========================================
  // 2. DEMO APIS
  // ==========================================
  const echoApiId = '00000000-0000-0000-0000-000000000001';
  const usersApiId = '00000000-0000-0000-0000-000000000002';
  const productsApiId = '00000000-0000-0000-0000-000000000003';

  // 1. Built-in Local Echo Target API (100% Offline & Deterministic)
  const echoApi = await prisma.api.upsert({
    where: { id: echoApiId },
    update: {
      name: 'Local Echo API',
      targetUrl: 'http://localhost:3001/api/echo',
      rateLimit: 5,
      rateWindowSeconds: 60,
      enabled: true,
    },
    create: {
      id: echoApiId,
      userId: demoUser.id,
      name: 'Local Echo API',
      description: 'Built-in local target service for 100% offline deterministic testing of GET, POST, PUT, PATCH, DELETE and 429 rate limiting (5 req/60s).',
      targetUrl: 'http://localhost:3001/api/echo',
      enabled: true,
      rateLimit: 5,
      rateWindowSeconds: 60,
    },
  });

  // 2. External Demo Users API
  const usersApi = await prisma.api.upsert({
    where: { id: usersApiId },
    update: {
      name: 'Demo Users API',
      targetUrl: 'https://jsonplaceholder.typicode.com',
      rateLimit: 10,
      rateWindowSeconds: 60,
      enabled: true,
    },
    create: {
      id: usersApiId,
      userId: demoUser.id,
      name: 'Demo Users API',
      description: 'External demo service proxying JSONPlaceholder.',
      targetUrl: 'https://jsonplaceholder.typicode.com',
      enabled: true,
      rateLimit: 10,
      rateWindowSeconds: 60,
    },
  });

  // 3. External Demo Products API
  const productsApi = await prisma.api.upsert({
    where: { id: productsApiId },
    update: {
      name: 'Demo Products API',
      targetUrl: 'https://dummyjson.com',
      rateLimit: 20,
      rateWindowSeconds: 60,
      enabled: true,
    },
    create: {
      id: productsApiId,
      userId: demoUser.id,
      name: 'Demo Products API',
      description: 'Secondary demo service proxying DummyJSON for cross-API key isolation tests.',
      targetUrl: 'https://dummyjson.com',
      enabled: true,
      rateLimit: 20,
      rateWindowSeconds: 60,
    },
  });

  console.log(`📡 Demo APIs Configured:`);
  console.log(`   1. ${echoApi.name} (Limit: ${echoApi.rateLimit} req/60s) -> ${echoApi.targetUrl}`);
  console.log(`   2. ${usersApi.name} (Limit: ${usersApi.rateLimit} req/60s) -> ${usersApi.targetUrl}`);
  console.log(`   3. ${productsApi.name} (Limit: ${productsApi.rateLimit} req/60s) -> ${productsApi.targetUrl}\n`);

  // ==========================================
  // 3. DETERMINISTIC DEMO API KEYS (HASHED SHA-256)
  // Raw secrets are NEVER printed to stdout or logged.
  // ==========================================
  const activeEchoKeySecret = 'sk_live_demo_echo_key_001';
  const revokedEchoKeySecret = 'sk_live_demo_revoked_key_002';
  const activeProductsKeySecret = 'sk_live_demo_products_key_003';

  const activeEchoKeyHash = hashSecret(activeEchoKeySecret);
  const revokedEchoKeyHash = hashSecret(revokedEchoKeySecret);
  const activeProductsKeyHash = hashSecret(activeProductsKeySecret);

  const activeEchoKey = await prisma.apiKey.upsert({
    where: { keyHash: activeEchoKeyHash },
    update: { revokedAt: null },
    create: {
      apiId: echoApi.id,
      name: 'Primary Echo Key (Active)',
      keyPrefix: 'sk_live_demo_',
      keyHash: activeEchoKeyHash,
    },
  });

  await prisma.apiKey.upsert({
    where: { keyHash: revokedEchoKeyHash },
    update: { revokedAt: new Date(Date.now() - 3600 * 1000) },
    create: {
      apiId: echoApi.id,
      name: 'Revoked Demo Key (Test Revocation)',
      keyPrefix: 'sk_live_demo_',
      keyHash: revokedEchoKeyHash,
      revokedAt: new Date(Date.now() - 3600 * 1000),
    },
  });

  await prisma.apiKey.upsert({
    where: { keyHash: activeProductsKeyHash },
    update: { revokedAt: null },
    create: {
      apiId: productsApi.id,
      name: 'Products Service Key',
      keyPrefix: 'sk_live_demo_',
      keyHash: activeProductsKeyHash,
    },
  });

  console.log(`🔑 Demo API Keys Configured (SHA-256 hashed records persisted without logging plaintext secrets).\n`);

  // ==========================================
  // 4. DETERMINISTIC HISTORICAL REQUEST STATS
  // ==========================================
  console.log('📊 Seeding Deterministic Historical Request Statistics...');

  await prisma.requestStat.deleteMany({
    where: { apiId: { in: [echoApi.id, usersApi.id, productsApi.id] } },
  });

  const now = Date.now();
  const fixedHistory = [
    // 10 Successful requests across endpoints and timestamps
    { endpoint: '/users', method: 'GET', statusCode: 200, latencyMs: 35, blocked: false, ageMinutes: 300 },
    { endpoint: '/users/1', method: 'GET', statusCode: 200, latencyMs: 28, blocked: false, ageMinutes: 280 },
    { endpoint: '/posts', method: 'GET', statusCode: 200, latencyMs: 42, blocked: false, ageMinutes: 240 },
    { endpoint: '/posts', method: 'POST', statusCode: 201, latencyMs: 50, blocked: false, ageMinutes: 200 },
    { endpoint: '/posts/1', method: 'PUT', statusCode: 200, latencyMs: 45, blocked: false, ageMinutes: 180 },
    { endpoint: '/todos', method: 'GET', statusCode: 200, latencyMs: 30, blocked: false, ageMinutes: 150 },
    { endpoint: '/users', method: 'GET', statusCode: 200, latencyMs: 38, blocked: false, ageMinutes: 120 },
    { endpoint: '/posts/1', method: 'DELETE', statusCode: 200, latencyMs: 32, blocked: false, ageMinutes: 90 },
    { endpoint: '/users/2', method: 'GET', statusCode: 200, latencyMs: 29, blocked: false, ageMinutes: 60 },
    { endpoint: '/posts', method: 'GET', statusCode: 200, latencyMs: 36, blocked: false, ageMinutes: 30 },

    // 3 Rate-limited requests (429)
    { endpoint: '/users', method: 'GET', statusCode: 429, latencyMs: 6, blocked: true, ageMinutes: 45 },
    { endpoint: '/users', method: 'GET', statusCode: 429, latencyMs: 5, blocked: true, ageMinutes: 44 },
    { endpoint: '/posts', method: 'GET', statusCode: 429, latencyMs: 7, blocked: true, ageMinutes: 15 },

    // 2 Unauthorized attempts (401)
    { endpoint: '/users', method: 'GET', statusCode: 401, latencyMs: 4, blocked: true, ageMinutes: 110 },
    { endpoint: '/posts', method: 'GET', statusCode: 401, latencyMs: 5, blocked: true, ageMinutes: 75 },
  ];

  for (const item of fixedHistory) {
    const createdAt = new Date(now - item.ageMinutes * 60 * 1000);
    await prisma.requestStat.create({
      data: {
        apiId: echoApi.id,
        apiKeyId: activeEchoKey.id,
        endpoint: item.endpoint,
        method: item.method,
        statusCode: item.statusCode,
        latencyMs: item.latencyMs,
        blocked: item.blocked,
        createdAt,
      },
    });
  }

  console.log(`   ✅ Seeded ${fixedHistory.length} deterministic RequestStat telemetry records.\n`);

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('✨ APIShield Deterministic Demo Seed Completed Successfully!');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🌐 Web Dashboard:    http://localhost:5173');
  console.log('🛡️  Gateway Endpoint:  http://localhost:3001/api/gateway/' + echoApi.id + '/users');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
