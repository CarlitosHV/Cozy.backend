import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/env.js';
import { RoomManager } from './roomManager.js';
import { JwtPayload } from '../models/types.js';

export function setupSocketServer(httpServer: HttpServer): { io: Server; roomManager: RoomManager } {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const roomManager = new RoomManager(io);

  // Authentication Handshake Middleware (Section 7.1)
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      (socket.handshake.query?.token as string);

    if (!token) {
      return next(new Error('Authentication error: Missing token in socket handshake'));
    }

    try {
      const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as JwtPayload;
      socket.data.user = {
        userId: decoded.sub,
        username: decoded.username,
        role: decoded.role,
      };
      next();
    } catch {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    // Client joins a level room
    socket.on('room:join', async (data: { levelId: number }) => {
      try {
        const levelId = Number(data?.levelId) || 1;
        await roomManager.handleJoinRoom(socket, levelId);
      } catch (err: any) {
        socket.emit('error', { message: err.message || 'Failed to join level room' });
      }
    });

    // Movement replication loop (Tick rate 20-30 Hz)
    socket.on('player:sync', (data: any) => {
      roomManager.handlePlayerSync(socket, data);
    });

    // Companion power trigger
    socket.on('companion:power', (data: { powerType: string }) => {
      roomManager.handleCompanionPower(socket, data);
    });

    socket.on('disconnect', () => {
      roomManager.handleDisconnect(socket);
    });
  });

  return { io, roomManager };
}
