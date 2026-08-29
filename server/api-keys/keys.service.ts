import crypto from 'crypto';
import { prisma } from '../database/prisma';
import { NotFoundError, BadRequestError } from '../errors/AppError';

export interface SafeApiKey {
  id: string;
  apiId: string;
  apiName: string;
  name: string;
  keyPrefix: string;
  keySuffix: string;
  maskedKey: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type KeyAuthResult =
  | { success: true; key: { id: string; name: string; apiId: string } }
  | { success: false; reason: 'INVALID_OR_REVOKED' }
  | { success: false; reason: 'API_MISMATCH'; keyId: string; targetApiId: string };

export class KeysService {
  /**
   * Hashes a raw API key secret using SHA-256 for secure database lookup.
   */
  public hashKeySecret(secret: string): string {
    return crypto.createHash('sha256').update(secret.trim()).digest('hex');
  }

  /**
   * Lists API keys belonging to the user's APIs.
   */
  public async listKeys(userId: string, apiId?: string): Promise<SafeApiKey[]> {
    const keys = await prisma.apiKey.findMany({
      where: {
        api: {
          userId,
          ...(apiId && apiId !== 'all' ? { id: apiId } : {}),
        },
      },
      include: {
        api: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => {
      const suffix = k.keyPrefix.length >= 4 ? k.keyPrefix.slice(-4) : 'key';
      return {
        id: k.id,
        apiId: k.apiId,
        apiName: k.api.name,
        name: k.name,
        keyPrefix: k.keyPrefix,
        keySuffix: suffix,
        maskedKey: `${k.keyPrefix}••••••••${suffix}`,
        status: k.revokedAt ? 'revoked' : 'active',
        createdAt: k.createdAt instanceof Date ? k.createdAt.toISOString() : k.createdAt,
        lastUsedAt: k.lastUsedAt instanceof Date ? k.lastUsedAt.toISOString() : k.lastUsedAt,
        revokedAt: k.revokedAt instanceof Date ? k.revokedAt.toISOString() : k.revokedAt,
      };
    });
  }

  /**
   * Creates a new API key associated with exactly one API.
   * Generates a 32-byte secret, stores its SHA-256 hash, and returns the raw secret once.
   */
  public async createKey(
    userId: string,
    apiId: string,
    name: string
  ): Promise<{ keyRecord: SafeApiKey; rawKeySecret: string }> {
    if (!name || !name.trim()) {
      throw new BadRequestError('Key name is required.');
    }
    if (!apiId || apiId === 'all') {
      throw new BadRequestError('API key must be associated with a specific API service.');
    }

    // Verify user owns the target API
    const api = await prisma.api.findUnique({
      where: { id: apiId },
      select: { id: true, userId: true, name: true },
    });

    if (!api || api.userId !== userId) {
      throw new NotFoundError('Target API not found.');
    }

    // Generate random secret: sk_live_<48 hex chars>
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawSecret = `sk_live_${randomHex}`;
    const keyPrefix = rawSecret.slice(0, 12);
    const keyHash = this.hashKeySecret(rawSecret);
    const suffix = rawSecret.slice(-4);

    const created = await prisma.apiKey.create({
      data: {
        apiId: api.id,
        name: name.trim(),
        keyPrefix,
        keyHash,
      },
    });

    const keyRecord: SafeApiKey = {
      id: created.id,
      apiId: created.apiId,
      apiName: api.name,
      name: created.name,
      keyPrefix: created.keyPrefix,
      keySuffix: suffix,
      maskedKey: `${keyPrefix}••••••••${suffix}`,
      status: 'active',
      createdAt: created.createdAt.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };

    return {
      keyRecord,
      rawKeySecret: rawSecret, // One-time reveal
    };
  }

  /**
   * Revokes an API key by setting revokedAt timestamp.
   */
  public async revokeKey(userId: string, keyId: string): Promise<SafeApiKey> {
    const key = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: {
        api: { select: { id: true, userId: true, name: true } },
      },
    });

    if (!key || key.api.userId !== userId) {
      throw new NotFoundError('API key not found.');
    }

    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        revokedAt: new Date(),
      },
    });

    const suffix = updated.keyPrefix.length >= 4 ? updated.keyPrefix.slice(-4) : 'key';
    return {
      id: updated.id,
      apiId: updated.apiId,
      apiName: key.api.name,
      name: updated.name,
      keyPrefix: updated.keyPrefix,
      keySuffix: suffix,
      maskedKey: `${updated.keyPrefix}••••••••${suffix}`,
      status: 'revoked',
      createdAt: updated.createdAt.toISOString(),
      lastUsedAt: updated.lastUsedAt ? updated.lastUsedAt.toISOString() : null,
      revokedAt: updated.revokedAt ? updated.revokedAt.toISOString() : null,
    };
  }

  /**
   * Deletes an API key.
   */
  public async deleteKey(userId: string, keyId: string): Promise<boolean> {
    const key = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: {
        api: { select: { userId: true } },
      },
    });

    if (!key || key.api.userId !== userId) {
      throw new NotFoundError('API key not found.');
    }

    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    return true;
  }

  /**
   * Authenticates a raw API key secret against PostgreSQL for a specific API gateway request.
   * Differentiates between invalid/revoked keys and keys belonging to a different API.
   */
  public async authenticateKeyForGateway(
    rawSecret: string,
    targetApiId: string
  ): Promise<KeyAuthResult> {
    if (!rawSecret || typeof rawSecret !== 'string') {
      return { success: false, reason: 'INVALID_OR_REVOKED' };
    }

    const keyHash = this.hashKeySecret(rawSecret);

    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        name: true,
        apiId: true,
        revokedAt: true,
      },
    });

    if (!key || key.revokedAt !== null) {
      return { success: false, reason: 'INVALID_OR_REVOKED' };
    }

    // Check if key is authorized for this specific API
    if (key.apiId !== targetApiId) {
      return {
        success: false,
        reason: 'API_MISMATCH',
        keyId: key.id,
        targetApiId,
      };
    }

    // Update lastUsedAt in background
    prisma.apiKey
      .update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      success: true,
      key: {
        id: key.id,
        name: key.name,
        apiId: key.apiId,
      },
    };
  }
}

export const keysService = new KeysService();
