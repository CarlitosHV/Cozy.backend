import { Server, Socket } from 'socket.io';
import { db, DEFAULT_APPEARANCE } from '../config/database.js';
import { redis } from '../config/redis.js';
import { AnimationType, PlayerRemoteState } from '../models/types.js';

const PARTY_MAX_PLAYERS = 4;

interface SocketRoomBinding {
  levelId: number;
  roomKey: string;
}

/** Shared puzzle state of a party on one level: orbs already found and where each rock is. */
interface WorldState {
  orbs: Set<number>;
  blocks: Map<number, { x: number; y: number; z: number }>;
}

/** Highest orb / rock index accepted from clients (levels have at most 5 of each). */
const MAX_WORLD_INDEX = 32;

export class RoomManager {
  private io: Server;
  private socketRooms = new Map<string, SocketRoomBinding>();
  /** Keyed by `${roomKey}:${levelId}` so a party member changing level doesn't wipe the others' progress */
  private worldStates = new Map<string, WorldState>();

  constructor(io: Server) {
    this.io = io;
  }

  resolveRoomKey(roomId?: string): string {
    if (!roomId || !roomId.startsWith('party_')) {
      const err: any = new Error('A private party roomId is required. Public lobbies are disabled.');
      err.code = 'PRIVATE_ROOM_REQUIRED';
      throw err;
    }
    return roomId;
  }

  redisKeyForRoom(roomKey: string): string {
    return `room:${roomKey}:players`;
  }

  private worldKey(roomKey: string, levelId: number): string {
    return `${roomKey}:${levelId}`;
  }

  private getWorld(roomKey: string, levelId: number): WorldState {
    const key = this.worldKey(roomKey, levelId);
    let ws = this.worldStates.get(key);
    if (!ws) {
      ws = { orbs: new Set(), blocks: new Map() };
      this.worldStates.set(key, ws);
    }
    return ws;
  }

  private validIndex(n: unknown): n is number {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < MAX_WORLD_INDEX;
  }

  async handleJoinRoom(socket: Socket, levelId: number, roomId?: string): Promise<void> {
    const user = socket.data.user;
    if (!user) return;

    const safeLevelId = Number(levelId) || 1;
    const roomKey = this.resolveRoomKey(roomId);
    const redisRoomKey = this.redisKeyForRoom(roomKey);

    const currentPlayers = Object.keys(redis.hgetall(redisRoomKey)).length;
    const alreadyInRoom = Boolean(redis.hget(redisRoomKey, socket.id));
    if (!alreadyInRoom && currentPlayers >= PARTY_MAX_PLAYERS) {
      const err: any = new Error('Private party room is full');
      err.code = 'PARTY_FULL';
      throw err;
    }

    const current = this.socketRooms.get(socket.id);
    if (current && (current.roomKey !== roomKey || current.levelId !== safeLevelId)) {
      await this.handleLeaveRoom(socket, 'leave');
    }

    socket.join(roomKey);
    this.socketRooms.set(socket.id, { levelId: safeLevelId, roomKey });

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
      levelId: safeLevelId,
    };

    redis.hset(redisRoomKey, socket.id, playerState);

    const allPlayersInRoom = redis.hgetall<PlayerRemoteState>(redisRoomKey);
    const playersList = Object.values(allPlayersInRoom);

    socket.emit('room:state', {
      levelId: safeLevelId,
      roomId: roomKey,
      players: playersList,
      yourSpawn: initialPos,
    });

    // Shared puzzle progress so far (orbs found, rocks moved) for whoever joins late
    const world = this.getWorld(roomKey, safeLevelId);
    socket.emit('world:state', {
      levelId: safeLevelId,
      orbs: [...world.orbs],
      blocks: [...world.blocks.entries()].map(([index, p]) => ({ index, x: p.x, y: p.y, z: p.z })),
    });

