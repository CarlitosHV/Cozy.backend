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

export const DEFAULT_UNLOCKED_SHOP_ITEMS: string[] = [
  'skin_natural',
  'hat_none',
  'hat_beanie_cozy',
  'outfit_default',
  'pattern_solid',
  'glasses_none',
  'backpack_explorer',
  'hair_cozy_messy',
  'companion_nube',
];

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
    if (!CONFIG.MONGODB_URI) {
      console.log('[Database] No MONGODB_URI configured. Operating in local storage mode.');
      return false;
    }
    try {
      this.mongoClient = new MongoClient(CONFIG.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db();
      console.log(`[Database] Connected to external MongoDB successfully at ${CONFIG.MONGODB_URI}`);

      // Ensure necessary indexes exist
      await this.ensureIndexes();

      // Hydrate in-memory state from MongoDB
      await this.hydrateFromMongo();

      return true;
    } catch (err: any) {
      console.warn(`[Database] Could not connect to external MongoDB (${err.message}). Using persistent local storage fallback.`);
      this.mongoDb = null;
      return false;
    }
  }

  private col(name: string) {
    return this.mongoDb!.collection<any>(name);
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.mongoDb) return;
    try {
      await this.col('users').createIndex({ email: 1 }, { unique: true, background: true });
      await this.col('users').createIndex({ username: 1 }, { unique: true, background: true });
      await this.col('player_profiles').createIndex({ userId: 1 }, { unique: true, background: true });
      await this.col('level_records').createIndex({ levelId: 1, mode: 1, timeSeconds: 1 }, { background: true });
      await this.col('friend_requests').createIndex({ toUserId: 1, status: 1 }, { background: true });
      await this.col('friend_requests').createIndex({ fromUserId: 1, toUserId: 1 }, { background: true });
      await this.col('friendships').createIndex({ userId: 1 }, { unique: true, background: true });
    } catch (err: any) {
      console.warn('[Database] Index creation notice:', err.message);
    }
  }

  private async hydrateFromMongo(): Promise<void> {
    if (!this.mongoDb) return;
    try {
      const usersCount = await this.col('users').countDocuments();
      if (usersCount === 0) {
        console.log('[Database] External MongoDB is empty. Seeding initial baseline accounts into MongoDB...');
        this.seedDefaultData();
        for (const user of this.users.values()) {
          await this.col('users').replaceOne({ _id: user._id }, user, { upsert: true });
        }
        for (const profile of this.profiles.values()) {
          await this.col('player_profiles').replaceOne({ userId: profile.userId }, profile, { upsert: true });
        }
        console.log('[Database] Initial baseline accounts saved directly to external MongoDB.');
        return;
      }

      // Load all from MongoDB
      const mongoUsers = await this.mongoDb.collection<UserDocument>('users').find().toArray();
      this.users.clear();
      for (const u of mongoUsers) {
        this.users.set(u._id, u);
      }

      const mongoProfiles = await this.mongoDb.collection<PlayerProfileDocument>('player_profiles').find().toArray();
      this.profiles.clear();
      for (const p of mongoProfiles) {
        this.profiles.set(p.userId, p);
      }

      const mongoRecords = await this.mongoDb.collection<LevelRecordDocument>('level_records').find().toArray();
      this.records = mongoRecords;

      const mongoRequests = await this.mongoDb.collection<FriendRequestDocument>('friend_requests').find().toArray();
      this.friendRequests.clear();
      for (const r of mongoRequests) {
        this.friendRequests.set(r._id, r);
      }

      const mongoFriendships = await this.mongoDb.collection<{ userId: string; friendIds: string[] }>('friendships').find().toArray();
      this.friendships.clear();
      for (const f of mongoFriendships) {
        this.friendships.set(f.userId, new Set(f.friendIds || []));
      }

      console.log(`[Database] Hydrated from external MongoDB: ${this.users.size} users, ${this.profiles.size} profiles, ${this.records.length} records.`);
    } catch (err: any) {
      console.error('[Database] Error hydrating from MongoDB:', err.message);
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
    if (this.mongoDb) {
      try {
        const user = await this.mongoDb.collection<UserDocument>('users').findOne({ _id: id });
        if (user) {
          this.users.set(user._id, user);
          return user;
        }
      } catch (err: any) {
        console.warn(`[Database] MongoDB findUserById error: ${err.message}`);
      }
    }
    return this.users.get(id) || null;
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    const normalized = email.toLowerCase().trim();
    if (this.mongoDb) {
      try {
        const user = await this.mongoDb.collection<UserDocument>('users').findOne({ email: normalized });
        if (user) {
          this.users.set(user._id, user);
          return user;
        }
      } catch (err: any) {
        console.warn(`[Database] MongoDB findUserByEmail error: ${err.message}`);
      }
    }
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findUserByUsername(username: string): Promise<UserDocument | null> {
    const normalized = username.toLowerCase().trim();
    if (this.mongoDb) {
      try {
        const user = await this.mongoDb.collection<UserDocument>('users').findOne({ username: normalized });
        if (user) {
          this.users.set(user._id, user);
          return user;
        }
      } catch (err: any) {
        console.warn(`[Database] MongoDB findUserByUsername error: ${err.message}`);
      }
    }
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

    // Create associated PlayerProfile
    const profileId = this.generateId('prf');
    const profile: PlayerProfileDocument = {
      _id: profileId,
      userId: id,
      appearance: { ...DEFAULT_APPEARANCE },
      inventory: { slots: [...DEFAULT_INVENTORY.slots] as any },
      progress: { ...DEFAULT_PROGRESS },
      stats: { ...DEFAULT_STATS },
      relicsBalance: 0,
      unlockedItems: [...DEFAULT_UNLOCKED_SHOP_ITEMS],
      purchaseHistory: [],
      updatedAt: now,
    };

    this.users.set(id, user);
    this.profiles.set(id, profile);
    this.persist();

    if (this.mongoDb) {
      try {
        await this.col('users').insertOne({ ...user });
        await this.col('player_profiles').insertOne({ ...profile });
        console.log(`[Database] Persisted new user ${user.username} (${user._id}) to external MongoDB`);
      } catch (err: any) {
        console.error(`[Database] Failed to write user to MongoDB: ${err.message}`);
      }
    }

    return user;
  }

  async updateUser(id: string, updates: Partial<UserDocument>): Promise<UserDocument | null> {
    const user = await this.findUserById(id);
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
    this.persist();

    if (this.mongoDb) {
      try {
        await this.col('users').updateOne(
          { _id: id },
          { $set: { ...updates, updatedAt: updated.updatedAt } }
        );
      } catch (err: any) {
        console.warn(`[Database] MongoDB updateUser error: ${err.message}`);
      }
    }

    return updated;
  }

  // --- PlayerProfile Collection ---
  async findProfileByUserId(userId: string): Promise<PlayerProfileDocument | null> {
    if (this.mongoDb) {
      try {
        const profile = await this.mongoDb.collection<PlayerProfileDocument>('player_profiles').findOne({ userId });
        if (profile) {
          this.profiles.set(userId, profile);
          return profile;
        }
      } catch (err: any) {
        console.warn(`[Database] MongoDB findProfileByUserId error: ${err.message}`);
      }
    }
    return this.profiles.get(userId) || null;
  }

  async updateProfile(userId: string, updates: Partial<PlayerProfileDocument>): Promise<PlayerProfileDocument | null> {
    let profile = await this.findProfileByUserId(userId);
    const now = new Date().toISOString();
    if (!profile) {
      profile = {
        _id: this.generateId('prf'),
        userId,
        appearance: { ...DEFAULT_APPEARANCE },
        inventory: { slots: [...DEFAULT_INVENTORY.slots] as any },
        progress: { ...DEFAULT_PROGRESS },
        stats: { ...DEFAULT_STATS },
        relicsBalance: 0,
        unlockedItems: [...DEFAULT_UNLOCKED_SHOP_ITEMS],
        purchaseHistory: [],
        updatedAt: now,
      };
    }
    const updated: PlayerProfileDocument = {
      ...profile,
      ...updates,
      updatedAt: now,
    };
    this.profiles.set(userId, updated);
    this.persist();

    if (this.mongoDb) {
      try {
        await this.mongoDb.collection('player_profiles').updateOne(
          { userId },
          { $set: { ...updates, updatedAt: now } },
          { upsert: true }
        );
      } catch (err: any) {
        console.warn(`[Database] MongoDB updateProfile error: ${err.message}`);
      }
    }

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

    if (this.mongoDb) {
      try {
        await this.col('level_records').insertOne({ ...fullRecord });
        console.log(`[Database] Persisted level record for ${fullRecord.username} (Level ${fullRecord.levelId}, ${fullRecord.timeSeconds}s) to external MongoDB`);
      } catch (err: any) {
        console.error(`[Database] Failed to write level record to MongoDB: ${err.message}`);
      }
    }

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
          .sort({ score: -1, timeSeconds: 1 })
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
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.timeSeconds - b.timeSeconds)
      .slice(0, limit);
  }

  async getAllRecords(): Promise<LevelRecordDocument[]> {
    if (this.mongoDb) {
      try {
        const docs = await this.mongoDb.collection<LevelRecordDocument>('level_records').find().toArray();
        if (docs && docs.length > 0) return docs;
      } catch (err: any) {
        console.warn(`[Database] MongoDB getAllRecords error: ${err.message}`);
      }
    }
    return [...this.records];
  }

  async searchUsersByUsername(query: string, excludeUserId?: string, limit = 20): Promise<UserDocument[]> {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return [];

    if (this.mongoDb) {
      try {
        const filter: any = {
          $or: [
            { username: { $regex: normalized, $options: 'i' } },
            { displayName: { $regex: normalized, $options: 'i' } },
          ],
          isActive: true,
        };
        if (excludeUserId) {
          filter._id = { $ne: excludeUserId };
        }
        const docs = await this.mongoDb.collection<UserDocument>('users').find(filter).limit(limit).toArray();
        if (docs && docs.length > 0) return docs;
      } catch (err: any) {
        console.warn(`[Database] MongoDB searchUsersByUsername error: ${err.message}`);
      }
    }

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
    if (this.mongoDb) {
      try {
        const doc = await this.mongoDb.collection('friendships').findOne({ userId: userIdA, friendIds: userIdB });
        if (doc) return true;
      } catch (err: any) {
        console.warn(`[Database] MongoDB areFriends error: ${err.message}`);
      }
    }
    return this.getFriendSet(userIdA).has(userIdB);
  }

  async listFriendIds(userId: string): Promise<string[]> {
    if (this.mongoDb) {
      try {
        const doc = await this.mongoDb.collection<{ userId: string; friendIds: string[] }>('friendships').findOne({ userId });
        if (doc && Array.isArray(doc.friendIds)) {
          this.friendships.set(userId, new Set(doc.friendIds));
          return doc.friendIds;
        }
      } catch (err: any) {
        console.warn(`[Database] MongoDB listFriendIds error: ${err.message}`);
      }
    }
    return Array.from(this.getFriendSet(userId));
  }

  async listFriends(userId: string): Promise<UserDocument[]> {
    const ids = await this.listFriendIds(userId);
    if (ids.length === 0) return [];

    if (this.mongoDb) {
      try {
        const docs = await this.mongoDb.collection<UserDocument>('users').find({ _id: { $in: ids } }).toArray();
        if (docs && docs.length > 0) return docs;
      } catch (err: any) {
        console.warn(`[Database] MongoDB listFriends error: ${err.message}`);
      }
    }

    const friends: UserDocument[] = [];
    for (const id of ids) {
      const user = await this.findUserById(id);
      if (user) friends.push(user);
    }
    return friends;
  }

  async findPendingRequestBetween(fromUserId: string, toUserId: string): Promise<FriendRequestDocument | null> {
    if (this.mongoDb) {
      try {
        const doc = await this.mongoDb.collection<FriendRequestDocument>('friend_requests').findOne({
          fromUserId,
          toUserId,
          status: 'pending',
        });
        if (doc) return doc;
      } catch (err: any) {
        console.warn(`[Database] MongoDB findPendingRequestBetween error: ${err.message}`);
      }
    }
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
    if (this.mongoDb) {
      try {
        const doc = await this.mongoDb.collection<FriendRequestDocument>('friend_requests').findOne({ _id: requestId });
        if (doc) return doc;
      } catch (err: any) {
        console.warn(`[Database] MongoDB findFriendRequestById error: ${err.message}`);
      }
    }
    return this.friendRequests.get(requestId) || null;
  }

  async listPendingRequestsFor(userId: string): Promise<FriendRequestDocument[]> {
    if (this.mongoDb) {
      try {
        const docs = await this.mongoDb.collection<FriendRequestDocument>('friend_requests').find({
          toUserId: userId,
          status: 'pending',
        }).toArray();
        if (docs) return docs;
      } catch (err: any) {
        console.warn(`[Database] MongoDB listPendingRequestsFor error: ${err.message}`);
      }
    }
    return Array.from(this.friendRequests.values()).filter(
      (r) => r.status === 'pending' && r.toUserId === userId
    );
  }

  async listOutgoingPendingRequests(userId: string): Promise<FriendRequestDocument[]> {
    if (this.mongoDb) {
      try {
        const docs = await this.mongoDb.collection<FriendRequestDocument>('friend_requests').find({
          fromUserId: userId,
          status: 'pending',
        }).toArray();
        if (docs) return docs;
      } catch (err: any) {
        console.warn(`[Database] MongoDB listOutgoingPendingRequests error: ${err.message}`);
      }
    }
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

    if (this.mongoDb) {
      try {
        await this.col('friend_requests').insertOne({ ...request });
      } catch (err: any) {
        console.warn(`[Database] MongoDB sendFriendRequest error: ${err.message}`);
      }
    }

    return request;
  }

  async acceptFriendRequest(requestId: string, acceptingUserId: string): Promise<FriendRequestDocument> {
    const request = await this.findFriendRequestById(requestId);
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

    const now = new Date().toISOString();
    request.status = 'accepted';
    request.updatedAt = now;
    this.friendRequests.set(requestId, request);

    this.getFriendSet(request.fromUserId).add(request.toUserId);
    this.getFriendSet(request.toUserId).add(request.fromUserId);
    this.persist();

    if (this.mongoDb) {
      try {
        await this.col('friend_requests').updateOne({ _id: requestId }, { $set: { status: 'accepted', updatedAt: now } });
        await this.col('friendships').updateOne(
          { userId: request.fromUserId },
          { $addToSet: { friendIds: request.toUserId } as any },
          { upsert: true }
        );
        await this.col('friendships').updateOne(
          { userId: request.toUserId },
          { $addToSet: { friendIds: request.fromUserId } as any },
          { upsert: true }
        );
      } catch (err: any) {
        console.warn(`[Database] MongoDB acceptFriendRequest error: ${err.message}`);
      }
    }

    return request;
  }

  async declineFriendRequest(requestId: string, decliningUserId: string): Promise<FriendRequestDocument> {
    const request = await this.findFriendRequestById(requestId);
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

    const now = new Date().toISOString();
    request.status = 'declined';
    request.updatedAt = now;
    this.friendRequests.set(requestId, request);
    this.persist();

    if (this.mongoDb) {
      try {
        await this.col('friend_requests').updateOne({ _id: requestId }, { $set: { status: 'declined', updatedAt: now } });
      } catch (err: any) {
        console.warn(`[Database] MongoDB declineFriendRequest error: ${err.message}`);
      }
    }

    return request;
  }

  async removeFriend(userId: string, friendUserId: string): Promise<boolean> {
    const a = this.getFriendSet(userId);
    const b = this.getFriendSet(friendUserId);
    const removed = a.delete(friendUserId);
    b.delete(userId);
    this.persist();

    if (this.mongoDb) {
      try {
        await this.mongoDb.collection('friendships').updateOne({ userId }, { $pull: { friendIds: friendUserId } as any });
        await this.mongoDb.collection('friendships').updateOne({ userId: friendUserId }, { $pull: { friendIds: userId } as any });
      } catch (err: any) {
        console.warn(`[Database] MongoDB removeFriend error: ${err.message}`);
      }
    }

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
        relicsBalance: u.progress.totalCollectiblesFound || 0,
        unlockedItems: [
          ...DEFAULT_UNLOCKED_SHOP_ITEMS,
          ...u.progress.unlockedCompanions.map((c: string) => `companion_${c}`),
        ],
        purchaseHistory: [],
        updatedAt: now,
      };
      this.profiles.set(userId, profileDoc);
    }
  }
}

export const db = new InMemoryDatabase();
