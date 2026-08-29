# APIShield — Developer API Gateway & Observability Platform

APIShield is a high-performance, developer-focused API Gateway, Observability, and Rate-Limiting platform designed for modern backend infrastructure.

---

## 🏛️ System Architecture

APIShield uses a dual-engine architecture separating persistent configuration storage from real-time rate limiting:

```
┌────────────────────────────────────────────────────────┐
│                   APIShield Gateway                    │
│                                                        │
│  Control Plane Operations         Data Plane Routing   │
│  (Users, APIs, Keys, Stats)      (Traffic & Limits)   │
│             │                            │             │
│             ▼                            ▼             │
│    ┌──────────────────┐        ┌──────────────────┐    │
│    │    PostgreSQL    │        │      Redis       │    │
│    │  (Supabase/Cloud │        │ (Sorted Sets +   │    │
│    │   or Local DB)   │        │   Atomic Lua)    │    │
│    └──────────────────┘        └──────────────────┘    │
└────────────────────────────────────────────────────────┘
```

### 1. PostgreSQL (Persistent Control-Plane Source of Truth)
- **Users**: Account authentication, bcrypt password hashes, and session management.
- **APIs**: Target endpoints, upstream URLs, rate-limit thresholds, and enabled status.
- **API Keys**: Scoped single-API bindings with SHA-256 hashed storage (`keyHash`) and revocation timestamps (`revokedAt`).
- **Request Statistics**: Authentic historical traffic telemetry (`RequestStat`) written on live gateway events.

### 2. Redis (Real-Time Rate-Limiting Engine)
- **Volatile State**: Manages high-throughput sliding-window counters without creating disk I/O bottlenecks in PostgreSQL.
- **Data Structure**: Redis Sorted Sets (`ZSET`) with key pattern `ratelimit:{apiId}:{apiKeyId}`.
- **Atomic Lua Script**: Executes the entire sliding-window decision atomically in Redis to prevent race conditions during concurrent bursts.

---

## ⚡ Atomic Sliding-Window Rate Limiter

### How It Works:
1. **Time Source**: The Lua script calls Redis server time (`TIME`), preventing clock skew across multiple server instances.
2. **Expired Eviction**: Clears members with timestamps older than `now_ms - (windowSeconds * 1000)` using `ZREMRANGEBYSCORE`.
3. **Capacity Check**: Checks current set cardinality via `ZCARD`.
4. **Conditional Insert**: If under limit, records the request with a unique member `${now_ms}:${request_uuid}` using `ZADD` and refreshes key expiration with `EXPIRE`.
5. **Fail-Closed Policy**: If Redis is unreachable or fails, APIShield fails closed with `503 Service Unavailable` (`RATE_LIMITER_UNAVAILABLE`), preventing traffic from bypassing security rules.

### Standard Response Headers:
- `X-RateLimit-Limit`: Maximum requests permitted within the configured window.
- `X-RateLimit-Remaining`: Remaining request quota in the active sliding window.
- `X-RateLimit-Reset`: Unix timestamp (in seconds) when the window resets.
- `Retry-After`: Seconds to wait before retrying (returned on `429 Too Many Requests`).
- `X-Request-ID`: Unique correlation ID assigned to every transaction.

---

## 🚀 Quick Start & Database Setup

### Option A: Cloud PostgreSQL (Recommended - Supabase / Neon)
1. Configure your cloud database URL in `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
   REDIS_URL="redis://localhost:6379"
   ```
2. Initialize schema and seed demo data:
   ```bash
   npx prisma db push
   npm run db:seed
   ```

### Option B: Local Docker (PostgreSQL & Redis)
1. Start containers:
   ```bash
   docker compose up -d
   ```
2. Initialize schema and seed demo data:
   ```bash
   npx prisma db push
   npm run db:seed
   ```

---

## 💻 Running Development Server

```bash
npm run dev
```

- **Frontend Dashboard**: http://localhost:5173
- **Backend & Gateway API**: http://localhost:3001
- **Health Probe**: http://localhost:3001/api/health
- **Deterministic Echo Target**: http://localhost:3001/api/echo/users
