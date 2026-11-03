import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../../config/env.js';
import { db } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { JwtPayload, UserDocument } from '../../models/types.js';

export class AuthService {
  static generateAccessToken(user: UserDocument): string {
    const payload: JwtPayload = {
      sub: user._id,
      username: user.username,
      role: user.role,
    };
    return jwt.sign(payload as object, CONFIG.JWT_SECRET as jwt.Secret, {
      expiresIn: '15m',
    } as jwt.SignOptions);
  }

  static generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  static async register(data: {
    username: string;
    displayName?: string;
    email: string;
    password: string;
  }): Promise<{ user: Omit<UserDocument, 'passwordHash'>; accessToken: string; refreshToken: string }> {
    const existingEmail = await db.findUserByEmail(data.email);
    if (existingEmail) {
      const error: any = new Error('Email is already registered');
      error.status = 409;
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    const existingUsername = await db.findUserByUsername(data.username);
    if (existingUsername) {
      const error: any = new Error('Username is already taken');
      error.status = 409;
      error.code = 'USERNAME_EXISTS';
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const user = await db.createUser({
      username: data.username,
      displayName: data.displayName || data.username,
      email: data.email,
      passwordHash,
    });

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken();

    // Store in Redis session
    const sessionKey = `session:${user._id}:web`;
    redis.set(
      sessionKey,
      {
        refreshTokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        userId: user._id,
        createdAt: new Date().toISOString(),
      },
      CONFIG.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60
    );

    // Add to presence
    redis.sadd('presence:online_users', user._id);

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  }

  static async login(
    emailOrUsername: string,
    plainPassword: string,
    deviceId = 'web',
    ip = '127.0.0.1',
    userAgent = 'unknown'
  ): Promise<{ user: Omit<UserDocument, 'passwordHash'>; accessToken: string; refreshToken: string }> {
    let user = await db.findUserByEmail(emailOrUsername);
    if (!user) {
      user = await db.findUserByUsername(emailOrUsername);
    }

    if (!user) {
      const error: any = new Error('Invalid email or password');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const isMatch = await bcrypt.compare(plainPassword, user.passwordHash);
    if (!isMatch) {
      const error: any = new Error('Invalid email or password');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Update lastLoginAt
    await db.updateUser(user._id, { lastLoginAt: new Date().toISOString() });

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken();

    // Store session in Redis
    const sessionKey = `session:${user._id}:${deviceId}`;
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    redis.set(
      sessionKey,
      {
        refreshTokenHash,
        userId: user._id,
        deviceId,
        ip,
        userAgent,
        createdAt: new Date().toISOString(),
      },
      CONFIG.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60
    );

    redis.sadd('presence:online_users', user._id);

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  }

  static async refresh(
    refreshToken: string,
    deviceId = 'web'
  ): Promise<{ accessToken: string; newRefreshToken: string; userId: string }> {
    if (!refreshToken) {
      const error: any = new Error('Refresh token is required');
      error.status = 401;
      error.code = 'NO_REFRESH_TOKEN';
      throw error;
    }

    const inputHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find session in Redis
    let foundUserId: string | null = null;
    let foundKey: string | null = null;

    // Inspect active sessions in Redis
    const debug = redis.getDebugStats();
    for (const session of debug.activeSessions) {
      if (session.value && session.value.refreshTokenHash === inputHash) {
        foundUserId = session.value.userId;
        foundKey = session.key;
        break;
      }
    }

    if (!foundUserId || !foundKey) {
      const error: any = new Error('Invalid or expired refresh token session');
      error.status = 401;
      error.code = 'INVALID_SESSION';
      throw error;
    }

    const user = await db.findUserById(foundUserId);
    if (!user || !user.isActive) {
      const error: any = new Error('User account not found or disabled');
      error.status = 401;
      error.code = 'USER_INACTIVE';
      throw error;
    }

    // Token Rotation: issue new access token and rotated refresh token
    const newAccessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken();
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    redis.set(
      foundKey,
      {
        refreshTokenHash: newHash,
        userId: user._id,
        deviceId,
        rotatedAt: new Date().toISOString(),
      },
      CONFIG.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60
    );

    return {
      accessToken: newAccessToken,
      newRefreshToken,
      userId: user._id,
    };
  }

  static async logout(refreshToken?: string, userId?: string, deviceId = 'web'): Promise<void> {
    if (refreshToken) {
      const inputHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const debug = redis.getDebugStats();
      for (const session of debug.activeSessions) {
        if (session.value && session.value.refreshTokenHash === inputHash) {
          redis.del(session.key);
          if (session.value.userId) {
            redis.srem('presence:online_users', session.value.userId);
          }
          break;
        }
      }
    }

    if (userId) {
      redis.del(`session:${userId}:${deviceId}`);
      redis.srem('presence:online_users', userId);
    }
  }
}
