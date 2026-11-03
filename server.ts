import http from 'http';
import { createExpressApp } from './server/app.js';
import { setupSocketServer } from './server/websocket/socketServer.js';
import { CONFIG } from './server/config/env.js';

async function startServer() {
  const app = createExpressApp();
  const httpServer = http.createServer(app);

  const { io } = setupSocketServer(httpServer);
  app.set('io', io);

  httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`[Cozy Leap Online Backend] Server listening on http://0.0.0.0:${CONFIG.PORT}`);
    console.log(`[Cozy Leap Online Backend] Real-time WebSocket engine active on ws://0.0.0.0:${CONFIG.PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Cozy Leap Online Backend] Startup error:', err);
  process.exit(1);
});
