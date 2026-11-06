import { Server, Socket } from 'socket.io';
import { db, DEFAULT_APPEARANCE } from '../config/database.js';
import { redis } from '../config/redis.js';
import { AnimationType, PlayerRemoteState } from '../models/types.js';

const PARTY_MAX_PLAYERS = 10;

interface SocketRoomBinding {
  levelId: number;
  roomKey: string;
}

/** Shared puzzle state of a party on one level: orbs already found and where each rock is. */
interface WorldState {
  orbs: Set<number>;
  blocks: Map<number, { x: number; y: number; z: number }>;
  /** Boss fights: events so far (damage, heals, nets…), replayed by whoever joins late */
  events: WorldEvent[];
}

/** Something that happened in a boss fight, relayed to the rest of the party. */
interface WorldEvent {
  userId: string;
  username: string;
  levelId: number;
  kind: string;
  i?: number;
  v?: number;
  target?: string;
}

/** How many boss-fight events are kept per party and level. */
const MAX_WORLD_EVENTS = 400;

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

  getSocketBinding(socketId: string): SocketRoomBinding | undefined {
    return this.socketRooms.get(socketId);
  }

  resolveRoomKey(roomId?: string, levelId: number = 1): string {
    if (!roomId || !roomId.trim()) {
      return `party_level_${levelId}`;
    }
    const clean = roomId.trim();
    return clean.startsWith('party_') ? clean : `party_${clean}`;
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
      ws = { orbs: new Set(), blocks: new Map(), events: [] };
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
    const roomKey = this.resolveRoomKey(roomId, safeLevelId);
    const redisRoomKey = this.redisKeyForRoom(roomKey);

    // Prune stale entries: disconnected sockets or older sockets for the same user
    const allExisting = redis.hgetall<PlayerRemoteState>(redisRoomKey);
    for (const [sId, p] of Object.entries(allExisting)) {
      const isCurrentSocket = sId === socket.id;
      const isSameUser = p.userId === user.userId;
      const isSocketConnected = Boolean(this.io.sockets.sockets.get(sId));
      if ((isSameUser && !isCurrentSocket) || (!isSocketConnected && !isCurrentSocket)) {
        redis.hdel(redisRoomKey, sId);
        delete allExisting[sId];
      }
    }

    const currentPlayers = Object.keys(allExisting).length;
    const alreadyInRoom = Boolean(allExisting[socket.id]);
    if (!alreadyInRoom && currentPlayers >= PARTY_MAX_PLAYERS) {
      const err: any = new Error(`Party room is full (max ${PARTY_MAX_PLAYERS} players)`);
      err.code = 'PARTY_FULL';
      throw err;
    }

    const current = this.socketRooms.get(socket.id);
    if (current && (current.roomKey !== roomKey || current.levelId !== safeLevelId)) {
      await this.handleLeaveRoom(socket, 'leave');
    }

    socket.join(roomKey);
    this.socketRooms.set(socket.id, { levelId: safeLevelId, roomKey });

    // Fetch user and profile from database for accurate name and appearance
    const userDoc = await db.findUserById(user.userId);
    const resolvedUsername = userDoc?.username || user.username;
    const resolvedDisplayName =
      userDoc?.displayName ||
      userDoc?.username ||
      user.displayName ||
      user.username ||
      'Explorador';

    const profile = await db.findProfileByUserId(user.userId);
    const appearance = profile?.appearance || DEFAULT_APPEARANCE;

    const spawnPositions = [
      { x: 0, y: 1.0, z: 0 },
      { x: 2.5, y: 1.0, z: -1.5 },
      { x: -2.0, y: 1.0, z: 2.0 },
      { x: 1.2, y: 1.0, z: 3.0 },
      { x: -3.0, y: 1.0, z: -2.0 },
      { x: 3.5, y: 1.0, z: 1.5 },
      { x: 0.0, y: 1.0, z: -3.5 },
      { x: -1.5, y: 1.0, z: -1.0 },
    ];
    const initialPos = spawnPositions[currentPlayers % spawnPositions.length];

    const playerState: PlayerRemoteState = {
      userId: user.userId,
      id: user.userId,
      username: resolvedUsername,
      displayName: resolvedDisplayName,
      name: resolvedDisplayName,
      playerName: resolvedDisplayName,
      tag: resolvedDisplayName,
      label: resolvedDisplayName,
      appearance,
      x: initialPos.x,
      y: initialPos.y,
      z: initialPos.z,
      yaw: 0,
      anim: 'idle',
      position: { x: initialPos.x, y: initialPos.y, z: initialPos.z, yaw: 0 },
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
      player: playerState,
      self: {
        userId: user.userId,
        id: user.userId,
        username: resolvedUsername,
        displayName: resolvedDisplayName,
        name: resolvedDisplayName,
        playerName: resolvedDisplayName,
        tag: resolvedDisplayName,
        label: resolvedDisplayName,
        appearance,
      },
    });

    // Shared puzzle progress so far (orbs found, rocks moved) for whoever joins late
    const world = this.getWorld(roomKey, safeLevelId);
    socket.emit('world:state', {
      levelId: safeLevelId,
      orbs: [...world.orbs],
      blocks: [...world.blocks.entries()].map(([index, p]) => ({ index, x: p.x, y: p.y, z: p.z })),
      events: world.events,
    });

    socket.to(roomKey).emit('player:joined', {
      userId: user.userId,
      id: user.userId,
      username: resolvedUsername,
      displayName: resolvedDisplayName,
      name: resolvedDisplayName,
      playerName: resolvedDisplayName,
      tag: resolvedDisplayName,
      label: resolvedDisplayName,
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
      existing.position = { x: data.x, y: data.y, z: data.z, yaw: data.yaw || 0 };
      existing.lastUpdate = Date.now();
      redis.hset(redisRoomKey, socket.id, existing);
    }

    socket.to(binding.roomKey).emit('player:moved', {
      userId: user.userId,
      id: user.userId,
      username: existing?.username || user.username,
      displayName: existing?.displayName || user.displayName || user.username,
      name: existing?.displayName || user.displayName || user.username,
      playerName: existing?.displayName || user.displayName || user.username,
      x: data.x,
      y: data.y,
      z: data.z,
      yaw: data.yaw || 0,
      anim: data.anim,
      action: data.action,
      position: { x: data.x, y: data.y, z: data.z, yaw: data.yaw || 0 },
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
      id: user.userId,
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
      id: user.userId,
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
      id: user.userId,
      levelId: binding.levelId,
      blockIndex: data.blockIndex,
      x,
      y,
      z,
    });
  }

  /**
   * Boss fights: damage, heals, nets, candelabra, rescues… The server only checks the shape
   * of the event, keeps it for late joiners and relays it to the rest of the party.
   */
  handleWorldEvent(socket: Socket, data: { levelId?: number; kind?: string; i?: number; v?: number; target?: string }): void {
    const user = socket.data.user;
    const binding = this.socketRooms.get(socket.id);
    if (!user || !binding) return;
    if (Number(data?.levelId) !== binding.levelId) return;
    const kind = data?.kind;
    if (typeof kind !== 'string' || !/^[a-z]{1,16}$/.test(kind)) return;
    const event: WorldEvent = { userId: user.userId, username: user.username, levelId: binding.levelId, kind };
    if (data.i !== undefined) {
      if (!this.validIndex(data.i)) return;
      event.i = data.i;
    }
    if (data.v !== undefined) {
      if (typeof data.v !== 'number' || !isFinite(data.v) || Math.abs(data.v) > 1000) return;
      event.v = data.v;
    }
    if (data.target !== undefined) {
      if (typeof data.target !== 'string' || data.target.length > 64) return;
      event.target = data.target;
    }

    const world = this.getWorld(binding.roomKey, binding.levelId);
    world.events.push(event);
    if (world.events.length > MAX_WORLD_EVENTS) world.events.splice(0, world.events.length - MAX_WORLD_EVENTS);

    socket.to(binding.roomKey).emit('world:event', event);
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

    const userDoc = user?.userId ? await db.findUserById(user.userId) : null;
    const resolvedName =
      userDoc?.displayName ||
      userDoc?.username ||
      user?.displayName ||
      cached?.displayName ||
      cached?.username ||
      user?.username ||
      'jugador';

    const leftPayload = {
      userId: user?.userId || cached?.userId,
      id: user?.userId || cached?.userId,
      username: user?.username || cached?.username || 'jugador',
      displayName: resolvedName,
      name: resolvedName,
      playerName: resolvedName,
      tag: resolvedName,
      label: resolvedName,
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

