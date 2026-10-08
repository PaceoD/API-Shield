// server/index.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// server/config.ts
import dotenv from "dotenv";
import path from "path";
import { z } from "zod";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("3001").transform((val) => parseInt(val, 10)).pipe(z.number().positive()),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").default("postgresql://postgres:postgres@localhost:5432/apishield?schema=public"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required").default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").default("apishield_dev_super_secret_session_key_2026")
});
var parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error("\u274C Invalid environment configuration:");
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error("Environment configuration validation failed");
}
var config = {
  env: parsedEnv.data.NODE_ENV,
  isProduction: parsedEnv.data.NODE_ENV === "production",
  isDevelopment: parsedEnv.data.NODE_ENV === "development",
  isTest: parsedEnv.data.NODE_ENV === "test",
  port: parsedEnv.data.PORT,
  db: {
    url: parsedEnv.data.DATABASE_URL
  },
  redis: {
    url: parsedEnv.data.REDIS_URL
  },
  auth: {
    jwtSecret: parsedEnv.data.JWT_SECRET,
    cookieName: "apiShield_session",
    sessionDurationSeconds: 7 * 24 * 60 * 60
    // 7 days
  }
};

// server/routes/health.ts
import { Router } from "express";

// server/database/prisma.ts
import { PrismaClient } from "@prisma/client";
var dbUrl = config.db.url.includes("connection_limit") ? config.db.url : `${config.db.url}${config.db.url.includes("?") ? "&" : "?"}connection_limit=3`;
var prisma = global.prismaGlobal || new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  },
  log: config.isDevelopment ? ["warn", "error"] : ["error"]
});
if (config.isDevelopment) {
  global.prismaGlobal = prisma;
}
async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
async function disconnectDatabase() {
  await prisma.$disconnect();
}

// server/redis/client.ts
import { Redis } from "ioredis";
var redisOptions = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 1e3);
  }
};
var redis = global.redisGlobal || new Redis(config.redis.url, redisOptions);
redis.on("error", (err) => {
  if (config.isDevelopment) {
  } else {
    console.error("Redis connection error:", err.message);
  }
});
if (config.isDevelopment) {
  global.redisGlobal = redis;
}
async function checkRedisConnection() {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
async function disconnectRedis() {
  try {
    if (redis.status !== "end" && redis.status !== "close") {
      await redis.quit();
    }
  } catch {
    redis.disconnect();
  }
}

// server/routes/health.ts
var healthRouter = Router();
healthRouter.get("/", async (req, res) => {
  const [isDbConnected, isRedisConnected] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection()
  ]);
  const isHealthy = isDbConnected && isRedisConnected;
  const healthData = {
    status: isHealthy ? "ok" : "degraded",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    service: "APIShield Backend",
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.env,
    database: {
      status: isDbConnected ? "connected" : "disconnected",
      type: "PostgreSQL"
    },
    redis: {
      status: isRedisConnected ? "connected" : "disconnected",
      type: "Redis Rate Limiter"
    }
  };
  return res.status(200).json(healthData);
});

// server/routes/auth.ts
import { Router as Router2 } from "express";

// server/auth/auth.service.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// server/errors/AppError.ts
var AppError = class extends Error {
  statusCode;
  code;
  isOperational;
  details;
  constructor(statusCode, code, message, details, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
};
var BadRequestError = class extends AppError {
  constructor(message = "Invalid request parameters", details) {
    super(400, "BAD_REQUEST", message, details);
  }
};
var UnauthorizedError = class extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
};
var NotFoundError = class extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
};
var ConflictError = class extends AppError {
  constructor(message = "Resource conflict") {
    super(409, "CONFLICT", message);
  }
};
var ServiceUnavailableError = class extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
};

// server/auth/auth.service.ts
var AuthService = class {
  /**
   * Hashes a raw password with bcrypt (salt rounds: 10).
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }
  /**
   * Compares a raw password with a bcrypt hash.
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }
  /**
   * Signs a 7-day session token for an authenticated user.
   */
  createSessionToken(user) {
    const payload = {
      sub: user.id,
      email: user.email
    };
    return jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.sessionDurationSeconds
    });
  }
  /**
   * Verifies and decodes a session token.
   */
  verifySessionToken(token) {
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      return decoded;
    } catch {
      return null;
    }
  }
  /**
   * Registers a new user with email and hashed password in PostgreSQL.
   */
  async registerUser(input) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
    if (existing) {
      throw new ConflictError("An account with this email address already exists.");
    }
    const passwordHash = await this.hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        createdAt: true
      }
    });
    return user;
  }
  /**
   * Authenticates a user by email and password from PostgreSQL.
   */
  async loginUser(input) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const userRecord = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
    if (!userRecord) {
      throw new UnauthorizedError("Invalid email or password");
    }
    const isMatch = await this.verifyPassword(input.password, userRecord.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Invalid email or password");
    }
    return {
      id: userRecord.id,
      email: userRecord.email,
      createdAt: userRecord.createdAt
    };
  }
  /**
   * Retrieves a safe user by ID from PostgreSQL.
   */
  async getUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true
      }
    });
    return user;
  }
  /**
   * Verifies that an API exists and belongs to the authenticated user.
   * Returns 404 on not found or mismatched owner to prevent resource leakage.
   */
  async verifyApiOwnership(userId, apiId) {
    const apiRecord = await prisma.api.findUnique({
      where: { id: apiId },
      select: { id: true, userId: true, name: true }
    });
    if (!apiRecord || apiRecord.userId !== userId) {
      throw new NotFoundError("API not found");
    }
    return apiRecord;
  }
};
var authService = new AuthService();

// server/auth/auth.middleware.ts
async function requireAuthenticatedUser(req, res, next) {
  const sessionToken = req.cookies?.[config.auth.cookieName] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!sessionToken) {
    next(new UnauthorizedError("Authentication required. Please log in."));
    return;
  }
  const session = authService.verifySessionToken(sessionToken);
  if (!session) {
    next(new UnauthorizedError("Session expired or invalid. Please log in."));
    return;
  }
  const user = await authService.getUserById(session.sub);
  if (!user) {
    next(new UnauthorizedError("User account no longer exists."));
    return;
  }
  req.user = user;
  next();
}

// server/validation/validate.ts
import { ZodError } from "zod";
function validateRequest(schema) {
  return async (req, res, next) => {
    try {
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
        return;
      }
      next(error);
    }
  };
}

// server/auth/auth.validation.ts
import { z as z2 } from "zod";
var RegisterRequestSchema = z2.object({
  email: z2.string({ required_error: "Email is required" }).email("Please provide a valid email address").max(255, "Email cannot exceed 255 characters").transform((val) => val.trim().toLowerCase()),
  password: z2.string({ required_error: "Password is required" }).min(8, "Password must be at least 8 characters long").max(128, "Password cannot exceed 128 characters")
});
var LoginRequestSchema = z2.object({
  email: z2.string({ required_error: "Email is required" }).email("Please provide a valid email address").max(255, "Email cannot exceed 255 characters").transform((val) => val.trim().toLowerCase()),
  password: z2.string({ required_error: "Password is required" }).min(1, "Password is required")
});