    socket.to(roomKey).emit('player:joined', {
      userId: user.userId,
      username: user.username,
      displayName: playerState.displayName,
      appearance,
      x: playerState.x,
      y: playerState.y,
      z: playerState.z,
      yaw: playerState.yaw,
      anim: playerState.anim,
      lastUpdate: playerState.lastUpdate,
      levelId: safeLevelId,
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

    const binding = this.socketRooms.get(socket.id);
    if (!binding) return;

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

    const redisRoomKey = this.redisKeyForRoom(binding.roomKey);
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

    socket.to(binding.roomKey).emit('player:moved', {
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

    const binding = this.socketRooms.get(socket.id);
    if (!binding) return;

    const redisRoomKey = this.redisKeyForRoom(binding.roomKey);
    const player = redis.hget<PlayerRemoteState>(redisRoomKey, socket.id);

    this.io.to(binding.roomKey).emit('companion:power:broadcast', {
      userId: user.userId,
      username: user.username,
      powerType: data.powerType,
      position: player ? { x: player.x, y: player.y, z: player.z } : null,
      timestamp: Date.now(),
    });
  }

  /** A player found an orb: everyone in the party gets it. */
  handleWorldOrb(socket: Socket, data: { levelId?: number; orbIndex?: number }): void {
    const user = socket.data.user;
    const binding = this.socketRooms.get(socket.id);
    if (!user || !binding) return;
    if (Number(data?.levelId) !== binding.levelId || !this.validIndex(data?.orbIndex)) return;

    const world = this.getWorld(binding.roomKey, binding.levelId);
    if (world.orbs.has(data.orbIndex)) return;
    world.orbs.add(data.orbIndex);

    socket.to(binding.roomKey).emit('world:orb', {
      userId: user.userId,
      username: user.username,
      levelId: binding.levelId,
      orbIndex: data.orbIndex,
    });
  }

  /** A player is pushing a rock: everyone sees it move (and whoever stands on it rides along). */
  handleWorldBlock(socket: Socket, data: { levelId?: number; blockIndex?: number; x?: number; y?: number; z?: number }): void {
    const user = socket.data.user;
    const binding = this.socketRooms.get(socket.id);
    if (!user || !binding) return;
    if (Number(data?.levelId) !== binding.levelId || !this.validIndex(data?.blockIndex)) return;
    const { x, y, z } = data;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || !isFinite(x) || !isFinite(y) || !isFinite(z)) return;

    const world = this.getWorld(binding.roomKey, binding.levelId);
    world.blocks.set(data.blockIndex, { x, y, z });

    socket.to(binding.roomKey).emit('world:block', {
      userId: user.userId,
      levelId: binding.levelId,
      blockIndex: data.blockIndex,
      x,
      y,
      z,
    });
  }

  /** Forget the shared puzzle state once nobody is left in the party room. */
  private cleanupWorlds(roomKey: string): void {
    const stillUsed = [...this.socketRooms.values()].some((b) => b.roomKey === roomKey);
    if (stillUsed) return;
    for (const key of [...this.worldStates.keys()]) {
      if (key.startsWith(`${roomKey}:`)) this.worldStates.delete(key);
    }
  }

  async handleLeaveRoom(socket: Socket, reason: 'leave' | 'disconnect' = 'leave'): Promise<void> {
    const user = socket.data.user;
    const binding = this.socketRooms.get(socket.id);
    if (!binding) return;

    const redisRoomKey = this.redisKeyForRoom(binding.roomKey);
    const cached = redis.hget<PlayerRemoteState>(redisRoomKey, socket.id);

    const leftPayload = {
      userId: user?.userId || cached?.userId,
      username: user?.username || cached?.username || 'jugador',
      displayName: user?.displayName || cached?.displayName || cached?.username || user?.username || 'jugador',
      reason,
    };

    this.socketRooms.delete(socket.id);
    redis.hdel(redisRoomKey, socket.id);

    if (leftPayload.userId) {
      this.io.to(binding.roomKey).emit('player:left', leftPayload);
    }

    socket.leave(binding.roomKey);
    this.cleanupWorlds(binding.roomKey);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    await this.handleLeaveRoom(socket, 'disconnect');
  }
}
