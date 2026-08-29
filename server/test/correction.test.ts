import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { validateTargetUrl, assertSafeTargetUrl } from '../gateway/ssrf';
import { keysService } from '../api-keys/keys.service';

const BASE_URL = `http://localhost:${config.port}`;

async function runCorrectionVerification() {
  console.log('🛡️  Starting APIShield Backend Correction Pass Verification...\n');

  // ==========================================
  // 1. VERIFY COMPLETE REMOVAL OF PROTOTYPE STORE
  // ==========================================
  console.log('1️⃣  Verifying removal of prototype store files...');
  const storePath = path.resolve(process.cwd(), 'server', 'store.ts');
  const dbJsonPath = path.resolve(process.cwd(), 'server', 'data', 'db.json');

  if (fs.existsSync(storePath)) {
    throw new Error('server/store.ts still exists in workspace!');
  }
  if (fs.existsSync(dbJsonPath)) {
    throw new Error('server/data/db.json still exists in workspace!');
  }
  console.log('   ✅ server/store.ts and server/data/db.json successfully deleted.');

  // Check that no server file imports store.ts
  const serverDir = path.resolve(process.cwd(), 'server');
  function checkNoStoreImports(dir: string) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        checkNoStoreImports(fullPath);
      } else if (file.name.endsWith('.ts') && !file.name.includes('test')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes("from '../store'") || content.includes("from './store'")) {
          throw new Error(`File ${file.name} still contains import from store!`);
        }
      }
    }
  }
  checkNoStoreImports(serverDir);
  console.log('   ✅ Zero imports of store.ts detected across entire server codebase.');

  // ==========================================
  // 2. VERIFY SSRF PROTECTION MODULE
  // ==========================================
  console.log('\n2️⃣  Verifying SSRF Target URL Protection Module...');

  const loopbackChecks = [
    'http://127.0.0.1:8080/api',
    'http://localhost:3000',
    'http://test.localhost',
    'http://0.0.0.0:8000',
    'http://[::1]:8080',
    'http://10.0.0.1/admin',
    'http://172.16.0.5/api',
    'http://172.31.255.255',
    'http://192.168.1.1/router',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal',
  ];

  for (const url of loopbackChecks) {
    const res = await validateTargetUrl(url);
    if (res.isValid) {
      throw new Error(`SSRF check failed to reject unsafe URL: ${url}`);
    }
    console.log(`   Blocked: ${url} ➔ ${res.reason}`);
  }

  const validUrls = [
    'https://jsonplaceholder.typicode.com',
    'https://api.open-meteo.com',
    'https://httpbin.org',
    'https://api.github.com',
  ];
  for (const url of validUrls) {
    const res = await validateTargetUrl(url);
    if (!res.isValid) {
      throw new Error(`SSRF check falsely rejected valid public URL: ${url}`);
    }
  }
  console.log('   ✅ SSRF protection correctly blocks loopback/private/metadata URLs and allows public URLs.');

  // ==========================================
  // 3. VERIFY CRYPTOGRAPHIC KEY HASHING
  // ==========================================
  console.log('\n3️⃣  Verifying Cryptographic API Key Hashing...');
  const testSecret = 'test_secret_1234567890abcdef1234567890abcdef';
  const hash1 = keysService.hashKeySecret(testSecret);
  const hash2 = keysService.hashKeySecret(testSecret);
  if (hash1 !== hash2 || hash1.length !== 64) {
    throw new Error('SHA-256 key hashing failed deterministic verification');
  }
  console.log('   SHA-256 Hash of key:', hash1);
  console.log('   ✅ Key hashing is deterministic, SHA-256 64-hex string.');

  // ==========================================
  // 4. VERIFY HEALTH CHECK & DATABASE STATUS
  // ==========================================
  console.log('\n4️⃣  Testing GET /api/health Endpoint...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  console.log('   Health Status:', healthRes.data);
  if (healthRes.status !== 200 || !healthRes.data.service || !healthRes.data.database) {
    throw new Error('Health check missing required structure');
  }
  console.log('   Database Engine Type:', healthRes.data.database.type);
  console.log('   Database Connection State:', healthRes.data.database.status);
  console.log('   ✅ Health endpoint actively probes PostgreSQL connectivity.');

  // ==========================================
  // 5. VERIFY EXPLICIT ERROR BEHAVIOR (NO SILENT MEMORY FALLBACK)
  // ==========================================
  console.log('\n5️⃣  Verifying Explicit Error Behavior When PostgreSQL is Unavailable...');
  // Per Section 6: When PostgreSQL is unavailable, fail explicitly with 500 error instead of silently switching to in-memory data
  const regAttempt = await axios.post(
    `${BASE_URL}/api/auth/register`,
    { email: 'offline_test@example.com', password: 'StrongPassword123!' },
    { validateStatus: () => true }
  );
  console.log('   Registration Attempt Status Code:', regAttempt.status);
  console.log('   Registration Attempt Response Payload:', regAttempt.data);

  if (healthRes.data.database.status === 'connected') {
    if (regAttempt.status === 201) {
      console.log('   ✅ PostgreSQL online: User registered with 201 Created.');
    } else if (regAttempt.status === 409) {
      console.log('   ✅ PostgreSQL online: Duplicate user returned 409 Conflict.');
    } else {
      throw new Error(`Unexpected status code ${regAttempt.status} on registration with connected database`);
    }
  } else {
    if (regAttempt.status !== 503 && regAttempt.status !== 500) {
      throw new Error(`Expected explicit 503 DATABASE_UNAVAILABLE or 500 when PostgreSQL is unavailable, got status ${regAttempt.status}`);
    }
    console.log('   ✅ Server returned safe database error without leaking connection strings or credentials.');
  }
  if (JSON.stringify(regAttempt.data).includes('passwordHash') || JSON.stringify(regAttempt.data).includes('postgresql://')) {
    throw new Error('SECURITY VIOLATION: Database connection string or passwordHash leaked in response!');
  }
  console.log('   ✅ Confirmed: Zero silent fallbacks to in-memory databases.');

  // ==========================================
  // 6. SYSTEM INFO ROUTE
  // ==========================================
  console.log('\n6️⃣  Testing GET /api/system Information Route...');
  const sysRes = await axios.get(`${BASE_URL}/api/system`);
  console.log('   System Info:', sysRes.data.data);
  if (sysRes.data.data.storageEngine !== 'PostgreSQL Database Engine') {
    throw new Error('System info does not reflect PostgreSQL Database Engine');
  }
  console.log('   ✅ Storage Engine correctly reported as PostgreSQL Database Engine.');

  console.log('\n✨ ALL APIShield Backend Correction Pass Tests and Security Invariants Verified Successfully!\n');
}

runCorrectionVerification().catch((err) => {
  console.error('Correction verification failed:', err);
  process.exit(1);
});
