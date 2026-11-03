import { Server } from 'socket.io';
import { redis } from '../config/redis.js';

const ONLINE_SET = 'presence:online_users';

export function socketPresenceKey(userId: string): string {
  return `presence:socket:${userId}`;
}

export function markUserOnline(userId: string, socketId: string): void {
  redis.sadd(ONLINE_SET, userId);
  redis.set(socketPresenceKey(userId), socketId);
}

export function markUserOffline(userId: string, socketId: string): void {
  const currentSocketId = redis.get<string>(socketPresenceKey(userId));
  if (currentSocketId && currentSocketId !== socketId) {
    return;
  }
  redis.del(socketPresenceKey(userId));
  redis.srem(ONLINE_SET, userId);
}

export function getUserSocketId(userId: string): string | null {
  return redis.get<string>(socketPresenceKey(userId));
}

export function emitToUser(io: Server, userId: string, event: string, payload: unknown): boolean {
  const socketId = getUserSocketId(userId);
  if (!socketId) return false;
  io.to(socketId).emit(event, payload);
  return true;
}
