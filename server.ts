import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import express from 'express';
import { createExpressApp } from './server/app.js';
import { setupSocketServer } from './server/websocket/socketServer.js';
import { CONFIG } from './server/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createExpressApp();
  const httpServer = http.createServer(app);

  // Initialize Socket.io real-time engine
  const { io } = setupSocketServer(httpServer);
  app.set('io', io);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development mode: Mount Vite middleware on the same Express server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve built client files
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`[Cozy Leap Online Backend] Server listening on http://0.0.0.0:${CONFIG.PORT}`);
    console.log(`[Cozy Leap Online Backend] Real-time WebSocket engine active on ws://0.0.0.0:${CONFIG.PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Cozy Leap Online Backend] Startup error:', err);
  process.exit(1);
});
