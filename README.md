# APIShield

### Secure API Gateway, Rate Limiting & Observability Platform

APIShield is a developer-focused API Gateway that sits between clients and backend services to provide API-key authentication, API authorization, Redis-backed rate limiting, SSRF protection, request logging, and traffic analytics.

It provides a web dashboard for managing APIs and API keys, testing gateway requests, monitoring traffic, and analyzing gateway performance.

---

## ✨ Key Features

- 🔐 User authentication and protected dashboard
- 🔑 API key generation, authentication, and revocation
- 🔒 Secure API-key secret handling using SHA-256 hashing
- 🚪 Reverse-proxy API Gateway for upstream services
- 🛡️ Per-API API-key authorization and isolation
- ⚡ Redis-backed sliding-window rate limiting
- 🔄 Atomic Redis Lua-based rate-limit enforcement
- 🧯 Fail-closed behavior when Redis is unavailable
- 🛡️ SSRF protection for upstream target URLs
- 📊 Request analytics and traffic monitoring
- 📝 Request-level traffic logs
- 📈 Average and P95 latency tracking
- 🚦 Rate-limit response headers
- 🆔 Request correlation IDs
- 👥 Multi-user API isolation
- 🧪 Integration, E2E, and security tests
- 🐳 Docker-based PostgreSQL and Redis infrastructure
- 🖥️ Interactive Gateway Test Console

---

## 🖥️ Dashboard

APIShield provides an interactive web dashboard for managing APIs, API keys, gateway requests, analytics, traffic logs, and system configuration.

### Main Dashboard

> Add a screenshot of the APIShield dashboard here.

### Gateway Test Console

The Gateway Test Console allows developers to send requests through APIShield and inspect:

- HTTP status
- Response body
- Response headers
- Request latency
- Rate-limit information
- Retry information
- Gateway errors

### Analytics

The analytics dashboard provides visibility into:

- Total requests
- Blocked requests
- Allowed requests
- Average latency
- P95 latency
- Traffic volume
- Endpoint statistics
- Status-code distribution

---

# 🏗️ System Architecture

APIShield separates persistent control-plane data from high-frequency data-plane operations.

```text
                         ┌──────────────────────────┐
                         │      APIShield UI        │
                         │    React + TypeScript    │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │    APIShield Backend     │
                         │     Node.js + Express    │
                         └────────────┬─────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
                 ▼                    ▼                    ▼
        ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
        │   PostgreSQL    │  │      Redis      │  │ Security Layer  │
        │                 │  │                 │  │                 │
        │ Users           │  │ Rate Limiting   │  │ API Auth        │
        │ APIs            │  │ Sliding Window  │  │ Authorization   │
        │ API Keys        │  │ Atomic Lua      │  │ SSRF Protection │
        │ Request Stats   │  │                 │  │                 │
        └─────────────────┘  └─────────────────┘  └─────────────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │    Target API    │
                             │    / Upstream    │
                             └──────────────────┘
```

### PostgreSQL — Persistent Control Plane

PostgreSQL acts as the persistent source of truth for application configuration and historical data.

It stores:

- User accounts and authentication data
- API configurations
- API metadata
- API-key metadata
- SHA-256 API-key hashes
- API-key revocation state
- Request statistics
- Historical gateway telemetry

### Redis — Real-Time Data Plane

Redis handles high-frequency rate-limiting state.

It uses:

- Redis Sorted Sets (`ZSET`)
- Redis server time
- Atomic Lua scripting
- Per-API and per-key rate-limit state

Keeping this volatile state in Redis avoids using PostgreSQL as the high-frequency rate-limit counter.

---

# 🔄 Request Lifecycle

Every request entering the gateway passes through authentication, authorization, rate limiting, security validation, upstream routing, and telemetry recording.

```text
Client
  │
  ▼
APIShield Gateway
  │
  ├── Generate Request ID
  │
  ├── Identify API
  │
  ├── Validate API Key
  │
  ├── Verify API-Key → API binding
  │
  ├── Check Redis Rate Limit
  │
  ├── Validate Upstream Target
  │
  ▼
Target API
  │
  ▼
Response
  │
  ├── Rate-limit headers
  ├── Request ID
  └── Latency information
  │
  ▼
PostgreSQL Request Statistics
```