// server/routes/auth.ts
var authRouter = Router2();
function setSessionCookie(res, token) {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    maxAge: config.auth.sessionDurationSeconds * 1e3,
    path: "/"
  });
}
authRouter.post(
  "/register",
  validateRequest({ body: RegisterRequestSchema }),
  async (req, res, next) => {
    try {
      const user = await authService.registerUser(req.body);
      const sessionToken = authService.createSessionToken(user);
      setSessionCookie(res, sessionToken);
      return res.status(201).json({
        data: {
          user: {
            id: user.id,
            email: user.email
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);
authRouter.post(
  "/login",
  validateRequest({ body: LoginRequestSchema }),
  async (req, res, next) => {
    try {
      const user = await authService.loginUser(req.body);
      const sessionToken = authService.createSessionToken(user);
      setSessionCookie(res, sessionToken);
      return res.status(200).json({
        data: {
          user: {
            id: user.id,
            email: user.email
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);
authRouter.post("/logout", (req, res) => {
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/"
  });
  return res.status(200).json({
    data: {
      success: true
    }
  });
});
authRouter.get(
  "/me",
  requireAuthenticatedUser,
  (req, res) => {
    return res.status(200).json({
      data: {
        user: req.user
      }
    });
  }
);

// server/routes/gateway.ts
import { Router as Router3 } from "express";
import axios from "axios";
import crypto3 from "crypto";

// server/gateway/ssrf.ts
import dns from "dns";
function isPrivateOrLoopbackIPv4(ip) {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
function isPrivateOrLoopbackIPv6(hostname) {
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (clean === "::1" || clean === "::" || clean === "0:0:0:0:0:0:0:1" || clean === "0:0:0:0:0:0:0:0") return true;
  if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
  if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) return true;
  return false;
}
function validateTargetUrlSync(targetUrl) {
  if (!targetUrl || typeof targetUrl !== "string") {
    return { isValid: false, reason: "Target URL is missing or not a string." };
  }
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { isValid: false, reason: "Invalid target URL format." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isValid: false, reason: "Target URL must use HTTP or HTTPS protocol." };
  }
  const hostname = parsed.hostname.toLowerCase();
  const effectivePort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const serverPort = String(config.port);
  const isLocalEcho = (hostname === "localhost" || hostname === "127.0.0.1") && effectivePort === serverPort && (parsed.pathname === "/api/echo" || parsed.pathname.startsWith("/api/echo/"));
  if (isLocalEcho) {
    return { isValid: true };
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]" || hostname === "::1") {
    return { isValid: false, reason: "Target URL cannot target loopback or localhost." };
  }
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal" || hostname === "instance-data") {
    return { isValid: false, reason: "Target URL cannot target cloud metadata services." };
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateOrLoopbackIPv4(hostname)) {
      return {
        isValid: false,
        reason: "Target URL cannot point to private or internal network addresses (RFC 1918 / RFC 3927)."
      };
    }
  }
  if (hostname.includes(":")) {
    if (isPrivateOrLoopbackIPv6(hostname)) {
      return { isValid: false, reason: "Target URL cannot point to internal or loopback IPv6 addresses." };
    }
  }
  return { isValid: true };
}
async function validateTargetUrl(targetUrl) {
  const syncCheck = validateTargetUrlSync(targetUrl);
  if (!syncCheck.isValid) {
    return syncCheck;
  }
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { isValid: false, reason: "Invalid target URL format." };
  }
  const hostname = parsed.hostname.toLowerCase();
  const effectivePort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const serverPort = String(config.port);
  if ((hostname === "localhost" || hostname === "127.0.0.1") && effectivePort === serverPort && (parsed.pathname === "/api/echo" || parsed.pathname.startsWith("/api/echo/"))) {
    return { isValid: true };
  }
  try {
    const lookupResult = await dns.promises.lookup(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      return { isValid: false, reason: `No IP records resolved for target host '${hostname}'.` };
    }
    for (const record of lookupResult) {
      if (record.family === 4 && isPrivateOrLoopbackIPv4(record.address)) {
        return {
          isValid: false,
          reason: `Target destination hostname resolved to forbidden private/loopback IP address (${record.address}).`
        };
      }
      if (record.family === 6 && isPrivateOrLoopbackIPv6(record.address)) {
        return {
          isValid: false,
          reason: `Target destination hostname resolved to forbidden IPv6 address (${record.address}).`
        };
      }
    }
  } catch (err) {
    return {
      isValid: false,
      reason: `DNS resolution failed for target host '${hostname}': ${err.code || err.message || "Resolution error"}`
    };
  }
  return { isValid: true };
}
async function assertSafeTargetUrl(targetUrl) {
  const check = await validateTargetUrl(targetUrl);
  if (!check.isValid) {
    throw new BadRequestError(`Target URL rejected for security: ${check.reason}`);
  }
}

// server/apis/apis.service.ts
function formatApiRecord(api, metrics) {
  const windowSeconds = api.rateWindowSeconds || 60;
  return {
    id: api.id,
    userId: api.userId,
    name: api.name,
    slug: api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "api",
    description: api.description || "",
    targetUrl: api.targetUrl,
    pathPrefix: api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "api",
    rateLimit: api.rateLimit,
    rateWindowSeconds: windowSeconds,
    enabled: api.enabled,
    createdAt: api.createdAt instanceof Date ? api.createdAt.toISOString() : api.createdAt,
    updatedAt: api.updatedAt instanceof Date ? api.updatedAt.toISOString() : api.updatedAt,
    metrics
  };
}
var ApisService = class {
  /**
   * Lists all APIs owned by the authenticated user with aggregated metrics.
   */
  async listApis(userId) {
    const apis = await prisma.api.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        requestStats: {
          select: {
            latencyMs: true,
            blocked: true
          }
        }
      }
    });
    return apis.map((api) => {
      const stats = api.requestStats;
      const totalRequests = stats.length;
      const blockedRequests = stats.filter((s) => s.blocked).length;
      const validLatencies = stats.map((s) => s.latencyMs || 0);
      const avgLatency = totalRequests > 0 ? Math.round(validLatencies.reduce((acc, lat) => acc + lat, 0) / totalRequests) : 0;
      return formatApiRecord(api, {
        totalRequests,
        blockedRequests,
        avgLatency
      });
    });
  }
  /**
   * Retrieves a single API by ID with verified ownership and detailed metrics.
   */
  async getApiById(userId, apiId) {
    const api = await prisma.api.findUnique({
      where: { id: apiId },
      include: {
        requestStats: {
          select: {
            latencyMs: true,
            blocked: true
          }
        }
      }
    });
    if (!api || api.userId !== userId) {
      throw new NotFoundError("API not found");
    }
    const stats = api.requestStats;
    const totalRequests = stats.length;
    const blockedRequests = stats.filter((s) => s.blocked).length;
    const sortedLatencies = stats.map((s) => s.latencyMs || 0).sort((a, b) => a - b);
    const avgLatency = totalRequests > 0 ? Math.round(sortedLatencies.reduce((acc, lat) => acc + lat, 0) / totalRequests) : 0;
    const p95Latency = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;
    return formatApiRecord(api, {
      totalRequests,
      blockedRequests,
      avgLatency,
      p95Latency
    });
  }
  /**
   * Creates a new API protected under the user's account.
   * Awaits asynchronous SSRF target URL validation prior to database persistence.
   */
  async createApi(userId, input) {
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError("API name is required.");
    }
    if (!input.targetUrl || !input.targetUrl.trim()) {
      throw new BadRequestError("Target URL is required.");
    }
    await assertSafeTargetUrl(input.targetUrl.trim());
    const rateLimit = input.rateLimit && input.rateLimit > 0 ? input.rateLimit : 60;
    const rateWindowSeconds = input.rateWindowSeconds && input.rateWindowSeconds > 0 ? input.rateWindowSeconds : 60;
    const created = await prisma.api.create({
      data: {
        userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        targetUrl: input.targetUrl.trim(),
        enabled: input.enabled !== false,
        rateLimit,
        rateWindowSeconds
      }
    });
    return formatApiRecord(created, {
      totalRequests: 0,
      blockedRequests: 0,
      avgLatency: 0
    });
  }
  /**
   * Updates an existing API owned by the user.
   * Awaits asynchronous SSRF target URL validation prior to database update.
   */
  async updateApi(userId, apiId, input) {
    await this.getApiById(userId, apiId);
    if (input.targetUrl) {
      await assertSafeTargetUrl(input.targetUrl.trim());
    }
    const rateWindowSeconds = input.rateWindowSeconds && input.rateWindowSeconds > 0 ? input.rateWindowSeconds : void 0;
    const updated = await prisma.api.update({
      where: { id: apiId },
      data: {
        ...input.name !== void 0 ? { name: input.name.trim() } : {},
        ...input.description !== void 0 ? { description: input.description?.trim() || null } : {},
        ...input.targetUrl !== void 0 ? { targetUrl: input.targetUrl.trim() } : {},
        ...input.enabled !== void 0 ? { enabled: input.enabled } : {},
        ...input.rateLimit !== void 0 && input.rateLimit > 0 ? { rateLimit: input.rateLimit } : {},
        ...rateWindowSeconds !== void 0 ? { rateWindowSeconds } : {}
      }
    });
    return formatApiRecord(updated);
  }
  /**
   * Deletes an API owned by the user.
   */
  async deleteApi(userId, apiId) {
    await this.getApiById(userId, apiId);
    await prisma.api.delete({
      where: { id: apiId }
    });
    return true;
  }
  /**
   * Resolves an API for Gateway proxying without user ownership constraint.
   */
  async getApiForGateway(apiId) {
    return await prisma.api.findUnique({
      where: { id: apiId }
    });
  }
};
var apisService = new ApisService();

// server/api-keys/keys.service.ts
import crypto from "crypto";
var KeysService = class {
  /**
   * Hashes a raw API key secret using SHA-256 for secure database lookup.
   */
  hashKeySecret(secret) {
    return crypto.createHash("sha256").update(secret.trim()).digest("hex");
  }
  /**
   * Lists API keys belonging to the user's APIs.
   */
  async listKeys(userId, apiId) {
    const keys = await prisma.apiKey.findMany({
      where: {
        api: {
          userId,
          ...apiId && apiId !== "all" ? { id: apiId } : {}
        }
      },
      include: {
        api: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    return keys.map((k) => {
      const suffix = k.keyPrefix.length >= 4 ? k.keyPrefix.slice(-4) : "key";
      return {
        id: k.id,
        apiId: k.apiId,
        apiName: k.api.name,
        name: k.name,
        keyPrefix: k.keyPrefix,
        keySuffix: suffix,
        maskedKey: `${k.keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${suffix}`,
        status: k.revokedAt ? "revoked" : "active",
        createdAt: k.createdAt instanceof Date ? k.createdAt.toISOString() : k.createdAt,
        lastUsedAt: k.lastUsedAt instanceof Date ? k.lastUsedAt.toISOString() : k.lastUsedAt,
        revokedAt: k.revokedAt instanceof Date ? k.revokedAt.toISOString() : k.revokedAt
      };
    });
  }
  /**
   * Creates a new API key associated with exactly one API.
   * Generates a 32-byte secret, stores its SHA-256 hash, and returns the raw secret once.
   */
  async createKey(userId, apiId, name) {
    if (!name || !name.trim()) {
      throw new BadRequestError("Key name is required.");
    }
    if (!apiId || apiId === "all") {
      throw new BadRequestError("API key must be associated with a specific API service.");
    }
    const api = await prisma.api.findUnique({
      where: { id: apiId },
      select: { id: true, userId: true, name: true }
    });
    if (!api || api.userId !== userId) {
      throw new NotFoundError("Target API not found.");
    }
    const randomHex = crypto.randomBytes(24).toString("hex");
    const rawSecret = `sk_live_${randomHex}`;
    const keyPrefix = rawSecret.slice(0, 12);
    const keyHash = this.hashKeySecret(rawSecret);
    const suffix = rawSecret.slice(-4);
    const created = await prisma.apiKey.create({
      data: {
        apiId: api.id,
        name: name.trim(),
        keyPrefix,
        keyHash
      }
    });
    const keyRecord = {
      id: created.id,
      apiId: created.apiId,
      apiName: api.name,
      name: created.name,
      keyPrefix: created.keyPrefix,
      keySuffix: suffix,
      maskedKey: `${keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${suffix}`,
      status: "active",
      createdAt: created.createdAt.toISOString(),
      lastUsedAt: null,
      revokedAt: null
    };
    return {
      keyRecord,
      rawKeySecret: rawSecret
      // One-time reveal
    };
  }
  /**
   * Revokes an API key by setting revokedAt timestamp.
   */
  async revokeKey(userId, keyId) {
    const key = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: {
        api: { select: { id: true, userId: true, name: true } }
      }
    });
    if (!key || key.api.userId !== userId) {
      throw new NotFoundError("API key not found.");
    }
    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        revokedAt: /* @__PURE__ */ new Date()
      }
    });
    const suffix = updated.keyPrefix.length >= 4 ? updated.keyPrefix.slice(-4) : "key";
    return {
      id: updated.id,
      apiId: updated.apiId,
      apiName: key.api.name,
      name: updated.name,
      keyPrefix: updated.keyPrefix,
      keySuffix: suffix,
      maskedKey: `${updated.keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${suffix}`,
      status: "revoked",
      createdAt: updated.createdAt.toISOString(),
      lastUsedAt: updated.lastUsedAt ? updated.lastUsedAt.toISOString() : null,
      revokedAt: updated.revokedAt ? updated.revokedAt.toISOString() : null
    };
  }
  /**
   * Deletes an API key.
   */
  async deleteKey(userId, keyId) {
    const key = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: {
        api: { select: { userId: true } }
      }
    });
    if (!key || key.api.userId !== userId) {
      throw new NotFoundError("API key not found.");
    }
    await prisma.apiKey.delete({
      where: { id: keyId }
    });
    return true;
  }
  /**
   * Authenticates a raw API key secret against PostgreSQL for a specific API gateway request.
   * Differentiates between invalid/revoked keys and keys belonging to a different API.
   */
  async authenticateKeyForGateway(rawSecret, targetApiId) {
    if (!rawSecret || typeof rawSecret !== "string") {
      return { success: false, reason: "INVALID_OR_REVOKED" };
    }
    const keyHash = this.hashKeySecret(rawSecret);
    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        name: true,
        apiId: true,
        revokedAt: true
      }
    });
    if (!key || key.revokedAt !== null) {
      return { success: false, reason: "INVALID_OR_REVOKED" };
    }
    if (key.apiId !== targetApiId) {
      return {
        success: false,
        reason: "API_MISMATCH",
        keyId: key.id,
        targetApiId
      };
    }
    prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: /* @__PURE__ */ new Date() }
    }).catch(() => {
    });
    return {
      success: true,
      key: {
        id: key.id,
        name: key.name,
        apiId: key.apiId
      }
    };
  }
};
var keysService = new KeysService();

