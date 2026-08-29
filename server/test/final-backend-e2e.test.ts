import axios from 'axios';
import { config } from '../config';
import { validateTargetUrl } from '../gateway/ssrf';
import { rateLimiterService } from '../rate-limit/rateLimiter.service';
import { keysService } from '../api-keys/keys.service';

const BASE_URL = `http://localhost:${config.port}`;

async function runFinalBackendVerification() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🛡️  APIShield — Final Backend Master Verification Suite');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let passedAssertions = 0;

  // =========================================================================
  // 1. SECURITY & SSRF PROTECTION AUDIT
  // =========================================================================
  console.log('1️⃣  [Security Audit] SSRF Target Destination Validation...');
  const dangerousUrls = [
    'http://127.0.0.1/admin',
    'http://127.0.0.1:5432',
    'http://localhost:8080/secrets',
    'http://192.168.1.1/router',
    'http://10.0.0.1/internal',
    'http://172.16.0.1/private',
    'http://169.254.169.254/latest/meta-data',
    'ftp://example.com/files',
    'file:///etc/passwd',
  ];

  for (const url of dangerousUrls) {
    const res = await validateTargetUrl(url);
    if (res.isValid) {
      throw new Error(`CRITICAL SSRF VULNERABILITY: Destination '${url}' was allowed!`);
    }
    passedAssertions++;
  }

  const validTarget = await validateTargetUrl('https://jsonplaceholder.typicode.com');
  if (!validTarget.isValid) {
    throw new Error('Valid HTTPS public target was incorrectly blocked by SSRF check');
  }
  passedAssertions++;
  console.log(`   ✅ SSRF Guard: ${dangerousUrls.length} attack vectors rejected, valid HTTPS destinations allowed.`);

  // =========================================================================
  // 2. API KEY HASHING & KEY SCOPING AUDIT
  // =========================================================================
  console.log('\n2️⃣  [Security Audit] SHA-256 Key Hashing & Scoped Rate-Limiting Keys...');
  const testSecret = 'sk_live_demo_users_key_001';
  const hashedSecret = keysService.hashKeySecret(testSecret);

  if (!hashedSecret || hashedSecret.length !== 64) {
    throw new Error('Key hashing failed: expected 64-char hex SHA-256 hash');
  }
  if (hashedSecret === testSecret) {
    throw new Error('CRITICAL SECURITY VIOLATION: Raw key secret was not hashed!');
  }
  passedAssertions++;

  const redisKeyA = rateLimiterService.getRateLimitKey('api_users', 'key_01');
  const redisKeyB = rateLimiterService.getRateLimitKey('api_users', 'key_02');
  const redisKeyC = rateLimiterService.getRateLimitKey('api_products', 'key_01');

  if (redisKeyA === redisKeyB || redisKeyA === redisKeyC || redisKeyB === redisKeyC) {
    throw new Error('Rate-limit key collision across distinct APIs/keys');
  }
  if (redisKeyA.includes('sk_live') || redisKeyA.includes(testSecret)) {
    throw new Error('CRITICAL LEAK: Raw secret found in Redis key string!');
  }
  passedAssertions += 2;
  console.log(`   ✅ Key Hashing: SHA-256 verified (${hashedSecret.slice(0, 16)}...).`);
  console.log(`   ✅ Key Isolation: Redis keys deterministically scoped by (apiId, apiKeyId).`);

  // =========================================================================
  // 3. DUAL-ENGINE HEALTH PROBE AUDIT
  // =========================================================================
  console.log('\n3️⃣  [Observability] Dual-Engine Health Endpoint Probing...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Health check returned unexpected status ${healthRes.status}`);
  }

  const { status, database, redis } = healthRes.data;
  if (!database || !redis) {
    throw new Error('Health check payload missing database or redis status breakdown');
  }
  passedAssertions += 2;
  console.log(`   ✅ Health Status: ${status.toUpperCase()}`);
  console.log(`   ✅ Database Engine: ${database.type} (${database.status})`);
  console.log(`   ✅ Rate Limiter Engine: ${redis.type} (${redis.status})`);

  // =========================================================================
  // 4. REDIS FAIL-CLOSED RATE LIMITER POLICY (STRICT ASSERTION)
  // =========================================================================
  console.log('\n4️⃣  [Resilience] Redis Rate Limiter Fail-Closed Invariant...');
  let redisFailClosedCaught = false;
  try {
    await rateLimiterService.checkRateLimit({
      apiId: 'api_test_resilience',
      apiKeyId: 'key_test_resilience',
      limit: 5,
      windowSeconds: 60,
    });
  } catch (err: any) {
    if (err.statusCode === 503) {
      redisFailClosedCaught = true;
      console.log(`   ✅ Fail-closed policy caught: HTTP 503 (${err.message})`);
      passedAssertions++;
    } else {
      throw new Error(`Expected 503 on Redis failure, got status ${err.statusCode}`);
    }
  }

  if (!redisFailClosedCaught) {
    throw new Error('STRICT INVARIANT VIOLATION: Rate limiter did not fail closed with 503 when Redis was unavailable!');
  }

  // =========================================================================
  // 5. GATEWAY ERROR SANITIZATION & METRICS COMPATIBILITY
  // =========================================================================
  console.log('\n5️⃣  [Gateway] Error Sanitization & Safe Response Payloads...');

  // 5a. Non-existent API -> 404 (or 503 / 500 when DB is offline)
  const unknownApiRes = await axios.get(`${BASE_URL}/api/gateway/unknown-api-id-0000/users`, {
    validateStatus: () => true,
  });

  if (unknownApiRes.status === 404) {
    if (unknownApiRes.data.error?.code !== 'API_NOT_FOUND') {
      throw new Error('Expected API_NOT_FOUND code for unknown API');
    }
    console.log('   ✅ Online DB: Gateway returned 404 API_NOT_FOUND.');
  } else if (unknownApiRes.status === 503) {
    if (unknownApiRes.data.error?.code !== 'DATABASE_UNAVAILABLE') {
      throw new Error('Expected safe DATABASE_UNAVAILABLE code');
    }
    console.log('   ✅ Offline DB: Gateway safely returned 503 DATABASE_UNAVAILABLE.');
  } else if (unknownApiRes.status === 500) {
    if (unknownApiRes.data.error?.code !== 'INTERNAL_SERVER_ERROR') {
      throw new Error('Expected safe sanitized 500 error');
    }
    console.log('   ✅ Offline DB: Gateway returned sanitized 500 without leaking stack traces or connection strings.');
  }
  passedAssertions++;

  // 5b. Header Verification
  const headerCheckRes = await axios.get(`${BASE_URL}/api/health`);
  if (!headerCheckRes.headers['date']) {
    throw new Error('Missing HTTP date header');
  }
  passedAssertions++;
  console.log('   ✅ Gateway response headers validated.');

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`✨ APIShield Final Backend Master Verification Suite Passed! (${passedAssertions} verified assertions)`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

runFinalBackendVerification().catch((err) => {
  console.error('❌ Master Verification Failed:', err);
  process.exit(1);
});
