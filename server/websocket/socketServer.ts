import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/env.js';
import { RoomManager } from './roomManager.js';
import { InviteManager } from './inviteManager.js';
import { markUserOffline, markUserOnline } from './presence.js';
import { JwtPayload } from '../models/types.js';

export function setupSocketServer(httpServer: HttpServer): { io: Server; roomManager: RoomManager } {
  const io = new Server(httpServer, {
    cors: {
      origin: CONFIG.CORS_ORIGIN,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const roomManager = new RoomManager(io);
  const inviteManager = new InviteManager(io, roomManager);

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
        displayName: decoded.displayName || decoded.username,
        role: decoded.role,
      };
      next();
    } catch {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    if (user?.userId) {
      markUserOnline(user.userId, socket.id);
    }

    socket.on('room:join', async (data: { levelId?: number; roomId?: string; appearance?: unknown; name?: unknown }) => {
      try {
        const levelId = Number(data?.levelId) || 1;
        const roomId = data?.roomId ? String(data.roomId) : undefined;
        // The game sends the character made in "Personalizar" so the party sees it as it is
        await roomManager.handleJoinRoom(socket, levelId, roomId, { appearance: data?.appearance, name: data?.name });
      } catch (err: any) {
        socket.emit('error', {
          code: err.code || 'JOIN_FAILED',
          message: err.message || 'Failed to join level room',
        });
      }
    });

    socket.on('room:leave', async () => {
      try {
        await roomManager.handleLeaveRoom(socket, 'leave');
      } catch (err: any) {
        socket.emit('error', {
          code: err.code || 'LEAVE_FAILED',
          message: err.message || 'Failed to leave room',
        });
      }
    });

    socket.on('player:sync', (data: any) => {
      roomManager.handlePlayerSync(socket, data);
    });

    // New look or name while in a party
    socket.on('player:profile', (data: { appearance?: unknown; name?: unknown }) => {
      roomManager.handlePlayerProfile(socket, data);
    });

    socket.on('companion:power', (data: { powerType: string }) => {
      roomManager.handleCompanionPower(socket, data);
    });

    // Shared puzzle progress inside a party: orbs found and rocks pushed
    socket.on('world:orb', (data: { levelId?: number; orbIndex?: number }) => {
      roomManager.handleWorldOrb(socket, data);
    });

    socket.on('world:block', (data: { levelId?: number; blockIndex?: number; x?: number; y?: number; z?: number }) => {
      roomManager.handleWorldBlock(socket, data);
    });

    socket.on('world:event', (data: { levelId?: number; kind?: string; i?: number; v?: number; target?: string }) => {
      roomManager.handleWorldEvent(socket, data);
    });

    // Spectator mode: what a player still in the level sees (enemy positions), for the friends watching
    socket.on('spectate:snap', (data: { levelId?: number; d?: unknown }) => {
      roomManager.handleSpectateSnap(socket, data);
    });

    // Synchronized Level Changes across the entire room
    socket.on('room:level_change', async (data: { levelId: number }) => {
      try {
        await roomManager.handleLevelChange(socket, data.levelId);
      } catch (err: any) {
        socket.emit('error', { code: 'LEVEL_CHANGE_FAILED', message: err.message });
      }
    });

    socket.on('room:advance_level', async () => {
      try {
        await roomManager.handleAdvanceLevel(socket);
      } catch (err: any) {
        socket.emit('error', { code: 'ADVANCE_LEVEL_FAILED', message: err.message });
      }
    });

    // Spectator Mode & Level Completion
    socket.on(
      'room:player_finish',
      async (data: {
        levelId?: number;
        timeSeconds?: number;
        relicsFound?: number;
        score?: number;
        stars?: number;
        deaths?: number;
        forfeited?: boolean;
      }) => {
      try {
        await roomManager.handlePlayerFinish(socket, {
          levelId: data?.levelId,
          timeSeconds: data?.timeSeconds,
          collectiblesFound: data?.relicsFound,
          score: data?.score,
          stars: data?.stars,
          deaths: data?.deaths,
          forfeited: data?.forfeited === true,
        });
      } catch (err: any) {
        socket.emit('error', { code: 'PLAYER_FINISH_FAILED', message: err.message });
      }
      }
    );

    socket.on('spectate:switch', (data: { targetUserId: string }) => {
      roomManager.handleSpectateSwitch(socket, data);
    });

    socket.on('invite:send', async (data: { toUserId?: string; levelId?: number; roomId?: string }) => {
      try {
        await inviteManager.handleSendInvite(socket, data);
      } catch (err: any) {
        socket.emit('error', {
          code: err.code || 'INVITE_SEND_FAILED',
          message: err.message || 'Failed to send invite',
        });
      }
    });

    socket.on('invite:respond', async (data: { inviteId?: string; accept?: boolean }) => {
      try {
        await inviteManager.handleRespondInvite(socket, data);
      } catch (err: any) {
        socket.emit('error', {
          code: err.code || 'INVITE_RESPOND_FAILED',
          message: err.message || 'Failed to respond to invite',
        });
      }
    });

    socket.on('disconnect', async () => {
      if (user?.userId) {
        markUserOffline(user.userId, socket.id);
      }
      await roomManager.handleDisconnect(socket);
    });
  });

  return { io, roomManager };
}