This makes APIShield a security and control layer between clients and backend services rather than a simple HTTP proxy.

---

# 🔐 Authentication & Authorization

## User Authentication

The APIShield dashboard uses authenticated sessions to protect control-plane operations.

Authenticated users can manage the APIs and API keys belonging to their own account.

---

## API-Key Authentication

Protected gateway requests use an API key through the `X-API-Key` header:

```http
X-API-Key: sk_live_...
```

The gateway validates the supplied secret against the stored key hash.

Invalid or revoked API keys are rejected with:

```http
401 Unauthorized
```

---

## API-Key Authorization

API keys are scoped to individual APIs.

For example:

```text
Key A
  │
  └── Local Echo API       ✅

Key A
  │
  └── Demo Users API       ❌
```

If a valid key belonging to one API is used against another API, the gateway returns:

```http
403 Forbidden
```

with:

```text
FORBIDDEN_KEY_API_MISMATCH
```

This prevents credentials from being reused across unrelated APIs.

---

# 🔑 API-Key Security

APIShield follows a one-time-secret model for API keys.

When a key is generated:

```text
Raw API Secret
      │
      ▼
    SHA-256
      │
      ▼
    keyHash
      │
      ▼
 PostgreSQL
```

The plaintext API secret is not stored in PostgreSQL.

The raw secret is returned to the user only during key creation.

After creation, API-key listings expose masked representations instead of the raw secret:

```text
sk_live_••••••••
```

If the raw secret is no longer available to the client, it cannot be reconstructed from the stored SHA-256 hash.

API keys can also be revoked. Once revoked, subsequent authentication attempts are rejected.

---

# ⚡ Redis Sliding-Window Rate Limiting

APIShield uses Redis as its real-time rate-limiting engine.

The implementation uses:

- Redis Sorted Sets (`ZSET`)
- Redis server time
- Atomic Lua execution
- Per-API rate limits
- Per-API-key rate-limit isolation

Rate-limit state follows the pattern:

```text
ratelimit:{apiId}:{apiKeyId}
```

This prevents rate-limit state from being shared incorrectly between different APIs or API keys.

---

## How the Algorithm Works

For every incoming request:

```text
1. Obtain the current Redis server time.
2. Remove requests that have expired from the sliding window.
3. Count requests currently inside the window.
4. Compare the count with the configured limit.
5. If capacity exists, record the request.
6. Otherwise, reject the request.
```

The complete decision is performed atomically inside Redis using Lua.

This prevents race conditions during concurrent request bursts.

For example, with a limit of:

```text
5 requests / minute
```

a concurrent burst can be evaluated atomically so that the gateway does not accidentally allow more than the configured capacity.

---

# 🧯 Fail-Closed Rate Limiting

Rate limiting is treated as a security control.

If Redis becomes unavailable and APIShield cannot safely perform the rate-limit decision:

```text
Request
   │
   ▼
Redis unavailable
   │
   ▼
503 Service Unavailable
   │
   ▼
Target API is NOT called
```

The gateway returns:

```text
RATE_LIMITER_UNAVAILABLE
```

instead of allowing the request to bypass the rate limiter.

This prevents an infrastructure failure from silently disabling a security control.

---

# 🚦 Rate-Limit Response Headers

Gateway responses expose rate-limit information through:

```http
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
Retry-After
X-Request-ID
```

For example:

```http
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
Retry-After: 50
```

When the configured rate limit is exceeded, the gateway returns:

```http
429 Too Many Requests
```

---

# 🛡️ SSRF Protection

APIShield validates configured upstream target URLs before allowing gateway routing.

This prevents the gateway from being abused as a proxy for accessing potentially dangerous internal resources.

Protected destination categories include:

```text
localhost
127.0.0.1
private network addresses
cloud metadata endpoints
```

Unsafe targets are rejected before they can be used for gateway routing.

This provides an additional security boundary around configurable upstream APIs.

---