// server/analytics/analytics.service.ts
function getFilterTimeWindow(range, from, to) {
  const now = /* @__PURE__ */ new Date();
  if (from || to) {
    const start = from ? new Date(from) : new Date(now.getTime() - 24 * 3600 * 1e3);
    const end = to ? new Date(to) : now;
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestError("Invalid date format for from/to filter.");
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestError("'from' date must be earlier than or equal to 'to' date.");
    }
    return { start, end };
  }
  switch (range) {
    case "1h":
      return { start: new Date(now.getTime() - 3600 * 1e3), end: now };
    case "7d":
      return { start: new Date(now.getTime() - 7 * 24 * 3600 * 1e3), end: now };
    case "30d":
      return { start: new Date(now.getTime() - 30 * 24 * 3600 * 1e3), end: now };
    case "24h":
    default:
      return { start: new Date(now.getTime() - 24 * 3600 * 1e3), end: now };
  }
}
var AnalyticsService = class {
  /**
   * Persists a real request statistic record in PostgreSQL for live gateway traffic.
   * Non-blocking: logs safely on failure without breaking the client response.
   */
  async recordGatewayStat(data) {
    try {
      await prisma.requestStat.create({
        data: {
          apiId: data.apiId,
          apiKeyId: data.apiKeyId || null,
          endpoint: data.endpoint,
          method: data.method.toUpperCase(),
          statusCode: data.statusCode,
          latencyMs: data.latencyMs !== void 0 ? data.latencyMs : null,
          blocked: data.blocked || false
        }
      });
    } catch (err) {
      console.error("Failed to record gateway request statistic to database:", err);
    }
  }
  /**
   * Calculates high-level overview metrics from real RequestStat rows.
   */
  async getOverview(userId, apiId, range, from, to) {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);
    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...apiId && apiId !== "all" ? { id: apiId } : {}
        }
      },
      select: {
        apiId: true,
        statusCode: true,
        latencyMs: true,
        blocked: true,
        api: { select: { name: true } }
      }
    });
    const totalApisCount = await prisma.api.count({ where: { userId } });
    const activeApisCount = await prisma.api.count({ where: { userId, enabled: true } });
    const activeKeysCount = await prisma.apiKey.count({
      where: { api: { userId }, revokedAt: null }
    });
    const totalRequests = stats.length;
    const blockedRequests = stats.filter((s) => s.blocked).length;
    const allowedRequests = totalRequests - blockedRequests;
    const blockRate = totalRequests > 0 ? Number((blockedRequests / totalRequests * 100).toFixed(1)) : 0;
    const latencies = stats.map((s) => s.latencyMs || 0).sort((a, b) => a - b);
    const avgLatency = totalRequests > 0 ? Math.round(latencies.reduce((acc, lat) => acc + lat, 0) / totalRequests) : 0;
    const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const blockedMap = {};
    for (const s of stats) {
      if (s.blocked) {
        if (!blockedMap[s.apiId]) {
          blockedMap[s.apiId] = { apiId: s.apiId, apiName: s.api.name, blockedCount: 0 };
        }
        blockedMap[s.apiId].blockedCount++;
      }
    }
    const sortedBlocked = Object.values(blockedMap).sort((a, b) => b.blockedCount - a.blockedCount);
    const mostBlockedApi = sortedBlocked.length > 0 && sortedBlocked[0].blockedCount > 0 ? sortedBlocked[0] : null;
    return {
      totalRequests,
      blockedRequests,
      allowedRequests,
      blockRate,
      activeApisCount,
      totalApisCount,
      activeKeysCount,
      avgLatency,
      p95Latency,
      mostBlockedApi
    };
  }
  /**
   * Generates time-bucketed request statistics from real RequestStat records.
   */
  async getTimeseries(userId, range = "24h", apiId, traffic, from, to) {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);
    const windowStartMs = windowStart.getTime();
    const windowEndMs = windowEnd.getTime();
    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...apiId && apiId !== "all" ? { id: apiId } : {}
        },
        ...traffic === "allowed" ? { blocked: false } : {},
        ...traffic === "blocked" ? { blocked: true } : {}
      },
      select: {
        createdAt: true,
        latencyMs: true,
        blocked: true
      }
    });
    let bucketCount = 24;
    let bucketDurationMs = (windowEndMs - windowStartMs) / bucketCount;
    if (range === "1h") {
      bucketCount = 12;
      bucketDurationMs = 5 * 60 * 1e3;
    } else if (range === "7d") {
      bucketCount = 14;
      bucketDurationMs = 12 * 3600 * 1e3;
    } else if (range === "30d") {
      bucketCount = 30;
      bucketDurationMs = 24 * 3600 * 1e3;
    }
    const buckets = [];
    for (let i = 0; i < bucketCount; i++) {
      const bStart = windowStartMs + i * bucketDurationMs;
      const bEnd = bStart + bucketDurationMs;
      const bucketDate = new Date(bEnd);
      let label = "";
      if (range === "1h" || range === "24h") {
        label = bucketDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else {
        label = bucketDate.toLocaleDateString([], { month: "short", day: "numeric" });
      }
      const bucketStats = stats.filter((s) => {
        const t = s.createdAt.getTime();
        return t >= bStart && t < bEnd;
      });
      const requests = bucketStats.length;
      const blocked = bucketStats.filter((s) => s.blocked).length;
      const allowed = requests - blocked;
      const latencies = bucketStats.map((s) => s.latencyMs || 0).sort((a, b) => a - b);
      const avgLatency = requests > 0 ? Math.round(latencies.reduce((acc, l) => acc + l, 0) / requests) : 0;
      const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : avgLatency;
      buckets.push({
        timestamp: new Date(bEnd).toISOString(),
        label,
        requests,
        allowed,
        blocked,
        avgLatency,
        p95Latency
      });
    }
    return buckets;
  }
  /**
   * Aggregates real endpoint access frequencies and error rates.
   */
  async getTopEndpoints(userId, range, apiId, from, to) {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);
    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...apiId && apiId !== "all" ? { id: apiId } : {}
        }
      },
      select: {
        endpoint: true,
        method: true,
        statusCode: true,
        latencyMs: true,
        blocked: true
      }
    });
    const totalLogs = stats.length;
    const endpointMap = {};
    for (const s of stats) {
      const key = `${s.method} ${s.endpoint}`;
      if (!endpointMap[key]) {
        endpointMap[key] = {
          method: s.method,
          path: s.endpoint,
          requests: 0,
          totalLatency: 0,
          errorCount: 0,
          blockedCount: 0
        };
      }
      endpointMap[key].requests++;
      endpointMap[key].totalLatency += s.latencyMs || 0;
      if (s.statusCode >= 400) {
        endpointMap[key].errorCount++;
      }
      if (s.blocked) {
        endpointMap[key].blockedCount++;
      }
    }
    return Object.values(endpointMap).sort((a, b) => b.requests - a.requests).slice(0, 10).map((e) => ({
      method: e.method,
      path: e.path,
      requests: e.requests,
      percentage: totalLogs > 0 ? Number((e.requests / totalLogs * 100).toFixed(1)) : 0,
      avgLatency: Math.round(e.totalLatency / e.requests),
      errorCount: e.errorCount,
      blockedCount: e.blockedCount
    }));
  }
  /**
   * Computes status code distribution from authentic RequestStat rows.
   */
  async getStatusCodes(userId, range, apiId, from, to) {
    const { start: windowStart, end: windowEnd } = getFilterTimeWindow(range, from, to);
    const stats = await prisma.requestStat.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        api: {
          userId,
          ...apiId && apiId !== "all" ? { id: apiId } : {}
        }
      },
      select: {
        statusCode: true
      }
    });
    const total = stats.length;
    let c2xx = 0;
    let c429 = 0;
    let c4xx = 0;
    let c5xx = 0;
    for (const s of stats) {
      if (s.statusCode === 429) {
        c429++;
      } else if (s.statusCode >= 200 && s.statusCode < 300) {
        c2xx++;
      } else if (s.statusCode >= 400 && s.statusCode < 500) {
        c4xx++;
      } else if (s.statusCode >= 500) {
        c5xx++;
      }
    }
    return [
      { codeGroup: "2xx Success", count: c2xx, percentage: total > 0 ? Number((c2xx / total * 100).toFixed(1)) : 0 },
      { codeGroup: "429 Rate Limited", count: c429, percentage: total > 0 ? Number((c429 / total * 100).toFixed(1)) : 0 },
      { codeGroup: "4xx Client Errors", count: c4xx, percentage: total > 0 ? Number((c4xx / total * 100).toFixed(1)) : 0 },
      { codeGroup: "5xx Server Errors", count: c5xx, percentage: total > 0 ? Number((c5xx / total * 100).toFixed(1)) : 0 }
    ];
  }
  /**
   * Queries real RequestStat rows with pagination and authentic metadata.
   * Zero synthetic / fabricated fields.
   */
  async getLogs(userId, options) {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;
    const whereClause = {
      api: {
        userId,
        ...options.apiId && options.apiId !== "all" ? { id: options.apiId } : {}
      }
    };
    if (options.from || options.to) {
      const { start, end } = getFilterTimeWindow(void 0, options.from, options.to);
      whereClause.createdAt = { gte: start, lte: end };
    }
    if (options.traffic === "allowed") {
      whereClause.blocked = false;
    } else if (options.traffic === "blocked") {
      whereClause.blocked = true;
    }
    if (options.status) {
      if (options.status.startsWith("2")) whereClause.statusCode = { gte: 200, lt: 300 };
      else if (options.status.startsWith("4") && options.status !== "429") whereClause.statusCode = { gte: 400, lt: 500, not: 429 };
      else if (options.status === "429") whereClause.statusCode = 429;
      else if (options.status.startsWith("5")) whereClause.statusCode = { gte: 500, lt: 600 };
    }
    const [stats, total] = await Promise.all([
      prisma.requestStat.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          api: { select: { id: true, name: true, rateLimit: true } },
          apiKey: { select: { id: true, name: true } }
        }
      }),
      prisma.requestStat.count({ where: whereClause })
    ]);
    const formattedLogs = stats.map((s) => ({
      id: s.id,
      apiId: s.apiId,
      apiName: s.api.name,
      method: s.method,
      path: s.endpoint,
      targetPath: s.endpoint,
      statusCode: s.statusCode,
      latencyMs: s.latencyMs || 0,
      timestamp: s.createdAt.toISOString(),
      keyId: s.apiKeyId,
      keyName: s.apiKey?.name || null,
      isBlocked: s.blocked,
      blockedReason: s.blocked ? s.statusCode === 429 ? "RATE_LIMIT_EXCEEDED" : "UNAUTHORIZED" : null,
      rateLimitTotal: s.api.rateLimit
    }));
    return {
      logs: formattedLogs,
      total
    };
  }
};
var analyticsService = new AnalyticsService();

