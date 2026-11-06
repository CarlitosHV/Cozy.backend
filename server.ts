import http from 'http';
import { createExpressApp } from './server/app.js';
import { setupSocketServer } from './server/websocket/socketServer.js';
import { CONFIG } from './server/config/env.js';
import { db } from './server/config/database.js';
import { redis } from './server/config/redis.js';

async function startServer() {
  await db.connectMongo();
  await redis.connectRedis();

  const app = createExpressApp();
  const httpServer = http.createServer(app);

  const { io, roomManager } = setupSocketServer(httpServer);
  app.set('io', io);
  app.set('roomManager', roomManager);

  httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`[Cozy Leap Online Backend] Server listening on http://0.0.0.0:${CONFIG.PORT}`);
    console.log(`[Cozy Leap Online Backend] Real-time WebSocket engine active on ws://0.0.0.0:${CONFIG.PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Cozy Leap Online Backend] Startup error:', err);
  process.exit(1);
});
