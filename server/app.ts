import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { CONFIG } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import playerRoutes from './modules/player/player.routes.js';
import leaderboardRoutes from './modules/leaderboard/leaderboard.routes.js';
import friendsRoutes from './modules/friends/friends.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import roomsRoutes from './modules/rooms/rooms.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import shopRoutes from './modules/shop/shop.routes.js';

export function createExpressApp(): Express {
  const app = express();

  app.use(cors({
    origin: CONFIG.CORS_ORIGIN,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      name: 'Cozy Leap Online API',
      version: 'v1',
      health: '/api/v1/system/health',
    });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/player', playerRoutes);
  app.use('/api/v1/leaderboard', leaderboardRoutes);
  app.use('/api/v1/friends', friendsRoutes);
  app.use('/api/v1/rooms', roomsRoutes);
  app.use('/api/v1/shop', shopRoutes);
  app.use('/api/v1/system', systemRoutes);
  app.use('/api/v1/ai', aiRoutes);

  app.all('*', (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      code: 'ROUTE_NOT_FOUND',
      message: `API endpoint ${req.method} ${req.url} does not exist`,
    });
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    res.status(status).json({
      status: 'error',
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred on the game server',
    });
  });

  return app;
}
