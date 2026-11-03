import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/env.js';
import { JwtPayload } from '../models/types.js';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'No authorization token provided. Please log in or provide Bearer token.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    const isExpired = err?.name === 'TokenExpiredError';
    res.status(401).json({
      status: 'error',
      code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      message: isExpired ? 'Access token expired. Use /refresh to renew.' : 'Invalid authorization token.',
    });
    return;
  }
};
