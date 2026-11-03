import bcrypt from 'bcryptjs';
import {
  CharacterAppearance,
  InventoryStatus,
  LevelRecordDocument,
  PlayerProfileDocument,
  PlayerProgress,
  PlayerStats,
  UserDocument,
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

  constructor() {
    this.seedDefaultData();
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

    return user;
  }

  async updateUser(id: string, updates: Partial<UserDocument>): Promise<UserDocument | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
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
    return fullRecord;
  }

  async getLeaderboard(levelId: number, mode: string = 'time_trial', limit: number = 50): Promise<LevelRecordDocument[]> {
    return this.records
      .filter((r) => r.levelId === levelId && r.mode === mode)
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .slice(0, limit);
  }

  async getAllRecords(): Promise<LevelRecordDocument[]> {
    return [...this.records];
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

      // Seed some level records
      this.records.push({
        _id: this.generateId('rec'),
        userId,
        username: u.displayName,
        levelId: 1,
        mode: 'time_trial',
        timeSeconds: u.username === 'pionero_cozy' ? 14.82 : u.username === 'saltarin99' ? 17.45 : 22.18,
        collectiblesFound: 5,
        createdAt: now,
      });

      if (u.progress.completedLevels.includes(2)) {
        this.records.push({
          _id: this.generateId('rec'),
          userId,
          username: u.displayName,
          levelId: 2,
          mode: 'time_trial',
          timeSeconds: u.username === 'pionero_cozy' ? 24.31 : 29.88,
          collectiblesFound: 7,
          createdAt: now,
        });
      }
    }
  }
}

export const db = new InMemoryDatabase();
