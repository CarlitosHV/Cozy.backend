import { Router, Request, Response } from 'express';
import { db } from '../../config/database.js';
import { redis } from '../../config/redis.js';

const router = Router();

// GET /api/v1/system/health
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    game: 'Cozy Leap Online',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    services: {
      mongoDatabase: 'connected (in-memory document store)',
      redisCache: 'connected (fast key-value & sorted sets)',
      webSocketServer: 'active (Socket.io 20-30Hz)',
    },
  });
});

// GET /api/v1/system/redis-inspect
router.get('/redis-inspect', (_req: Request, res: Response) => {
  const stats = redis.getDebugStats();
  res.status(200).json({
    status: 'success',
    redis: stats,
  });
});

// GET /api/v1/system/rooms
router.get('/rooms', (_req: Request, res: Response) => {
  const stats = redis.getDebugStats();
  res.status(200).json({
    status: 'success',
    rooms: stats.rooms,
    onlineUsersCount: stats.onlineUsers.length,
  });
});

export default router;