// server/rate-limit/rateLimiter.service.ts
import fs from "fs";
import path2 from "path";
import { fileURLToPath } from "url";
import crypto2 from "crypto";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var luaScriptPath = path2.resolve(__dirname, "sliding-window.lua");
var luaScript = "";
try {
  if (fs.existsSync(luaScriptPath)) {
    luaScript = fs.readFileSync(luaScriptPath, "utf8");
  }
} catch {
}
if (!luaScript) {
  luaScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])
local member_suffix = tostring(ARGV[3])

local time_arr = redis.call('TIME')
local now_sec = tonumber(time_arr[1])
local now_usec = tonumber(time_arr[2])
local now_ms = (now_sec * 1000) + math.floor(now_usec / 1000)

local window_ms = window_seconds * 1000
local window_start_ms = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start_ms)
local current_count = redis.call('ZCARD', key)

if current_count < limit then
    local member = tostring(now_ms) .. ':' .. member_suffix
    redis.call('ZADD', key, now_ms, member)
    redis.call('EXPIRE', key, window_seconds + 60)

    local remaining = limit - current_count - 1
    if remaining < 0 then remaining = 0 end
    local reset_at_sec = math.ceil((now_ms + window_ms) / 1000)
    return {1, limit, remaining, reset_at_sec, 0}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldest_ts = now_ms
    if oldest and #oldest >= 2 then
        oldest_ts = tonumber(oldest[2])
    end
    local reset_at_ms = oldest_ts + window_ms
    local retry_after_sec = math.max(1, math.ceil((reset_at_ms - now_ms) / 1000))
    local reset_at_sec = math.ceil(reset_at_ms / 1000)
    return {0, limit, 0, reset_at_sec, retry_after_sec}
