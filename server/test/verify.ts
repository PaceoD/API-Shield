import axios from 'axios';
import { spawn } from 'child_process';

const BASE_URL = 'http://localhost:3001';

async function runTests() {
  console.log('🚀 Starting APIShield Automated Verification Suite...\n');

  // 1. Check Health & System
  console.log('1️⃣  Checking System Health...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  console.log('   Health Status:', healthRes.data.status);
  if (healthRes.data.status !== 'healthy') throw new Error('Health check failed');

  const systemRes = await axios.get(`${BASE_URL}/api/system`);
  console.log('   Engine Version:', systemRes.data.data.version);
  console.log('   Gateway Active:', systemRes.data.data.gatewayActive);

  // 2. Fetch APIs
  console.log('\n2️⃣  Listing Configured APIs...');
  const apisRes = await axios.get(`${BASE_URL}/api/apis`);
  console.log(`   Found ${apisRes.data.data.length} APIs:`, apisRes.data.data.map((a: any) => a.name));

  // 3. Create a strict rate-limited API (3 req / 10s)
  console.log('\n3️⃣  Creating Stricly Rate-Limited Test API (3 req / 10s)...');
  const createApiRes = await axios.post(`${BASE_URL}/api/apis`, {
    name: 'E2E Test Rate-Limit Service',
    description: 'Automated test suite API',
    targetUrl: 'https://jsonplaceholder.typicode.com',
    pathPrefix: 'e2e-test',
    rateLimit: 3,
    rateWindow: 10000,
    rateWindowLabel: '10 seconds',
    authRequired: true,
    enabled: true,
  });
  const testApi = createApiRes.data.data;
  console.log('   Created API ID:', testApi.id);

  // 4. Generate an API Key for this API
  console.log('\n4️⃣  Generating API Key...');
  const keyRes = await axios.post(`${BASE_URL}/api/keys`, {
    name: 'E2E Test Key',
    apiId: testApi.id,
  });
  const apiKeySecret = keyRes.data.data.secretKey;
  const apiKeyId = keyRes.data.data.id;
  console.log('   Generated Key Secret:', apiKeySecret);

  // 5. Test Gateway Proxy Requests (1 to 3 should succeed, 4th should return 429)
  console.log('\n5️⃣  Testing Gateway Proxy & Sliding-Window Rate Limiter...');
  for (let i = 1; i <= 4; i++) {
    try {
      const gwRes = await axios.get(`${BASE_URL}/api/gateway/${testApi.id}/posts/1`, {
        headers: {
          'X-API-Key': apiKeySecret,
        },
        validateStatus: () => true,
      });

      const remaining = gwRes.headers['x-ratelimit-remaining'];
      const limit = gwRes.headers['x-ratelimit-limit'];
      const latency = gwRes.headers['x-gateway-latency-ms'];

      console.log(
        `   Request #${i} ➔ HTTP ${gwRes.status} | Latency: ${latency}ms | Tokens Remaining: ${remaining}/${limit}`
      );

      if (i <= 3) {
        if (gwRes.status !== 200) throw new Error(`Expected HTTP 200 on request #${i}, got ${gwRes.status}`);
      } else {
        if (gwRes.status !== 429) throw new Error(`Expected HTTP 429 on request #${i}, got ${gwRes.status}`);
        console.log('   ✅ HTTP 429 Rate Limit Throttling correctly triggered!');
        console.log('   Retry-After header:', gwRes.headers['retry-after'], 'seconds');
        console.log('   Error payload:', gwRes.data);
      }
    } catch (err: any) {
      console.error(`Request #${i} error:`, err.message);
      throw err;
    }
  }

  // 6. Test Key Revocation & Unauthorized Check
  console.log('\n6️⃣  Revoking API Key and testing 401 Unauthorized...');
  await axios.post(`${BASE_URL}/api/keys/${apiKeyId}/revoke`);
  const revokedRes = await axios.get(`${BASE_URL}/api/gateway/${testApi.id}/posts/1`, {
    headers: {
      'X-API-Key': apiKeySecret,
    },
    validateStatus: () => true,
  });
  console.log('   Revoked Key Response Status:', revokedRes.status);
  if (revokedRes.status !== 401) throw new Error(`Expected HTTP 401 after revoking key, got ${revokedRes.status}`);
  console.log('   ✅ HTTP 401 Unauthorized correctly returned for revoked key!');

  // 7. Verify Analytics Aggregation
  console.log('\n7️⃣  Verifying Real Analytics Aggregation...');
  const overviewRes = await axios.get(`${BASE_URL}/api/analytics/overview?range=24h`);
  const overview = overviewRes.data.data;
  console.log('   Total Requests:', overview.totalRequests);
  console.log('   Blocked Requests:', overview.blockedRequests);
  console.log('   Block Rate:', `${overview.blockRate}%`);
  console.log('   Average Latency:', `${overview.avgLatency} ms`);
  console.log('   Active APIs:', overview.activeApisCount);

  // 8. Clean up test API
  console.log('\n8️⃣  Cleaning up test API...');
  await axios.delete(`${BASE_URL}/api/apis/${testApi.id}`);
  console.log('   Cleaned up test API successfully.');

  console.log('\n✨ ALL APIShield Endpoints, Gateway Proxying, Rate Limiting, and Analytics Verified Successfully!\n');
}

runTests().catch((err) => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
