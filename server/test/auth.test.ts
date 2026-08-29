import axios from 'axios';
import { config } from '../config';
import { authService } from '../auth/auth.service';
import { apisService } from '../apis/apis.service';

const BASE_URL = `http://localhost:${config.port}`;

async function runAuthVerification() {
  console.log('🔒 Starting APIShield Web Authentication Verification...\n');

  const testEmail1 = `alice_${Date.now()}@example.com`;
  const testPassword1 = 'SuperSecret123!';

  const testEmail2 = `bob_${Date.now()}@example.com`;
  const testPassword2 = 'AnotherSecretPassword456!';

  // ==========================================
  // 1. REGISTRATION TESTS
  // ==========================================
  console.log('1️⃣  Testing User Registration Flow...');

  // 1a. Successful Registration
  const regRes = await axios.post(`${BASE_URL}/api/auth/register`, {
    email: testEmail1.toUpperCase(), // Test case normalization
    password: testPassword1,
  });

  console.log('   Registration Status:', regRes.status);
  console.log('   Registered User Data:', regRes.data.data.user);

  if (regRes.status !== 201) throw new Error('Expected 201 on registration');
  if (regRes.data.data.user.email !== testEmail1.toLowerCase()) {
    throw new Error('Email was not normalized to lowercase');
  }
  if ((regRes.data.data.user as any).passwordHash || (regRes.data.data.user as any).password) {
    throw new Error('SECURITY VIOLATION: passwordHash or password leaked in registration response!');
  }

  // Check Set-Cookie Header
  const setCookieHeader = regRes.headers['set-cookie'];
  console.log('   Set-Cookie Header:', setCookieHeader);
  if (!setCookieHeader || !setCookieHeader.some((c) => c.includes(config.auth.cookieName) && c.includes('HttpOnly'))) {
    throw new Error('Set-Cookie header missing apiShield_session or HttpOnly flag!');
  }
  const sessionCookieAlice = setCookieHeader[0].split(';')[0];
  console.log('   ✅ Valid registration succeeded with secure HttpOnly cookie.');

  // 1b. Duplicate Email Registration (409)
  console.log('\n2️⃣  Testing Duplicate Email Registration (Expected: 409 Conflict)...');
  const dupRes = await axios.post(
    `${BASE_URL}/api/auth/register`,
    { email: testEmail1, password: 'different-password-123' },
    { validateStatus: () => true }
  );
  console.log('   Duplicate Status Code:', dupRes.status);
  console.log('   Duplicate Error Payload:', dupRes.data);
  if (dupRes.status !== 409 || dupRes.data.error?.code !== 'CONFLICT') {
    throw new Error(`Expected 409 Conflict, got ${dupRes.status}`);
  }
  console.log('   ✅ Duplicate registration properly rejected with 409 Conflict.');

  // 1c. Invalid Email Format (400)
  console.log('\n3️⃣  Testing Invalid Email Format (Expected: 400 Validation Error)...');
  const invalidEmailRes = await axios.post(
    `${BASE_URL}/api/auth/register`,
    { email: 'not-an-email', password: 'valid-password-123' },
    { validateStatus: () => true }
  );
  console.log('   Invalid Email Status:', invalidEmailRes.status);
  if (invalidEmailRes.status !== 400 || invalidEmailRes.data.error?.code !== 'VALIDATION_ERROR') {
    throw new Error(`Expected 400 Validation Error, got ${invalidEmailRes.status}`);
  }
  console.log('   ✅ Invalid email rejected with 400.');

  // 1d. Short Password (400)
  console.log('\n4️⃣  Testing Short Password <8 chars (Expected: 400 Validation Error)...');
  const shortPassRes = await axios.post(
    `${BASE_URL}/api/auth/register`,
    { email: `valid_${Date.now()}@example.com`, password: 'short' },
    { validateStatus: () => true }
  );
  console.log('   Short Password Status:', shortPassRes.status);
  if (shortPassRes.status !== 400 || shortPassRes.data.error?.code !== 'VALIDATION_ERROR') {
    throw new Error(`Expected 400 Validation Error, got ${shortPassRes.status}`);
  }
  console.log('   ✅ Short password rejected with 400.');

  // ==========================================
  // 2. LOGIN TESTS
  // ==========================================
  console.log('\n5️⃣  Testing User Login Flow...');

  // 2a. Correct Credentials
  const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: testEmail1,
    password: testPassword1,
  });
  console.log('   Login Status:', loginRes.status);
  console.log('   Logged In User:', loginRes.data.data.user);
  if (loginRes.status !== 200 || loginRes.data.data.user.email !== testEmail1.toLowerCase()) {
    throw new Error('Login failed with correct credentials');
  }
  console.log('   ✅ Login with valid credentials succeeded.');

  // 2b. Incorrect Password (401)
  console.log('\n6️⃣  Testing Login with Incorrect Password (Expected: 401 Unauthorized)...');
  const wrongPassRes = await axios.post(
    `${BASE_URL}/api/auth/login`,
    { email: testEmail1, password: 'WrongPassword123!' },
    { validateStatus: () => true }
  );
  console.log('   Wrong Password Status:', wrongPassRes.status);
  console.log('   Wrong Password Error:', wrongPassRes.data);
  if (wrongPassRes.status !== 401 || wrongPassRes.data.error?.code !== 'UNAUTHORIZED') {
    throw new Error(`Expected 401 Unauthorized, got ${wrongPassRes.status}`);
  }

  // 2c. Unknown Email (401 - Must match message to prevent enumeration)
  console.log('\n7️⃣  Testing Login with Unknown Account (Expected: 401 with identical generic message)...');
  const unknownUserRes = await axios.post(
    `${BASE_URL}/api/auth/login`,
    { email: 'nonexistent_account_99@example.com', password: 'SomePassword123!' },
    { validateStatus: () => true }
  );
  console.log('   Unknown User Status:', unknownUserRes.status);
  console.log('   Unknown User Error:', unknownUserRes.data);
  if (unknownUserRes.status !== 401 || unknownUserRes.data.error?.message !== wrongPassRes.data.error?.message) {
    throw new Error('Error message difference detected between wrong password and unknown account!');
  }
  console.log('   ✅ Generic 401 prevents account enumeration.');

  // ==========================================
  // 3. CURRENT USER SESSION (GET /api/auth/me)
  // ==========================================
  console.log('\n8️⃣  Testing GET /api/auth/me with Cookie Session...');

  // 3a. Authenticated call with Cookie
  const meRes = await axios.get(`${BASE_URL}/api/auth/me`, {
    headers: {
      Cookie: sessionCookieAlice,
    },
  });
  console.log('   Session /me Status:', meRes.status);
  console.log('   Session /me User:', meRes.data.data.user);
  if (meRes.status !== 200 || meRes.data.data.user.email !== testEmail1.toLowerCase()) {
    throw new Error('Failed to resolve current authenticated user from session cookie');
  }
  console.log('   ✅ Valid session resolved authenticated user profile.');

  // 3b. Unauthenticated call without Cookie (401)
  console.log('\n9️⃣  Testing GET /api/auth/me without Cookie (Expected: 401)...');
  const unauthMeRes = await axios.get(`${BASE_URL}/api/auth/me`, {
    validateStatus: () => true,
  });
  console.log('   Unauthenticated /me Status:', unauthMeRes.status);
  if (unauthMeRes.status !== 401 || unauthMeRes.data.error?.code !== 'UNAUTHORIZED') {
    throw new Error(`Expected 401 Unauthorized, got ${unauthMeRes.status}`);
  }
  console.log('   ✅ Unauthenticated request rejected with 401.');

  // ==========================================
  // 4. LOGOUT TESTS
  // ==========================================
  console.log('\n🔟 Testing User Logout Flow...');
  const logoutRes = await axios.post(`${BASE_URL}/api/auth/logout`);
  console.log('   Logout Status:', logoutRes.status);
  console.log('   Logout Response:', logoutRes.data);

  const logoutCookieHeader = logoutRes.headers['set-cookie'];
  console.log('   Logout Set-Cookie Header:', logoutCookieHeader);
  if (
    !logoutCookieHeader ||
    !logoutCookieHeader.some((c) => c.includes(config.auth.cookieName) && (c.includes('Max-Age=0') || c.includes('Expires=')))
  ) {
    throw new Error('Logout failed to clear session cookie!');
  }
  console.log('   ✅ Logout cleared session cookie.');

  // ==========================================
  // 5. RESOURCE OWNERSHIP HELPER TESTS
  // ==========================================
  console.log('\n1️⃣1️⃣ Testing Resource Ownership Authorization Helper...');

  // Register User B
  const regUserB = await authService.registerUser({ email: testEmail2, password: testPassword2 });
  const userA = regRes.data.data.user;
  const userB = regUserB;

  // Create a real API belonging to User A in PostgreSQL
  const apiOfAlice = await apisService.createApi(userA.id, {
    name: "Alice's Protected API",
    targetUrl: 'https://httpbin.org',
  });

  // Test 1: User A accessing User A's API ➔ Allowed
  const ownedApi = await authService.verifyApiOwnership(userA.id, apiOfAlice.id);
  console.log('   Owner Access Result:', ownedApi.name);
  if (ownedApi.id !== apiOfAlice.id) throw new Error('Ownership verification failed for valid owner');

  // Test 2: User B accessing User A's API ➔ Rejected with 404 (Not Found to prevent leakage)
  let rejectedAs404 = false;
  try {
    await authService.verifyApiOwnership(userB.id, apiOfAlice.id);
  } catch (err: any) {
    if (err.statusCode === 404 && err.code === 'NOT_FOUND') {
      rejectedAs404 = true;
    }
  }
  if (!rejectedAs404) {
    throw new Error('User B accessing User A resource was not rejected with 404 Not Found!');
  }
  console.log('   ✅ Cross-user resource access safely rejected with 404 Not Found (zero information leakage).');

  // Test 3: Non-existent API ➔ Rejected with 404
  let notFoundRejected = false;
  try {
    await authService.verifyApiOwnership(userA.id, 'non_existent_api_id_999');
  } catch (err: any) {
    if (err.statusCode === 404) {
      notFoundRejected = true;
    }
  }
  if (!notFoundRejected) {
    throw new Error('Non-existent API access was not rejected with 404!');
  }
  console.log('   ✅ Non-existent API correctly rejected with 404 Not Found.');

  console.log('\n✨ ALL APIShield Web Authentication, Session Management, and Authorization Rules Verified Successfully!\n');
}

runAuthVerification().catch((err) => {
  console.error('Auth verification failed:', err);
  process.exit(1);
});
