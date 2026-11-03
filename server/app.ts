import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import playerRoutes from './modules/player/player.routes.js';
import leaderboardRoutes from './modules/leaderboard/leaderboard.routes.js';
import systemRoutes from './modules/system/system.routes.js';

export function createExpressApp(): Express {
  const app = express();

  // Basic security and parsing middlewares
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // API v1 Routing
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/player', playerRoutes);
  app.use('/api/v1/leaderboard', leaderboardRoutes);
  app.use('/api/v1/system', systemRoutes);

  // Global 404 handler for API routes
  app.all('/api/*', (req: Request, res: Response) => {
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