end
`;
}
var RateLimiterService = class {
  /**
   * Constructs the deterministic Redis key scoped to API and API key ID.
   */
  getRateLimitKey(apiId, apiKeyId) {
    return `ratelimit:${apiId}:${apiKeyId}`;
  }
  /**
   * Evaluates the atomic sliding-window rate limit inside Redis via Lua.
   * Enforces fail-closed policy: throws 503 ServiceUnavailableError if Redis is down.
   */
  async checkRateLimit(input) {
    const { apiId, apiKeyId, limit, windowSeconds } = input;
    if (!apiId || !apiKeyId) {
      throw new BadRequestError("apiId and apiKeyId are required for rate limit evaluation.");
    }
    if (limit <= 0) {
      throw new BadRequestError("Rate limit must be greater than zero.");
    }
    if (windowSeconds <= 0) {
      throw new BadRequestError("Rate window seconds must be greater than zero.");
    }
    const key = this.getRateLimitKey(apiId, apiKeyId);
    const memberSuffix = input.requestId || crypto2.randomBytes(6).toString("hex");
    try {
      if (redis.status === "wait") {
        await redis.connect();
      }
      const result = await redis.eval(
        luaScript,
        1,
        key,
        limit.toString(),
        windowSeconds.toString(),
        memberSuffix
      );
      const [allowedNum, limitNum, remainingNum, resetAtNum, retryAfterNum] = result;
      return {
        allowed: allowedNum === 1,
        limit: Number(limitNum),
        remaining: Math.max(0, Number(remainingNum)),
        resetAt: Number(resetAtNum),
        retryAfter: Number(retryAfterNum)
      };
    } catch (err) {
      console.error("RateLimiter Redis failure (fail-closed activated):", err.message);
      throw new ServiceUnavailableError(
        "Rate limiting is temporarily unavailable. Upstream request was blocked for security."
      );
    }
  }
  /**
   * Helper to reset a specific rate-limit key (used for test isolation).
   */
  async resetKey(apiId, apiKeyId) {
    try {
      const key = this.getRateLimitKey(apiId, apiKeyId);
      await redis.del(key);
    } catch {
    }
  }
};
var rateLimiterService = new RateLimiterService();

// server/routes/gateway.ts
var gatewayRouter = Router3();
gatewayRouter.all("/:apiId*", async (req, res, next) => {
  const startTime = Date.now();
  const apiIdParam = String(req.params.apiId);
  const subpath = req.params[0] ? String(req.params[0]) : "";
  const requestId = req.headers["x-request-id"] || `req_${crypto3.randomBytes(8).toString("hex")}`;
  res.setHeader("X-Request-ID", requestId);
  try {
    const api = await apisService.getApiForGateway(apiIdParam);
    if (!api) {
      return res.status(404).json({
        error: {
          code: "API_NOT_FOUND",
          message: `API with identifier '${apiIdParam}' is not configured in APIShield.`,
          statusCode: 404,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    const endpointPath = subpath ? subpath.startsWith("/") ? subpath : `/${subpath}` : "/";
    if (!api.enabled) {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 403,
        latencyMs: latency,
        blocked: true
      });
      console.log(`[${requestId}] GATEWAY BLOCKED: API '${api.name}' is disabled (403)`);
      return res.status(403).json({
        error: {
          code: "API_DISABLED",
          message: `API '${api.name}' is currently disabled in APIShield.`,
          statusCode: 403,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    const apiKeyHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
    if (!apiKeyHeader) {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 401,
        latencyMs: latency,
        blocked: true
      });
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing required API key. Provide a valid key via the X-API-Key header.",
          statusCode: 401,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    const authResult = await keysService.authenticateKeyForGateway(apiKeyHeader, api.id);
    if (!authResult.success && authResult.reason === "INVALID_OR_REVOKED") {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 401,
        latencyMs: latency,
        blocked: true
      });
      return res.status(401).json({
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid API key or key has been revoked.",
          statusCode: 401,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    if (!authResult.success && authResult.reason === "API_MISMATCH") {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: authResult.keyId,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 403,
        latencyMs: latency,
        blocked: true
      });
      console.log(`[${requestId}] FORBIDDEN: Key is bound to a different API (403)`);
      return res.status(403).json({
        error: {
          code: "FORBIDDEN_KEY_API_MISMATCH",
          message: "API key is not authorized for this specific API service.",
          statusCode: 403,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    const matchedKey = authResult.key;
    let rateCheck;
    try {
      rateCheck = await rateLimiterService.checkRateLimit({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        limit: api.rateLimit,
        windowSeconds: api.rateWindowSeconds || 60,
        requestId
      });
    } catch {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 503,
        latencyMs: latency,
        blocked: true
      });
      return res.status(503).json({
        error: {
          code: "RATE_LIMITER_UNAVAILABLE",
          message: "Rate limiting engine is temporarily unavailable. Request blocked for security.",
          statusCode: 503,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    res.setHeader("X-RateLimit-Limit", rateCheck.limit.toString());
    res.setHeader("X-RateLimit-Remaining", rateCheck.remaining.toString());
    res.setHeader("X-RateLimit-Reset", rateCheck.resetAt.toString());
    res.setHeader("X-APIShield-Gateway", "v1.0-production");
    if (!rateCheck.allowed) {
      const latency = Date.now() - startTime;
      res.setHeader("Retry-After", rateCheck.retryAfter.toString());
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 429,
        latencyMs: latency,
        blocked: true
      });
      console.log(`[${requestId}] RATE LIMIT EXCEEDED: key=${matchedKey.name} api=${api.name} (429)`);
      return res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Too Many Requests. Rate limit of ${api.rateLimit} requests per ${api.rateWindowSeconds || 60} seconds exceeded.`,
          statusCode: 429,
          rateLimit: api.rateLimit,
          retryAfterSeconds: rateCheck.retryAfter,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    const ssrfCheck = await validateTargetUrl(api.targetUrl);
    if (!ssrfCheck.isValid) {
      const latency = Date.now() - startTime;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: 400,
        latencyMs: latency,
        blocked: true
      });
      return res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: `Gateway rejected target request for security: ${ssrfCheck.reason}`,
          statusCode: 400,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    const baseClean = api.targetUrl.replace(/\/+$/, "");
    const pathClean = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
    const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
    const destinationUrl = `${baseClean}${pathClean}${queryString}`;
    const forwardHeaders = {};
    const ignoredHeaders = [
      "host",
      "connection",
      "content-length",
      "x-api-key",
      "authorization",
      "cookie"
    ];
    for (const [headerKey, headerVal] of Object.entries(req.headers)) {
      if (!ignoredHeaders.includes(headerKey.toLowerCase()) && typeof headerVal === "string") {
        forwardHeaders[headerKey] = headerVal;
      }
    }
    forwardHeaders["x-forwarded-proto"] = req.protocol;
    forwardHeaders["x-request-id"] = requestId;
    const axiosConfig = {
      method: req.method,
      url: destinationUrl,
      headers: forwardHeaders,
      data: ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase()) ? req.body : void 0,
      timeout: 15e3,
      validateStatus: () => true,
      // capture all status codes
      responseType: "json"
    };
    try {
      const upstreamResponse = await axios(axiosConfig);
      const latency = Date.now() - startTime;
      res.setHeader("X-Gateway-Latency-Ms", latency.toString());
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode: upstreamResponse.status,
        latencyMs: latency,
        blocked: false
      });
      console.log(
        `[${requestId}] ${req.method} ${api.name} ${endpointPath} -> ${upstreamResponse.status} (${latency}ms)`
      );
      return res.status(upstreamResponse.status).json(upstreamResponse.data);
    } catch (err) {
      const latency = Date.now() - startTime;
      const isTimeout = err.code === "ECONNABORTED";
      const statusCode = isTimeout ? 504 : 502;
      await analyticsService.recordGatewayStat({
        apiId: api.id,
        apiKeyId: matchedKey.id,
        endpoint: endpointPath,
        method: req.method,
        statusCode,
        latencyMs: latency,
        blocked: false
      });
      console.error(
        `[${requestId}] UPSTREAM ERROR: ${req.method} ${api.name} ${endpointPath} -> ${statusCode} (${err.message})`
      );
      return res.status(statusCode).json({
        error: {
          code: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
          message: isTimeout ? "The target API timed out after 15 seconds." : "The target API could not be reached. Please verify upstream server availability.",
          statusCode,
          requestId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
  } catch (err) {
    next(err);
  }
});

// server/routes/apis.ts
import { Router as Router4 } from "express";
var apisRouter = Router4();
apisRouter.use(requireAuthenticatedUser);
apisRouter.get("/", async (req, res, next) => {
  try {
    const apis = await apisService.listApis(req.user.id);
    return res.json({ data: apis });
  } catch (err) {
    next(err);
  }
});
apisRouter.get("/:id", async (req, res, next) => {
  try {
    const api = await apisService.getApiById(req.user.id, String(req.params.id));
    return res.json({ data: api });
  } catch (err) {
    next(err);
  }
});
apisRouter.get("/:id/stats", async (req, res, next) => {
  try {
    const apiId = String(req.params.id);
    const range = req.query.range || "24h";
    const api = await apisService.getApiById(req.user.id, apiId);
    const [overview, timeseries, endpoints, statusCodes] = await Promise.all([
      analyticsService.getOverview(req.user.id, apiId, range),
      analyticsService.getTimeseries(req.user.id, range, apiId),
      analyticsService.getTopEndpoints(req.user.id, range, apiId),
      analyticsService.getStatusCodes(req.user.id, range, apiId)
    ]);
    return res.json({
      data: {
        apiId: api.id,
        apiName: api.name,
        overview,
        timeseries,
        endpoints,
        statusCodes
      }
    });
  } catch (err) {
    next(err);
  }
});
apisRouter.get("/:id/keys", async (req, res, next) => {
  try {
    const apiId = String(req.params.id);
    await apisService.getApiById(req.user.id, apiId);
    const keys = await keysService.listKeys(req.user.id, apiId);
    return res.json({ data: keys });
  } catch (err) {
    next(err);
  }
});
apisRouter.post("/:id/keys", async (req, res, next) => {
  try {
    const apiId = String(req.params.id);
    const { name } = req.body;
    const { keyRecord, rawKeySecret } = await keysService.createKey(req.user.id, apiId, name);
    return res.status(201).json({
      data: {
        ...keyRecord,
        secretKey: rawKeySecret
      }
    });
  } catch (err) {
    next(err);
  }
});
apisRouter.post("/", async (req, res, next) => {
  try {
    const newApi = await apisService.createApi(req.user.id, req.body);
    return res.status(201).json({ data: newApi });
  } catch (err) {
    next(err);
  }
});
apisRouter.put("/:id", async (req, res, next) => {
  try {
    const updated = await apisService.updateApi(req.user.id, String(req.params.id), req.body);
    return res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
apisRouter.delete("/:id", async (req, res, next) => {
  try {
    await apisService.deleteApi(req.user.id, String(req.params.id));
    return res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// server/routes/keys.ts
import { Router as Router5 } from "express";
var keysRouter = Router5();
keysRouter.use(requireAuthenticatedUser);
keysRouter.get("/", async (req, res, next) => {
  try {
    const apiId = req.query.apiId;
    const keys = await keysService.listKeys(req.user.id, apiId);
    return res.json({ data: keys });
  } catch (err) {
    next(err);
  }
});
keysRouter.post("/", async (req, res, next) => {
  try {
    const { name, apiId } = req.body;
    const { keyRecord, rawKeySecret } = await keysService.createKey(req.user.id, apiId, name);
    return res.status(201).json({
      data: {
        ...keyRecord,
        secretKey: rawKeySecret
        // One-time secret
      }
    });
  } catch (err) {
    next(err);
  }
});
keysRouter.post("/:id/revoke", async (req, res, next) => {
  try {
    const revoked = await keysService.revokeKey(req.user.id, String(req.params.id));
    return res.json({ data: revoked });
  } catch (err) {
    next(err);
  }
});
keysRouter.delete("/:id", async (req, res, next) => {
  try {
    await keysService.deleteKey(req.user.id, String(req.params.id));
    return res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// server/routes/analytics.ts
import { Router as Router6 } from "express";
var analyticsRouter = Router6();
analyticsRouter.use(requireAuthenticatedUser);
analyticsRouter.get("/", async (req, res, next) => {
  try {
    const apiId = req.query.apiId;
    const range = req.query.range;
    const from = req.query.from;
    const to = req.query.to;
    const [overview, timeseries, endpoints, statusCodes] = await Promise.all([
      analyticsService.getOverview(req.user.id, apiId, range, from, to),
      analyticsService.getTimeseries(req.user.id, range, apiId, void 0, from, to),
      analyticsService.getTopEndpoints(req.user.id, range, apiId, from, to),
      analyticsService.getStatusCodes(req.user.id, range, apiId, from, to)
    ]);
    return res.json({
      data: {
        summary: overview,
        timeseries,
        topEndpoints: endpoints,
        statusCodes
      }
    });
  } catch (err) {
    next(err);
  }
});
analyticsRouter.get("/overview", async (req, res, next) => {
  try {
    const apiId = req.query.apiId;
    const range = req.query.range;
    const from = req.query.from;
    const to = req.query.to;
    const overview = await analyticsService.getOverview(req.user.id, apiId, range, from, to);
    return res.json({ data: overview });
  } catch (err) {
    next(err);
  }
});
analyticsRouter.get("/timeseries", async (req, res, next) => {
  try {
    const range = req.query.range || "24h";
    const apiId = req.query.apiId;
    const traffic = req.query.traffic;
    const from = req.query.from;
    const to = req.query.to;
    const buckets = await analyticsService.getTimeseries(req.user.id, range, apiId, traffic, from, to);
    return res.json({ data: buckets });
  } catch (err) {
    next(err);
  }
});
analyticsRouter.get("/endpoints", async (req, res, next) => {
  try {
    const apiId = req.query.apiId;
    const range = req.query.range;
    const from = req.query.from;
    const to = req.query.to;
    const endpoints = await analyticsService.getTopEndpoints(req.user.id, range, apiId, from, to);
    return res.json({ data: endpoints });
  } catch (err) {
    next(err);
  }
});
analyticsRouter.get("/status-codes", async (req, res, next) => {
  try {
    const apiId = req.query.apiId;
    const range = req.query.range;
    const from = req.query.from;
    const to = req.query.to;
    const distribution = await analyticsService.getStatusCodes(req.user.id, range, apiId, from, to);
    return res.json({ data: distribution });
  } catch (err) {
    next(err);
  }
});
analyticsRouter.get("/logs", async (req, res, next) => {
  try {
    const apiId = req.query.apiId;
    const traffic = req.query.traffic;
    const status = req.query.status;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const from = req.query.from;
    const to = req.query.to;
    const result = await analyticsService.getLogs(req.user.id, {
      apiId,
      traffic,
      status,
      limit,
      offset,
      from,
      to
    });
    return res.json({
      data: result.logs,
      pagination: {
        total: result.total,
        limit,
        offset
      }
    });
  } catch (err) {
    next(err);
  }
});

// server/routes/system.ts
import { Router as Router7 } from "express";
var systemRouter = Router7();
var serverStartTime = Date.now();
var currentSettings = {
  gatewayBaseUrl: "http://localhost:3001",
  defaultRateLimit: 60,
  defaultRateWindowSeconds: 60,
  requestTimeoutMs: 15e3,
  logsRetentionDays: 30,
  corsAllowedOrigins: "http://localhost:5173"
};
systemRouter.get("/health", (req, res) => {
  return res.json({
    status: "healthy",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    service: "APIShield Gateway Engine"
  });
});
systemRouter.get("/system", async (req, res) => {
  const memory = process.memoryUsage();
  let logsCount = 0;
  try {
    logsCount = await prisma.requestStat.count();
  } catch {
  }
  const info = {
    version: "1.2.0-core",
    nodeVersion: process.version,
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1e3),
    status: "healthy",
    gatewayActive: true,
    totalLogsStored: logsCount,
    memoryUsageMb: Math.round(memory.heapUsed / 1024 / 1024),
    storageEngine: "PostgreSQL Database Engine"
  };
  return res.json({ data: info });
});
systemRouter.get("/settings", (req, res) => {
  return res.json({ data: currentSettings });
});
systemRouter.post("/settings", (req, res) => {
  currentSettings = { ...currentSettings, ...req.body };
  return res.json({ data: currentSettings, message: "Settings saved successfully" });
});

// server/routes/echo.ts
import { Router as Router8 } from "express";
var echoRouter = Router8();
var echoRequestCount = 0;
echoRouter.use((req, res, next) => {
  if (!req.path.startsWith("/_counter")) {
    echoRequestCount++;
  }
  next();
});
if (!config.isProduction) {
  echoRouter.get("/_counter", (req, res) => {
    return res.json({ count: echoRequestCount });
  });
  echoRouter.post("/_counter/reset", (req, res) => {
    echoRequestCount = 0;
    return res.json({ count: 0, reset: true });
  });
}
echoRouter.get("/users", (req, res) => {
  return res.json([
    { id: 1, name: "Leanne Graham", email: "sincere@april.biz", company: { name: "Romaguera-Crona" } },
    { id: 2, name: "Ervin Howell", email: "shanna@melissa.tv", company: { name: "Deckow-Crist" } },
    { id: 3, name: "Clementine Bauch", email: "nathan@yesenia.net", company: { name: "Romaguera-Jacobson" } }
  ]);
});
echoRouter.get("/users/:id", (req, res) => {
  const userId = parseInt(String(req.params.id), 10) || 1;
  return res.json({
    id: userId,
    name: "Leanne Graham",
    username: "Bret",
    email: "sincere@april.biz",
    phone: "1-770-736-8031 x56442",
    website: "hildegard.org"
  });
});
echoRouter.post("/users", (req, res) => {
  return res.status(201).json({
    id: 101,
    ...req.body,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
});
echoRouter.put("/users/:id", (req, res) => {
  return res.json({
    id: parseInt(String(req.params.id), 10) || 1,
    ...req.body,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
});
echoRouter.patch("/users/:id", (req, res) => {
  return res.json({
    id: parseInt(String(req.params.id), 10) || 1,
    ...req.body,
    patchedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
});
echoRouter.delete("/users/:id", (req, res) => {
  return res.json({
    success: true,
    deletedId: req.params.id,
    message: "Resource successfully deleted."
  });
});
echoRouter.all("*", (req, res) => {
  return res.json({
    service: "APIShield Local Echo Target",
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      "content-type": req.headers["content-type"],
      "x-request-id": req.headers["x-request-id"],
      "x-forwarded-for": req.headers["x-forwarded-for"]
    },
    body: req.body,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});

// server/errors/errorHandler.ts
import { ZodError as ZodError2 } from "zod";
import { Prisma } from "@prisma/client";
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `The endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
      statusCode: 404
    }
  });
}
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        ...err.details ? { details: err.details } : {}
      }
    });
    return;
  }
  if (err instanceof ZodError2) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message
    }));
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload or parameters",
        statusCode: 400,
        details: formattedErrors
      }
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "An account or resource with this email or identifier already exists.",
          statusCode: 409
        }
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested record was not found in database.",
          statusCode: 404
        }
      });
      return;
    }
    if (err.code.startsWith("P1")) {
      console.error("Database Connection Error (Prisma P1xxx):", err.code, err.message);
      res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Unable to connect to database. Please verify DATABASE_URL environment variable in Vercel settings.",
          statusCode: 503
        }
      });
      return;
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError || err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientRustPanicError) {
    console.error("Database Connection Error (PostgreSQL unavailable):", err.message);
    res.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database service is currently unreachable. Please ensure PostgreSQL is running and DATABASE_URL is properly configured.",
        statusCode: 503
      }
    });
    return;
  }
  console.error("Unhandled Internal Server Error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal error occurred. Please try again later.",
      statusCode: 500
    }
  });
}

// server/index.ts
var app = express();
var allowedOrigins = config.isProduction ? [process.env.CORS_ORIGIN || "http://localhost:5173"] : [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  `http://localhost:${config.port}`,
  `http://127.0.0.1:${config.port}`
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (origin.endsWith(".vercel.app") || process.env.VERCEL_URL && origin.includes(process.env.VERCEL_URL) || process.env.VERCEL_PROJECT_PRODUCTION_URL && origin.includes(process.env.VERCEL_PROJECT_PRODUCTION_URL)) {
        return callback(null, true);
      }
      callback(new Error(`Origin '${origin}' not permitted by CORS policy`));
    },
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/echo", echoRouter);
app.use("/api/gateway", gatewayRouter);
app.use("/api/apis", apisRouter);
app.use("/api/keys", keysRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api", systemRouter);
app.use(notFoundHandler);
app.use(errorHandler);
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    console.log(`
\u{1F6E1}\uFE0F  APIShield Backend running in [${config.env}] mode`);
    console.log(`\u{1F4E1} Listening on: http://localhost:${config.port}`);
    console.log(`\u{1F511} Auth Endpoints: http://localhost:${config.port}/api/auth/register, /login, /logout, /me`);
    console.log(`\u{1FA7A} Health Check: http://localhost:${config.port}/api/health`);
    console.log(`\u26A1 Gateway Router: http://localhost:${config.port}/api/gateway/:apiId/*`);
    console.log(`\u{1F3AF} Local Echo Target: http://localhost:${config.port}/api/echo/*`);
    console.log(`\u{1F4CA} Management APIs: http://localhost:${config.port}/api/apis, /api/keys, /api/analytics
`);
  });
  const shutdown = async (signal) => {
    console.log(`
Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await Promise.all([
          disconnectDatabase(),
          disconnectRedis()
        ]);
        console.log("Database and Redis connections closed.");
      } catch (err) {
        console.error("Error during disconnect:", err);
      }
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
var server_default = app;

// api/index.ts
var index_default = server_default;
export {
  index_default as default
};
