import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/prisma';
import { config } from '../config';
import { ConflictError, UnauthorizedError, NotFoundError } from '../errors/AppError';
import { SafeUser, SessionPayload, RegisterInput, LoginInput } from './auth.types';

export class AuthService {
  /**
   * Hashes a raw password with bcrypt (salt rounds: 10).
   */
  public async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  /**
   * Compares a raw password with a bcrypt hash.
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Signs a 7-day session token for an authenticated user.
   */
  public createSessionToken(user: SafeUser): string {
    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
    };
    return jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.sessionDurationSeconds,
    });
  }

  /**
   * Verifies and decodes a session token.
   */
  public verifySessionToken(token: string): SessionPayload | null {
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret) as SessionPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Registers a new user with email and hashed password in PostgreSQL.
   */
  public async registerUser(input: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError('An account with this email address already exists.');
    }

    const passwordHash = await this.hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Authenticates a user by email and password from PostgreSQL.
   */
  public async loginUser(input: LoginInput): Promise<SafeUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const userRecord = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Generic error to prevent account enumeration
    if (!userRecord) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await this.verifyPassword(input.password, userRecord.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    return {
      id: userRecord.id,
      email: userRecord.email,
      createdAt: userRecord.createdAt,
    };
  }

  /**
   * Retrieves a safe user by ID from PostgreSQL.
   */
  public async getUserById(userId: string): Promise<SafeUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });
    return user;
  }

  /**
   * Verifies that an API exists and belongs to the authenticated user.
   * Returns 404 on not found or mismatched owner to prevent resource leakage.
   */
  public async verifyApiOwnership(
    userId: string,
    apiId: string
  ): Promise<{ id: string; userId: string; name: string }> {
    const apiRecord = await prisma.api.findUnique({
      where: { id: apiId },
      select: { id: true, userId: true, name: true },
    });

    if (!apiRecord || apiRecord.userId !== userId) {
      throw new NotFoundError('API not found');
    }

    return apiRecord;
  }
}

export const authService = new AuthService();