# 📊 Observability

APIShield records gateway traffic and exposes telemetry through the dashboard.

Tracked information includes:

- Total requests
- Allowed requests
- Blocked requests
- HTTP methods
- Request paths
- HTTP status codes
- Request latency
- Average latency
- P95 latency
- API usage
- API-key usage
- Block reasons
- Request timestamps

Example:

```text
Total Requests       16
Blocked Requests      6
Average Latency      70 ms
P95 Latency          729 ms
```

Request statistics are persisted in PostgreSQL.

---

# 📝 Traffic Logs

The Traffic Log provides request-level visibility into gateway activity.

Example:

```text
TIME       METHOD   PATH      STATUS   LATENCY   STATE

11:16:17   GET      /health   429      294 ms    Throttled
11:16:14   GET      /health   200      682 ms    Forwarded
11:16:12   GET      /health   200      309 ms    Forwarded
```

Each request can therefore be inspected based on:

- Timestamp
- HTTP method
- Path
- Status code
- Latency
- Forwarded/blocked state
- API
- API key
- Block reason

---

# 🆔 Request Correlation

Each gateway transaction receives a unique request identifier.

```http
X-Request-ID: <unique-request-id>
```

The identifier allows individual requests to be correlated across gateway processing and telemetry.

---

# 🩺 Health Monitoring

APIShield provides a health endpoint:

```http
GET /api/health
```

It reports the status of the backend and its important infrastructure dependencies.

Example:

```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "type": "PostgreSQL"
  },
  "redis": {
    "status": "connected",
    "type": "Redis Rate Limiter"
  }
}
```

---

# 🖥️ Gateway Test Console

APIShield includes an interactive Gateway Test Console for testing APIs through the gateway.

Supported methods include:

```text
GET
POST
PUT
PATCH
DELETE
```

The console supports:

- API selection
- HTTP method selection
- Custom subpaths
- API-key authentication
- Custom headers
- Request bodies
- Response inspection
- Status-code inspection
- Latency measurement
- Rate-limit information
- Error inspection

This provides a convenient way to demonstrate gateway behavior without requiring an external API client.

---

# 🧪 Testing & Verification

APIShield includes automated tests covering authentication, API management, gateway routing, API-key security, rate limiting, Redis behavior, SSRF protection, analytics, and end-to-end flows.

## TypeScript Type Check

```bash
npx tsc --noEmit
```

## Production Build

```bash
npm run build
```

## Real Gateway Integration Tests

```bash
npx tsx server/test/real-gateway-integration.test.ts
```

## Full-Stack Tests

```bash
npx tsx server/test/final-fullstack.test.ts
```

## Backend E2E Tests

```bash
npx tsx server/test/final-backend-e2e.test.ts
```

## Gateway & Analytics Tests

```bash
npx tsx server/test/e2e-gateway-analytics.test.ts
```

## Security Verification

```bash
npx tsx server/test/correction.test.ts
```

### Verified scenarios include:

- User authentication
- Multi-user authorization
- API creation
- API-key generation
- API-key hashing
- API-key revocation
- Invalid API-key rejection
- Cross-API API-key isolation
- GET gateway requests
- POST gateway requests
- PUT gateway requests
- PATCH gateway requests
- DELETE gateway requests
- Concurrent rate limiting
- Redis failure handling
- SSRF protection
- Request-stat persistence
- Analytics reporting
- Rate-limit scope isolation

---

# 🧰 Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Node.js
- Express
- TypeScript

### Database

- PostgreSQL
- Prisma ORM

### Real-Time Infrastructure

- Redis
- Redis Sorted Sets
- Redis Lua scripting

### Infrastructure

- Docker
- Docker Compose

### Testing

- TypeScript-based integration tests
- End-to-end tests
- Security verification tests

---

# 📁 Project Structure

