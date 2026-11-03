import { Server, Socket } from 'socket.io';
import { db, DEFAULT_APPEARANCE } from '../config/database.js';
import { redis } from '../config/redis.js';
import { AnimationType, PlayerRemoteState } from '../models/types.js';

export class RoomManager {
  private io: Server;
  // socketId -> levelId
  private socketRooms = new Map<string, number>();

  constructor(io: Server) {
    this.io = io;
  }

  getRoomName(levelId: number): string {
    return `level_${levelId}`;
  }

  async handleJoinRoom(socket: Socket, levelId: number): Promise<void> {
    const user = socket.data.user;
    if (!user) return;

    const currentLevel = this.socketRooms.get(socket.id);
    if (currentLevel !== undefined && currentLevel !== levelId) {
      await this.handleLeaveRoom(socket, currentLevel);
    }

    // Join new socket.io room
    const roomName = this.getRoomName(levelId);
    socket.join(roomName);
    this.socketRooms.set(socket.id, levelId);

    // Fetch player profile from DB
    const profile = await db.findProfileByUserId(user.userId);
    const appearance = profile?.appearance || DEFAULT_APPEARANCE;

    const spawnPositions = [
      { x: 0, y: 1.0, z: 0 },
      { x: 2.5, y: 1.0, z: -1.5 },
      { x: -2.0, y: 1.0, z: 2.0 },
      { x: 1.2, y: 1.0, z: 3.0 },
    ];
    const initialPos = spawnPositions[Math.floor(Math.random() * spawnPositions.length)];

    const playerState: PlayerRemoteState = {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName || user.username,
      appearance,
      x: initialPos.x,
      y: initialPos.y,
      z: initialPos.z,
      yaw: 0,
      anim: 'idle',
      lastUpdate: Date.now(),
      socketId: socket.id,
      levelId,
    };

    // Store in Redis hash: room:level_{levelId}:players
    const redisRoomKey = `room:level_${levelId}:players`;
    redis.hset(redisRoomKey, socket.id, playerState);

    // Get all existing players in this level
    const allPlayersInRoom = redis.hgetall<PlayerRemoteState>(redisRoomKey);
    const playersList = Object.values(allPlayersInRoom);

    // 1. Send initial state of the room to the joining player
    socket.emit('room:state', {
      levelId,
      players: playersList,
      yourSpawn: initialPos,
    });

    // 2. Broadcast to all other players in the room that a player joined
    socket.to(roomName).emit('player:joined', {
      userId: user.userId,
      username: user.username,
      appearance,
      position: { x: playerState.x, y: playerState.y, z: playerState.z, yaw: playerState.yaw },
    });
  }

  handlePlayerSync(
    socket: Socket,
    data: {
      x: number;
      y: number;
      z: number;
      yaw: number;
      anim: AnimationType;
      action?: string;
    }
  ): void {
    const user = socket.data.user;
    if (!user) return;

    const levelId = this.socketRooms.get(socket.id);
    if (!levelId) return;

    // Validate coordinates to prevent NaN/Infinity poisoning
    if (
      typeof data.x !== 'number' ||
      typeof data.y !== 'number' ||
      typeof data.z !== 'number' ||
      !isFinite(data.x) ||
      !isFinite(data.y) ||
      !isFinite(data.z)
    ) {
      return;
    }

    const redisRoomKey = `room:level_${levelId}:players`;
    const existing = redis.hget<PlayerRemoteState>(redisRoomKey, socket.id);
    if (existing) {
      existing.x = data.x;
      existing.y = data.y;
      existing.z = data.z;
      existing.yaw = data.yaw || 0;
      existing.anim = data.anim || 'idle';
      existing.action = data.action;
      existing.lastUpdate = Date.now();
      redis.hset(redisRoomKey, socket.id, existing);
    }

    const roomName = this.getRoomName(levelId);
    // Broadcast player:moved to all other clients in the level
    socket.to(roomName).emit('player:moved', {
      userId: user.userId,
      x: data.x,
      y: data.y,
      z: data.z,
      yaw: data.yaw,
      anim: data.anim,
      action: data.action,
    });
  }

  handleCompanionPower(socket: Socket, data: { powerType: string }): void {
    const user = socket.data.user;
    if (!user) return;

    const levelId = this.socketRooms.get(socket.id);
    if (!levelId) return;

    const redisRoomKey = `room:level_${levelId}:players`;
    const player = redis.hget<PlayerRemoteState>(redisRoomKey, socket.id);

    const roomName = this.getRoomName(levelId);
    this.io.to(roomName).emit('companion:power:broadcast', {
      userId: user.userId,
      username: user.username,
      powerType: data.powerType,
      position: player ? { x: player.x, y: player.y, z: player.z } : null,
      timestamp: Date.now(),
    });
  }

  async handleLeaveRoom(socket: Socket, levelId: number): Promise<void> {
    const user = socket.data.user;
    const roomName = this.getRoomName(levelId);
    socket.leave(roomName);
    this.socketRooms.delete(socket.id);

    const redisRoomKey = `room:level_${levelId}:players`;
    redis.hdel(redisRoomKey, socket.id);

    if (user) {
      socket.to(roomName).emit('player:left', {
        userId: user.userId,
      });
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const levelId = this.socketRooms.get(socket.id);
    if (levelId !== undefined) {
      await this.handleLeaveRoom(socket, levelId);
    }
  }
}
