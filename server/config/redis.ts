import Redis from 'ioredis';
import { CONFIG } from './env.js';

interface KeyValueItem {
  value: any;
  expiresAt?: number;
}

interface SortedSetMember {
  member: string;
  score: number;
}

class RedisStore {
  private kv = new Map<string, KeyValueItem>();
  private sets = new Map<string, Set<string>>();
  private hashes = new Map<string, Map<string, any>>();
  private sortedSets = new Map<string, SortedSetMember[]>();
  public client: Redis | null = null;

  constructor() {
    // If REDIS_URL provided, pre-configure client
    if (CONFIG.REDIS_URL) {
      try {
        this.client = new Redis(CONFIG.REDIS_URL, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          connectTimeout: 5000,
          retryStrategy(times) {
            if (times > 3) return null;
            return Math.min(times * 1000, 3000);
          },
        });
      } catch (err: any) {
        console.warn(`[Redis] Initialization warning: ${err.message}`);
      }
    }
  }

  async connectRedis(): Promise<boolean> {
    if (!this.client || !CONFIG.REDIS_URL) {
      console.log('[Redis] No REDIS_URL configured. Operating in high-speed local memory cache mode.');
      return false;
    }
    try {
      await this.client.connect();
      console.log(`[Redis] Connected to external Redis successfully at ${CONFIG.REDIS_URL}`);
      return true;
    } catch (err: any) {
      console.warn(`[Redis] Could not connect to external Redis (${err.message}). Using local fast cache fallback.`);
      return false;
    }
  }

  // --- String / Object Key-Value with TTL ---
  set(key: string, value: any, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.kv.set(key, { value, expiresAt });
    if (this.client && this.client.status === 'ready') {
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        this.client.setex(key, ttlSeconds, valStr).catch(() => {});
      } else {
        this.client.set(key, valStr).catch(() => {});
      }
    }
  }

  get<T = any>(key: string): T | null {
    const item = this.kv.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.kv.delete(key);
      return null;
    }
    return item.value as T;
  }

  del(key: string): boolean {
    if (this.client && this.client.status === 'ready') {
      this.client.del(key).catch(() => {});
    }
    return this.kv.delete(key);
  }

  expire(key: string, seconds: number): boolean {
    const item = this.kv.get(key);
    if (!item) return false;
    item.expiresAt = Date.now() + seconds * 1000;
    if (this.client && this.client.status === 'ready') {
      this.client.expire(key, seconds).catch(() => {});
    }
    return true;
  }

  // --- Sets (e.g., presence:online_users) ---
  sadd(key: string, member: string): void {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    this.sets.get(key)!.add(member);
    if (this.client && this.client.status === 'ready') {
      this.client.sadd(key, member).catch(() => {});
    }
  }

  srem(key: string, member: string): boolean {
    const set = this.sets.get(key);
    if (this.client && this.client.status === 'ready') {
      this.client.srem(key, member).catch(() => {});
    }
    if (!set) return false;
    return set.delete(member);
  }

  smembers(key: string): string[] {
    const set = this.sets.get(key);
    if (!set) return [];
    return Array.from(set);
  }

  scard(key: string): number {
    return this.sets.get(key)?.size || 0;
  }

  sismember(key: string, member: string): boolean {
    const set = this.sets.get(key);
    if (!set) return false;
    return set.has(member);
  }

  // --- Hashes (e.g., room:level_{levelId}:players) ---
  hset(key: string, field: string, value: any): void {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    this.hashes.get(key)!.set(field, value);
    if (this.client && this.client.status === 'ready') {
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      this.client.hset(key, field, valStr).catch(() => {});
    }
  }

  hget<T = any>(key: string, field: string): T | null {
    const map = this.hashes.get(key);
    if (!map) return null;
    return (map.get(field) as T) || null;
  }

  hdel(key: string, field: string): boolean {
    const map = this.hashes.get(key);
    if (this.client && this.client.status === 'ready') {
      this.client.hdel(key, field).catch(() => {});
    }
    if (!map) return false;
    return map.delete(field);
  }

  hgetall<T = any>(key: string): Record<string, T> {
    const map = this.hashes.get(key);
    if (!map) return {};
    const result: Record<string, T> = {};
    for (const [k, v] of map.entries()) {
      result[k] = v as T;
    }
    return result;
  }

  // --- Sorted Sets (e.g., leaderboard:level:{levelId}:time_trial) ---
  zadd(key: string, score: number, member: string): void {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    const list = this.sortedSets.get(key)!;
    const existingIndex = list.findIndex((m) => m.member === member);
    if (existingIndex >= 0) {
      list[existingIndex].score = score;
    } else {
      list.push({ member, score });
    }
    // Lowest score first (fastest time)
    list.sort((a, b) => a.score - b.score);
    if (this.client && this.client.status === 'ready') {
      this.client.zadd(key, score, member).catch(() => {});
    }
  }

  zrange(key: string, start: number = 0, stop: number = -1): SortedSetMember[] {
    const list = this.sortedSets.get(key);
    if (!list) return [];
    if (stop === -1) {
      return list.slice(start);
    }
    return list.slice(start, stop + 1);
  }

  zrank(key: string, member: string): number | null {
    const list = this.sortedSets.get(key);
    if (!list) return null;
    const index = list.findIndex((m) => m.member === member);
    return index >= 0 ? index : null;
  }

  // --- Rate Limiting Helper (5 attempts / 15m) ---
  incrementRateLimit(key: string, windowSeconds: number = 900): { count: number; ttl: number } {
    const item = this.kv.get(key);
    const now = Date.now();
    if (!item || (item.expiresAt && now > item.expiresAt)) {
      const expiresAt = now + windowSeconds * 1000;
      this.kv.set(key, { value: 1, expiresAt });
      return { count: 1, ttl: windowSeconds };
    }
    const current = Number(item.value) || 0;
    item.value = current + 1;
    const remainingSeconds = Math.max(0, Math.round(((item.expiresAt || now) - now) / 1000));
    return { count: item.value, ttl: remainingSeconds };
  }

  resetRateLimit(key: string): void {
    this.kv.delete(key);
  }

  // --- Debug / Metrics Inspector ---
  getDebugStats(): {
    kvKeysCount: number;
    setsCount: number;
    hashesCount: number;
    sortedSetsCount: number;
    activeSessions: Array<{ key: string; expiresAt?: number; value: any }>;
    onlineUsers: string[];
    rooms: Record<string, number>;
  } {
    const activeSessions: Array<{ key: string; expiresAt?: number; value: any }> = [];
    for (const [k, v] of this.kv.entries()) {
      if (k.startsWith('session:')) {
        activeSessions.push({ key: k, expiresAt: v.expiresAt, value: v.value });
      }
    }

    const rooms: Record<string, number> = {};
    for (const [k, map] of this.hashes.entries()) {
      if (k.startsWith('room:')) {
        rooms[k] = map.size;
      }
    }

    return {
      kvKeysCount: this.kv.size,
      setsCount: this.sets.size,
      hashesCount: this.hashes.size,
      sortedSetsCount: this.sortedSets.size,
      activeSessions,
      onlineUsers: this.smembers('presence:online_users'),
      rooms,
    };
  }
}

export const redis = new RedisStore();