```text
API-Shield/
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── server/
│   ├── analytics/
│   ├── api-keys/
│   ├── apis/
│   ├── auth/
│   ├── config/
│   ├── database/
│   ├── errors/
│   ├── gateway/
│   ├── rate-limit/
│   ├── redis/
│   ├── routes/
│   ├── test/
│   ├── validation/
│   └── index.ts
│
├── src/
│   ├── components/
│   ├── context/
│   ├── pages/
│   ├── services/
│   ├── types/
│   └── App.tsx
│
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

# 🚀 Local Development

## Prerequisites

- Node.js
- npm
- Docker Desktop

---

## 1. Clone the Repository

```bash
git clone https://github.com/PaceoD/API-Shield.git
cd API-Shield
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Create a `.env` file using `.env.example` as a reference.

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/apishield?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-development-secret"
PORT=3001
```

> Never commit `.env` or production credentials to Git.

---

## 4. Start Infrastructure

Start PostgreSQL and Redis using Docker Compose:

```bash
docker compose up -d
```

Verify the containers:

```bash
docker ps
```

---

## 5. Initialize the Database

Apply the Prisma schema:

```bash
npx prisma db push
```

Seed demo data:

```bash
npm run db:seed
```

---

## 6. Start the Development Server

```bash
npm run dev
```

The application will be available at:

```text
Frontend:
http://localhost:5173

Backend:
http://localhost:3001

Health:
http://localhost:3001/api/health
```

Deterministic test target:

```text
http://localhost:3001/api/echo/users
```

---

# 🔌 Gateway Example

Once an API and API key have been configured, requests can be sent through the APIShield Gateway.

Example:

```bash
curl -X GET \
  "http://localhost:3001/api/gateway/<API_ID>/users" \
  -H "X-API-Key: <API_KEY>"
```

The gateway performs authentication, authorization, rate limiting, target validation, upstream forwarding, and telemetry recording before returning the response.

---

# 🧠 Engineering Decisions

## PostgreSQL + Redis

PostgreSQL is used for durable application state and historical telemetry.

Redis is used for rapidly changing rate-limit state.

This separation prevents high-frequency rate-limit operations from becoming dependent on database writes.

---

## Atomic Lua Rate Limiting

A simple sequence such as:

```text
ZCARD
  ↓
check limit
  ↓
ZADD
```

could suffer from race conditions when multiple requests execute concurrently.

APIShield performs the decision and update atomically inside Redis using Lua.

---

## Fail-Closed Security

If the gateway cannot reliably determine whether a request is within its configured rate limit, it rejects the request instead of bypassing the security control.

This prioritizes enforcement correctness over availability during a Redis failure.

---

## One-Time API Secrets

API secrets are returned only at creation time and are not stored in plaintext.

This reduces the impact of a database compromise because the database contains the SHA-256 hash rather than the original credential.

---

## API-Key Scoping

Keys are bound to individual APIs rather than being globally valid.

This limits the blast radius of a compromised credential and prevents accidental cross-service credential reuse.

---

# 📌 Verification Status

The core APIShield system has been verified through automated type checking, production builds, integration tests, backend E2E tests, gateway/analytics tests, and security-focused verification.

Verified functionality includes:

```text
✅ Authentication
✅ API management
✅ API-key lifecycle
✅ API-key hashing
✅ API-key revocation
✅ API-key/API authorization
✅ Gateway routing
✅ Rate limiting
✅ Concurrent rate-limit enforcement
✅ Redis integration
✅ Fail-closed Redis behavior
✅ SSRF protection
✅ Request logging
✅ Analytics
✅ Latency tracking
✅ PostgreSQL persistence
✅ Gateway Test Console
✅ Multi-user isolation
```

---

# 🔮 Future Improvements

Potential extensions include:

- Horizontal gateway scaling
- Distributed gateway deployment
- Advanced API quotas
- OAuth/JWT upstream authentication
- OpenTelemetry integration
- Prometheus metrics
- Distributed tracing
- WebSocket gateway support
- Advanced load testing and benchmarking
- Automated log-retention jobs
- API usage quotas and billing
- Additional gateway authentication strategies

---

# 👤 Author

**Palak Aggarwal**

GitHub: https://github.com/PaceoD

LinkedIn: https://www.linkedin.com/in/palak-aggarwal-0b125930a/

---

## 📄 License

This project is currently intended as a portfolio and educational project.
