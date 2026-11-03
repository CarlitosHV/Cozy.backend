import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { clearFailedLogin, registerFailedLogin } from '../../middlewares/rateLimiter.middleware.js';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.register(req.body);

      // Set Refresh Token in HttpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken, // also provided for mobile/token storage clients
          tokenType: 'Bearer',
          expiresInSeconds: 900,
        },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'REGISTRATION_FAILED',
        message: err.message || 'Error creating user',
      });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, deviceId = 'web' } = req.body;
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const result = await AuthService.login(email, password, deviceId, ip, userAgent);

      // Successful login clears failed counter
      clearFailedLogin(req);

      // Set Refresh Token in HttpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          tokenType: 'Bearer',
          expiresInSeconds: 900,
        },
      });
    } catch (err: any) {
      const { remaining } = registerFailedLogin(req);
      res.status(err.status || 401).json({
        status: 'error',
        code: err.code || 'LOGIN_FAILED',
        message: err.message || 'Invalid credentials',
        remainingAttemptsBeforeLockout: remaining,
      });
    }
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      // Check cookie first, fallback to req.body.refreshToken or Authorization header
      const token =
        req.cookies?.refreshToken ||
        req.body?.refreshToken ||
        (req.headers['x-refresh-token'] as string);

      if (!token) {
        res.status(401).json({
          status: 'error',
          code: 'MISSING_REFRESH_TOKEN',
          message: 'Refresh token cookie or parameter is missing.',
        });
        return;
      }

      const result = await AuthService.refresh(token, req.body?.deviceId || 'web');

      res.cookie('refreshToken', result.newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        status: 'success',
        message: 'Access token refreshed successfully',
        data: {
          accessToken: result.accessToken,
          refreshToken: result.newRefreshToken,
          tokenType: 'Bearer',
          expiresInSeconds: 900,
        },
      });
    } catch (err: any) {
      res.status(err.status || 401).json({
        status: 'error',
        code: err.code || 'REFRESH_FAILED',
        message: err.message || 'Could not refresh token',
      });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;
      const userId = (req as any).user?.sub || req.body?.userId;

      await AuthService.logout(token, userId);

      res.clearCookie('refreshToken', { path: '/api/v1/auth' });

      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully, session invalidated in Redis.',
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        code: 'LOGOUT_ERROR',
        message: err.message || 'Error during logout',
      });
    }
  }
}
