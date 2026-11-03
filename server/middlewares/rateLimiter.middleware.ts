import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';

export const authRateLimiter = (maxAttempts = 5, windowSeconds = 900) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const email = (req.body?.email || '').toLowerCase().trim();
    const key = `ratelimit:login:${email || ip}`;

    const currentCount = redis.get<number>(key) || 0;
    if (currentCount >= maxAttempts) {
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many login attempts. Please wait 15 minutes before trying again.`,
        retryAfterSeconds: 900,
      });
      return;
    }

    next();
  };
};

export const registerFailedLogin = (req: Request): { count: number; remaining: number } => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const email = (req.body?.email || '').toLowerCase().trim();
  const key = `ratelimit:login:${email || ip}`;
  const { count } = redis.incrementRateLimit(key, 900);
  return { count, remaining: Math.max(0, 5 - count) };
};

export const clearFailedLogin = (req: Request): void => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const email = (req.body?.email || '').toLowerCase().trim();
  const key = `ratelimit:login:${email || ip}`;
  redis.resetRateLimit(key);
};
