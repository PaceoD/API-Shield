import axios from 'axios';
import { config } from '../config';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../errors/AppError';

const BASE_URL = `http://localhost:${config.port}`;

async function runFoundationVerification() {
  console.log('🧪 Starting Backend Foundation Verification...\n');

  // 1. Verify Configuration
  console.log('1️⃣  Verifying Centralized Environment Configuration...');
  console.log('   Environment:', config.env);
  console.log('   Port:', config.port);
  console.log('   Database URL configured:', !!config.db.url);
  if (!config.port || !config.db.url) {
    throw new Error('Configuration validation failed');
  }
  console.log('   ✅ Environment configuration verified.');

  // 2. Verify Error Classes
  console.log('\n2️⃣  Verifying Error Hierarchy...');
  const badReq = new BadRequestError('Test bad request', [{ field: 'email', message: 'Required' }]);
  if (badReq.statusCode !== 400 || badReq.code !== 'BAD_REQUEST') {
    throw new Error('BadRequestError failed');
  }

  const unauth = new UnauthorizedError();
  if (unauth.statusCode !== 401 || unauth.code !== 'UNAUTHORIZED') {
    throw new Error('UnauthorizedError failed');
  }

  const forbidden = new ForbiddenError();
  if (forbidden.statusCode !== 403 || forbidden.code !== 'FORBIDDEN') {
    throw new Error('ForbiddenError failed');
  }

  const notFound = new NotFoundError();
  if (notFound.statusCode !== 404 || notFound.code !== 'NOT_FOUND') {
    throw new Error('NotFoundError failed');
  }

  const rateLimit = new TooManyRequestsError();
  if (rateLimit.statusCode !== 429 || rateLimit.code !== 'RATE_LIMIT_EXCEEDED') {
    throw new Error('TooManyRequestsError failed');
  }
  console.log('   ✅ All AppError classes verified.');

  // 3. Verify Health Check Endpoint
  console.log('\n3️⃣  Testing GET /api/health Endpoint...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  console.log('   Status Code:', healthRes.status);
  console.log('   Payload:', healthRes.data);
  if (healthRes.status !== 200) throw new Error('Health check status was not 200');
  if (!healthRes.data.service || !healthRes.data.database) {
    throw new Error('Health check payload missing required fields');
  }
  console.log('   ✅ Health endpoint responding cleanly.');

  // 4. Verify 404 Not Found Handling
  console.log('\n4️⃣  Testing 404 Not Found Handler...');
  const notFoundRes = await axios.get(`${BASE_URL}/api/unmapped-endpoint-path-xyz`, {
    validateStatus: () => true,
  });
  console.log('   Status Code:', notFoundRes.status);
  console.log('   Payload:', notFoundRes.data);
  if (notFoundRes.status !== 404 || notFoundRes.data.error?.code !== 'NOT_FOUND') {
    throw new Error('404 error formatting failed');
  }
  console.log('   ✅ 404 error handler verified.');

  console.log('\n✨ Backend Foundation & PostgreSQL Setup Verified Successfully!\n');
}

runFoundationVerification().catch((err) => {
  console.error('Foundation verification failed:', err);
  process.exit(1);
});
