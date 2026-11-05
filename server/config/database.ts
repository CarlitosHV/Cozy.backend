import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { MongoClient, Db } from 'mongodb';
import { CONFIG } from './env.js';
import {
  CharacterAppearance,
  FriendRequestDocument,
  InventoryStatus,
  LevelRecordDocument,
  PlayerProfileDocument,
  PlayerProgress,
  PlayerStats,
  UserDocument,
  normalizeGameMode,
} from '../models/types.js';

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  bodyType: 'chico',
  skinColor: '#f8d5b8',
  hairStyle: 'cozy_messy',
  hairColor: '#4a2e18',
  eyesStyle: 'bright_round',
  eyesColor: '#2b5c8f',
  shirtStyle: 'hoodie',
  shirtColor: '#4f46e5',
  pantsStyle: 'joggers',
  pantsColor: '#1e293b',
  shoesColor: '#f97316',
  hat: 'beanie_cozy',
  glasses: 'none',
  backpack: 'explorer_pack',
  companion: 'nube',
};

export const DEFAULT_INVENTORY: InventoryStatus = {
  slots: ['baya', 'nuez', null, null, 'llave'],
};

export const DEFAULT_PROGRESS: PlayerProgress = {
  maxUnlockedLevel: 1,
  completedLevels: [],
  totalCollectiblesFound: 0,
  unlockedCompanions: ['nube'],
};

export const DEFAULT_STATS: PlayerStats = {
  totalPlayTimeSeconds: 0,
  totalJumps: 0,
  totalFalls: 0,
};

class InMemoryDatabase {
  users: Map<string, UserDocument> = new Map();
  profiles: Map<string, PlayerProfileDocument> = new Map();
  records: LevelRecordDocument[] = [];
  friendRequests: Map<string, FriendRequestDocument> = new Map();
  friendships: Map<string, Set<string>> = new Map();
  private dbFilePath = path.resolve(process.cwd(), '.data', 'cozyleap_db.json');
  private mongoClient: MongoClient | null = null;
  public mongoDb: Db | null = null;

  constructor() {
    this.initDatabase();
  }

  async connectMongo(): Promise<boolean> {
    if (!CONFIG.MONGODB_URI) return false;
    try {
      this.mongoClient = new MongoClient(CONFIG.MONGODB_URI, {
        serverSelectionTimeoutMS: 2500,
        connectTimeoutMS: 2500,
      });
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db();
      console.log(`[Database] Connected to external MongoDB successfully at ${CONFIG.MONGODB_URI}`);
      return true;
    } catch (err: any) {
      console.warn(`[Database] Could not connect to external MongoDB (${err.message}). Using persistent local storage.`);
      this.mongoDb = null;
      return false;
    }
  }

