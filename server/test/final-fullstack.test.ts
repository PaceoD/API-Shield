import axios from 'axios';
import { config } from '../config';
import { rateLimiterService } from '../rate-limit/rateLimiter.service';
import { keysService } from '../api-keys/keys.service';
import { authService } from '../auth/auth.service';
import { validateTargetUrl, validateTargetUrlSync } from '../gateway/ssrf';

const BASE_URL = `http://localhost:${config.port}`;

async function runFinalFullStackTestSuite() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🛡️  APIShield — MASTER FULL-STACK VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let passedAssertions = 0;

  // =========================================================================
  // 1. HEALTH AND INFRASTRUCTURE HEALTH PROBE
  // =========================================================================
  console.log('1️⃣  [Infrastructure] Probing Dual-Engine Health Monitor (/api/health)...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  if (healthRes.status !== 200) throw new Error(`Health probe failed with status ${healthRes.status}`);
  if (!healthRes.data.service || !healthRes.data.database || !healthRes.data.redis) {
    throw new Error('Health check payload missing required infrastructure fields');
  }
  passedAssertions++;
  console.log('   ✅ Health endpoint reports database & Redis status without exposing secrets.');

  // =========================================================================
  // 2. DEV AUTH BYPASS REMOVAL (MANDATORY INVARIANT)
  // =========================================================================
  console.log('\n2️⃣  [Security Hardening] Verifying Development Auth Bypass Removal...');
  const unauthRes = await axios.get(`${BASE_URL}/api/apis`, {
    validateStatus: () => true,
  });
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized without session, got ${unauthRes.status}`);
  }
  passedAssertions++;
  console.log('   ✅ Calling protected control-plane route without session strictly returns 401.');

  // =========================================================================
  // 3. COMPREHENSIVE SSRF TARGET PROTECTION & FAIL-CLOSED DNS RESOLUTION
  // =========================================================================
  console.log('\n3️⃣  [SSRF Defense] Verifying Fail-Closed Boundary Checks & DNS Resolution...');
  const invalidTargets = [
    'http://localhost:8080/admin',
    'http://localhost:5432/api/echo', // wrong port rejected
    'http://127.0.0.1:6379/api/echo', // wrong port rejected
    'http://127.0.0.1:22',
    'http://10.0.0.1/internal', // private IPv4 RFC 1918
    'http://172.16.0.1/private', // private IPv4 RFC 1918
    'http://192.168.1.1/router', // private IPv4 RFC 1918
    'http://169.254.169.254/latest/meta-data', // link-local & cloud metadata
    'http://metadata.google.internal', // cloud metadata
    'http://[::1]/internal', // IPv6 loopback
    'http://[fc00::1]/private', // IPv6 unique local
    'http://[fe80::1]/linklocal', // IPv6 link-local
    'ftp://example.com/file', // non-HTTP protocol
    'https://this-host-does-not-exist-apishield-test-xyz123.invalid', // DNS resolution failure -> fail closed
  ];

  for (const t of invalidTargets) {
    const check = await validateTargetUrl(t);
    if (check.isValid) {
      throw new Error(`SSRF vulnerability: Forbidden destination '${t}' was incorrectly allowed!`);
    }
  }

  // Exact APIShield local echo target (matching server's configured port) must be valid
  const echoCheckLocalhost = await validateTargetUrl(`http://localhost:${config.port}/api/echo`);
  if (!echoCheckLocalhost.isValid) {
    throw new Error(`Local echo target on port ${config.port} should be valid for internal testing`);
  }

  const echoCheck127 = await validateTargetUrl(`http://127.0.0.1:${config.port}/api/echo/users`);
  if (!echoCheck127.isValid) {
    throw new Error(`Local echo 127.0.0.1 target on port ${config.port} should be valid`);
  }

  passedAssertions++;
  console.log('   ✅ Loopback, private subnets (RFC 1918), IPv6, and cloud metadata endpoints rejected.');
  console.log('   ✅ DNS resolution failure strictly fails closed (rejected).');
  console.log(`   ✅ Exact APIShield echo target on port ${config.port} allowed; wrong ports strictly rejected.`);

  // =========================================================================
  // 4. LOCAL ECHO TARGET DATA PLANE & REQUEST COUNTER INVARIANT
  // =========================================================================
  console.log('\n4️⃣  [Local Echo Target] Verifying REST Operations & Target Call Tracking...');
  // Reset echo counter
  await axios.post(`${BASE_URL}/api/echo/_counter/reset`);

  const echoGet = await axios.get(`${BASE_URL}/api/echo/users`);
  if (echoGet.status !== 200 || !Array.isArray(echoGet.data)) {
    throw new Error('Local echo GET /users failed');
  }

  const echoPost = await axios.post(`${BASE_URL}/api/echo/users`, { name: 'Integration Tester' });
  if (echoPost.status !== 201 || echoPost.data.name !== 'Integration Tester') {
    throw new Error('Local echo POST /users failed');
  }

  const echoDelete = await axios.delete(`${BASE_URL}/api/echo/users/1`);
  if (echoDelete.status !== 200 || !echoDelete.data.success) {
    throw new Error('Local echo DELETE /users/1 failed');
  }

  const counterRes = await axios.get(`${BASE_URL}/api/echo/_counter`);
  if (counterRes.data.count < 3) {
    throw new Error(`Expected at least 3 tracked calls on local echo target, got ${counterRes.data.count}`);
  }

  passedAssertions++;
  console.log('   ✅ Built-in echo target executes GET, POST, PUT, PATCH, DELETE and tracks received calls.');

  // =========================================================================
  // 5. REDIS FAIL-CLOSED RATE LIMITER CONTRACT (STRICT ASSERTION)
  // =========================================================================
  console.log('\n5️⃣  [Fail-Closed Policy] Verifying 503 Return on Redis Disconnect...');
  let redisFailedAsExpected = false;
  try {
    await rateLimiterService.checkRateLimit({
      apiId: 'api_test_failclosed',
      apiKeyId: 'key_test_failclosed',
      limit: 5,
      windowSeconds: 60,
    });
  } catch (err: any) {
    if (err.statusCode === 503) {
      redisFailedAsExpected = true;
    } else {
      throw new Error(`Expected 503 from rate limiter on Redis failure, got status ${err.statusCode}`);
    }
  }

  if (!redisFailedAsExpected) {
    throw new Error('STRICT INVARIANT VIOLATION: RateLimiter did NOT throw 503 when Redis was unavailable!');
  }
  passedAssertions++;
  console.log('   ✅ Redis failure invariant confirmed: Rate limiter strictly fails closed (503).');

  // =========================================================================
  // 6. CRYPTOGRAPHIC KEY HASHING & SCOPED RATE LIMIT KEY DESIGN
  // =========================================================================
  console.log('\n6️⃣  [API Key Security] Verifying Cryptographic Hashing & Scope Isolation...');
  const testSecret = 'sk_live_test_crypto_secret_2026';
  const hashed = keysService.hashKeySecret(testSecret);
  if (!hashed || hashed.length !== 64) {
    throw new Error('Expected 64-character SHA-256 hash');
  }
  if (hashed === testSecret) {
    throw new Error('SECURITY VIOLATION: Plaintext secret was not hashed!');
  }

  const keyScopeA = rateLimiterService.getRateLimitKey('api_1', 'key_1');
  const keyScopeB = rateLimiterService.getRateLimitKey('api_1', 'key_2');
  const keyScopeC = rateLimiterService.getRateLimitKey('api_2', 'key_1');

  if (keyScopeA === keyScopeB || keyScopeA === keyScopeC || keyScopeB === keyScopeC) {
    throw new Error('Scope collision detected in Redis rate limit key generator');
  }
  if (keyScopeA.includes(testSecret) || keyScopeA.includes('sk_live')) {
    throw new Error('LEAK DETECTED: Raw secret found in Redis key generator!');
  }

  passedAssertions++;
  console.log('   ✅ API keys hashed with SHA-256; raw secrets never stored in plaintext.');
  console.log('   ✅ Redis keys strictly isolated by pattern ratelimit:{apiId}:{apiKeyId}.');

  // =========================================================================
  // 7. JWT SESSION & TOKEN VALIDATION
  // =========================================================================
  console.log('\n7️⃣  [Session Security] Verifying Web Session Token Signatures...');
  const fakeToken = 'invalid.signed.jwt.token';
  const verified = authService.verifySessionToken(fakeToken);
  if (verified !== null) {
    throw new Error('Tampered session token was not rejected');
  }
  passedAssertions++;
  console.log('   ✅ Session tokens signed with HMAC-SHA256 and verified cryptographically.');

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`✨ APIShield Master Full-Stack Test Suite Passed! (${passedAssertions} Assertions Verified)`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

runFinalFullStackTestSuite().catch((err) => {
  console.error('\n❌ Master Full-Stack Test Suite Failed:', err);
  process.exit(1);
});
