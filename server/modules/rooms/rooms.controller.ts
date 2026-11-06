import { Request, Response } from 'express';
import { RoomManager } from '../../websocket/roomManager.js';

function createPartyId(): string {
  return `party_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

export class RoomsController {
  static getActiveRooms(req: Request, res: Response): void {
    const roomManager = req.app.get('roomManager') as RoomManager | undefined;
    if (!roomManager) {
      res.status(503).json({ status: 'error', message: 'Room engine initializing' });
      return;
    }
    const rooms = roomManager.listActiveRooms();
    res.status(200).json({
      status: 'success',
      totalActiveRooms: rooms.length,
      rooms,
    });
  }

  static getMyRoom(req: Request, res: Response): void {
    const roomManager = req.app.get('roomManager') as RoomManager | undefined;
    const user = (req as any).user;
    if (!roomManager || !user) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const room = roomManager.getUserRoom(user.userId);
    if (!room) {
      res.status(404).json({
        status: 'error',
        code: 'NOT_IN_ROOM',
        message: 'You are not currently active in any multiplayer room',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: room,
    });
  }

  static getRoomById(req: Request, res: Response): void {
    const roomManager = req.app.get('roomManager') as RoomManager | undefined;
    const { roomId } = req.params;
    if (!roomManager) {
      res.status(503).json({ status: 'error', message: 'Room engine initializing' });
      return;
    }

    const room = roomManager.getRoomInfo(roomId);
    if (!room) {
      res.status(404).json({
        status: 'error',
        code: 'ROOM_NOT_FOUND',
        message: `Room ${roomId} does not exist or has no active players`,
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: room,
    });
  }

  static createRoom(req: Request, res: Response): void {
    const levelId = Number(req.body?.levelId) || 1;
    const customCode = req.body?.customCode ? String(req.body.customCode).trim() : undefined;
    const roomId = customCode
      ? (customCode.startsWith('party_') ? customCode : `party_${customCode}`)
      : createPartyId();

    res.status(201).json({
      status: 'success',
      data: {
        roomId,
        levelId,
        wsEndpoint: '/socket.io',
        joinInstruction: `Emit 'room:join' with { levelId: ${levelId}, roomId: '${roomId}' } over WebSocket`,
      },
    });
  }
}