  private initDatabase() {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && Array.isArray(parsed.users)) {
          this.users = new Map(parsed.users);
          this.profiles = new Map(parsed.profiles || []);
          this.records = parsed.records || [];
          this.friendRequests = new Map(parsed.friendRequests || []);
          this.friendships = new Map(
            (parsed.friendships || []).map(([k, list]: [string, string[]]) => [k, new Set(list)])
          );
          console.log(`[Database] Loaded ${this.users.size} users, ${this.records.length} records from ${this.dbFilePath}`);
          return;
        }
      }
    } catch (e) {
      console.warn('[Database] Could not read from persistent store, seeding initial data:', e);
    }

    this.seedDefaultData();
    this.persist();
  }

  private persist() {
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const serialized = {
        users: Array.from(this.users.entries()),
        profiles: Array.from(this.profiles.entries()),
        records: this.records,
        friendRequests: Array.from(this.friendRequests.entries()),
        friendships: Array.from(this.friendships.entries()).map(([k, set]) => [k, Array.from(set)]),
      };
      fs.writeFileSync(this.dbFilePath, JSON.stringify(serialized, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Error saving to persistent storage:', err);
    }
  }

  generateId(prefix = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // --- Users Collection ---
  async findUserById(id: string): Promise<UserDocument | null> {
    return this.users.get(id) || null;
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findUserByUsername(username: string): Promise<UserDocument | null> {
    const normalized = username.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async createUser(data: {
    username: string;
    displayName: string;
    email: string;
    passwordHash: string;
    role?: 'player' | 'admin';
  }): Promise<UserDocument> {
    const now = new Date().toISOString();
    const id = this.generateId('usr');
    const user: UserDocument = {
      _id: id,
      username: data.username.toLowerCase().trim(),
      displayName: data.displayName || data.username,
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      role: data.role || 'player',
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);

    // Create associated PlayerProfile
    const profileId = this.generateId('prf');
    const profile: PlayerProfileDocument = {
      _id: profileId,
      userId: id,
      appearance: { ...DEFAULT_APPEARANCE },
      inventory: { slots: [...DEFAULT_INVENTORY.slots] as any },
      progress: { ...DEFAULT_PROGRESS },
      stats: { ...DEFAULT_STATS },
      updatedAt: now,
    };
    this.profiles.set(id, profile);
    this.persist();

    return user;
  }

  async updateUser(id: string, updates: Partial<UserDocument>): Promise<UserDocument | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
    this.persist();
    return updated;
  }

  // --- PlayerProfile Collection ---
  async findProfileByUserId(userId: string): Promise<PlayerProfileDocument | null> {
    return this.profiles.get(userId) || null;
  }

  async updateProfile(userId: string, updates: Partial<PlayerProfileDocument>): Promise<PlayerProfileDocument | null> {
    const profile = this.profiles.get(userId);
    if (!profile) return null;
    const updated = {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, updated);
    this.persist();
    return updated;
  }

  // --- Level Records Collection ---
  async addRecord(record: Omit<LevelRecordDocument, '_id' | 'createdAt'>): Promise<LevelRecordDocument> {
    const fullRecord: LevelRecordDocument = {
      _id: this.generateId('rec'),
      ...record,
      createdAt: new Date().toISOString(),
    };
    this.records.push(fullRecord);
    this.persist();
    return fullRecord;
  }

  async getLeaderboard(levelId: number, mode: string = 'normal', limit: number = 50): Promise<LevelRecordDocument[]> {
    const canonical = normalizeGameMode(mode);

    if (this.mongoDb) {
      try {
        const queryModes =
          canonical === 'normal'
            ? ['normal', 'free']
            : canonical === 'contrareloj'
            ? ['contrareloj', 'time_trial']
            : ['persecucion', 'chase'];
        const docs = await this.mongoDb
          .collection<LevelRecordDocument>('level_records')
          .find({ levelId, mode: { $in: queryModes } as any })
          .sort({ timeSeconds: 1 })
          .limit(limit)
          .toArray();
        if (docs && docs.length > 0) return docs;
      } catch (err) {
        console.warn('[Database] MongoDB getLeaderboard query error:', err);
      }
    }

    const matchesMode = (rMode: string) => {
      const rCanonical = normalizeGameMode(rMode);
      return rCanonical === canonical;
    };

    return this.records
      .filter((r) => r.levelId === levelId && matchesMode(r.mode))
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, limit);
  }

  async getAllRecords(): Promise<LevelRecordDocument[]> {
    return [...this.records];
  }

  async searchUsersByUsername(query: string, excludeUserId?: string, limit = 20): Promise<UserDocument[]> {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return [];

    const results: UserDocument[] = [];
    for (const user of this.users.values()) {
      if (excludeUserId && user._id === excludeUserId) continue;
      if (!user.isActive) continue;
      if (
        user.username.includes(normalized) ||
        user.displayName.toLowerCase().includes(normalized)
      ) {
        results.push(user);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  private getFriendSet(userId: string): Set<string> {
    if (!this.friendships.has(userId)) {
      this.friendships.set(userId, new Set());
    }
    return this.friendships.get(userId)!;
  }

  async areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    return this.getFriendSet(userIdA).has(userIdB);
  }

  async listFriendIds(userId: string): Promise<string[]> {
    return Array.from(this.getFriendSet(userId));
  }

  async listFriends(userId: string): Promise<UserDocument[]> {
    const ids = await this.listFriendIds(userId);
    const friends: UserDocument[] = [];
    for (const id of ids) {
      const user = this.users.get(id);
      if (user) friends.push(user);
    }
    return friends;
  }

  async findPendingRequestBetween(fromUserId: string, toUserId: string): Promise<FriendRequestDocument | null> {
    for (const request of this.friendRequests.values()) {
      if (
        request.status === 'pending' &&
        request.fromUserId === fromUserId &&
        request.toUserId === toUserId
      ) {
        return request;
      }
    }
    return null;
  }

  async findFriendRequestById(requestId: string): Promise<FriendRequestDocument | null> {
    return this.friendRequests.get(requestId) || null;
  }

  async listPendingRequestsFor(userId: string): Promise<FriendRequestDocument[]> {
    return Array.from(this.friendRequests.values()).filter(
      (r) => r.status === 'pending' && r.toUserId === userId
    );
  }

  async listOutgoingPendingRequests(userId: string): Promise<FriendRequestDocument[]> {
    return Array.from(this.friendRequests.values()).filter(
      (r) => r.status === 'pending' && r.fromUserId === userId
    );
  }

  async sendFriendRequest(fromUserId: string, toUserId: string): Promise<FriendRequestDocument> {
    const now = new Date().toISOString();
    const request: FriendRequestDocument = {
      _id: this.generateId('frq'),
      fromUserId,
      toUserId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.friendRequests.set(request._id, request);
    this.persist();
    return request;
  }

  async acceptFriendRequest(requestId: string, acceptingUserId: string): Promise<FriendRequestDocument> {
    const request = this.friendRequests.get(requestId);
    if (!request) {
      const err: any = new Error('Friend request not found');
      err.status = 404;
      err.code = 'FRIEND_REQUEST_NOT_FOUND';
      throw err;
    }
    if (request.toUserId !== acceptingUserId) {
      const err: any = new Error('Only the recipient can accept this friend request');
      err.status = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (request.status !== 'pending') {
      const err: any = new Error('Friend request is no longer pending');
      err.status = 409;
      err.code = 'FRIEND_REQUEST_NOT_PENDING';
      throw err;
    }

    request.status = 'accepted';
    request.updatedAt = new Date().toISOString();
    this.friendRequests.set(requestId, request);

    this.getFriendSet(request.fromUserId).add(request.toUserId);
    this.getFriendSet(request.toUserId).add(request.fromUserId);
    this.persist();

    return request;
  }

  async declineFriendRequest(requestId: string, decliningUserId: string): Promise<FriendRequestDocument> {
    const request = this.friendRequests.get(requestId);
    if (!request) {
      const err: any = new Error('Friend request not found');
      err.status = 404;
      err.code = 'FRIEND_REQUEST_NOT_FOUND';
      throw err;
    }
    if (request.toUserId !== decliningUserId) {
      const err: any = new Error('Only the recipient can decline this friend request');
      err.status = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (request.status !== 'pending') {
      const err: any = new Error('Friend request is no longer pending');
      err.status = 409;
      err.code = 'FRIEND_REQUEST_NOT_PENDING';
      throw err;
    }

    request.status = 'declined';
    request.updatedAt = new Date().toISOString();
    this.friendRequests.set(requestId, request);
    this.persist();
    return request;
  }

  async removeFriend(userId: string, friendUserId: string): Promise<boolean> {
    const a = this.getFriendSet(userId);
    const b = this.getFriendSet(friendUserId);
    const removed = a.delete(friendUserId);
    b.delete(userId);
    this.persist();
    return removed;
  }

  // Seed default demonstration players
  private seedDefaultData() {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('CozyLeap123!', salt);

    const seedUsers = [
      {
        username: 'pionero_cozy',
        displayName: 'Pionero Cozy',
        email: 'pionero@cozyleap.com',
        role: 'admin' as const,
        appearance: {
          ...DEFAULT_APPEARANCE,
          companion: 'estrella' as const,
          shirtColor: '#059669',
          hat: 'gorro_explorador',
        },
        progress: {
          maxUnlockedLevel: 4,
          completedLevels: [1, 2, 3],
          totalCollectiblesFound: 38,
          unlockedCompanions: ['nube', 'estrella', 'luciernaga'] as any,
        },
      },
      {
        username: 'saltarin99',
        displayName: 'Saltarín 99',
        email: 'saltarin@cozyleap.com',
        role: 'player' as const,
        appearance: {
          ...DEFAULT_APPEARANCE,
          bodyType: 'chica' as const,
          hairStyle: 'ponytail',
          hairColor: '#d97706',
          companion: 'luciernaga' as const,
          shirtColor: '#db2777',
        },
        progress: {
          maxUnlockedLevel: 3,
          completedLevels: [1, 2],
          totalCollectiblesFound: 19,
          unlockedCompanions: ['nube', 'luciernaga'] as any,
        },
      },
      {
        username: 'luna_gamer',
        displayName: 'Luna Gamer',
        email: 'luna@cozyleap.com',
        role: 'player' as const,
        appearance: {
          ...DEFAULT_APPEARANCE,
          companion: 'hada' as const,
          shirtColor: '#8b5cf6',
          shoesColor: '#06b6d4',
        },
        progress: {
          maxUnlockedLevel: 2,
          completedLevels: [1],
          totalCollectiblesFound: 8,
          unlockedCompanions: ['nube', 'hada'] as any,
        },
      },
    ];

    for (const u of seedUsers) {
      const now = new Date().toISOString();
      const userId = this.generateId('usr');
      const userDoc: UserDocument = {
        _id: userId,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        passwordHash: hash,
        role: u.role,
        isActive: true,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(userId, userDoc);

      const profileDoc: PlayerProfileDocument = {
        _id: this.generateId('prf'),
        userId,
        appearance: u.appearance,
        inventory: { slots: ['baya', 'nuez', 'llave', 'baya', null] },
        progress: u.progress,
        stats: {
          totalPlayTimeSeconds: 4200,
          totalJumps: 145,
          totalFalls: 12,
        },
        updatedAt: now,
      };
      this.profiles.set(userId, profileDoc);
    }
  }
}

export const db = new InMemoryDatabase();
