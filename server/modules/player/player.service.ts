import { CONFIG } from '../../config/env.js';
import { db } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import {
  CharacterAppearance,
  InventoryStatus,
  LevelRecordDocument,
  PlayerProfileDocument,
  UserDocument,
} from '../../models/types.js';

export class PlayerService {
  static async getMe(userId: string): Promise<{
    user: Omit<UserDocument, 'passwordHash'>;
    appearance: CharacterAppearance;
    inventory: InventoryStatus;
    progress: PlayerProfileDocument['progress'];
    stats: PlayerProfileDocument['stats'];
  }> {
    const user = await db.findUserById(userId);
    if (!user) {
      const err: any = new Error('User not found');
      err.status = 404;
      throw err;
    }

    let profile = await db.findProfileByUserId(userId);
    if (!profile) {
      profile = await db.updateProfile(userId, {});
      if (!profile) {
        const err: any = new Error('Profile could not be initialized');
        err.status = 500;
        throw err;
      }
    }

    const { passwordHash: _, ...safeUser } = user;
    return {
      user: safeUser,
      appearance: profile.appearance,
      inventory: profile.inventory,
      progress: profile.progress,
      stats: profile.stats,
    };
  }

  static async updateAppearance(userId: string, appearance: CharacterAppearance): Promise<CharacterAppearance> {
    const profile = await db.findProfileByUserId(userId);
    if (!profile) {
      const err: any = new Error('Player profile not found');
      err.status = 404;
      throw err;
    }

    const updated = await db.updateProfile(userId, { appearance });
    return updated!.appearance;
  }

  static async updateInventory(userId: string, inventory: InventoryStatus): Promise<InventoryStatus> {
    const profile = await db.findProfileByUserId(userId);
    if (!profile) {
      const err: any = new Error('Player profile not found');
      err.status = 404;
      throw err;
    }

    const updated = await db.updateProfile(userId, { inventory });
    return updated!.inventory;
  }

  static async completeLevel(
    userId: string,
    data: {
      levelId: number;
      timeSeconds: number;
      relicsFound: number;
      mode?: 'free' | 'time_trial' | 'chase';
      authTicket?: string;
    }
  ): Promise<{
    record: LevelRecordDocument;
    rank: number;
    isNewBest: boolean;
    progress: PlayerProfileDocument['progress'];
    antiCheatCheck: { passed: boolean; verifiedAt: string; minPhysicalTime: number };
  }> {
    const user = await db.findUserById(userId);
    const profile = await db.findProfileByUserId(userId);

    if (!user || !profile) {
      const err: any = new Error('Player not found');
      err.status = 404;
      throw err;
    }

    const mode = data.mode || 'time_trial';

    // 1. Level Authority Validation (Must have unlocked level)
    if (data.levelId > profile.progress.maxUnlockedLevel) {
      const err: any = new Error(
        `Level authority rejection: Level ${data.levelId} is locked. You must complete level ${data.levelId - 1} first.`
      );
      err.status = 403;
      err.code = 'LEVEL_LOCKED';
      throw err;
    }

    // 2. Physics & Anti-Cheat Validation
    const minPhysicalTime = CONFIG.MIN_LEVEL_PHYSICAL_SECONDS[data.levelId] || 3.0;
    if (data.timeSeconds < minPhysicalTime) {
      const err: any = new Error(
        `Anti-Cheat Rejection: Completion time ${data.timeSeconds}s is below the physical threshold of ${minPhysicalTime}s for Level ${data.levelId}.`
      );
      err.status = 400;
      err.code = 'SPEED_HACK_DETECTED';
      throw err;
    }

    // 3. Update Progress
    const completedSet = new Set(profile.progress.completedLevels);
    completedSet.add(data.levelId);
    const nextUnlock = Math.max(profile.progress.maxUnlockedLevel, data.levelId + 1);

    const updatedProgress = {
      ...profile.progress,
      maxUnlockedLevel: nextUnlock,
      completedLevels: Array.from(completedSet).sort((a, b) => a - b),
      totalCollectiblesFound: profile.progress.totalCollectiblesFound + (data.relicsFound || 0),
    };

    const updatedStats = {
      ...profile.stats,
      totalPlayTimeSeconds: profile.stats.totalPlayTimeSeconds + Math.round(data.timeSeconds),
    };

    await db.updateProfile(userId, {
      progress: updatedProgress,
      stats: updatedStats,
    });

    // 4. Save Level Record
    const record = await db.addRecord({
      userId,
      username: user.displayName || user.username,
      levelId: data.levelId,
      mode,
      timeSeconds: Number(data.timeSeconds.toFixed(2)),
      collectiblesFound: data.relicsFound || 0,
    });

    // 5. Update Redis Leaderboard Sorted Set
    const leaderboardKey = `leaderboard:level:${data.levelId}:${mode}`;
    const memberTag = `${userId}|${user.displayName || user.username}`;
    redis.zadd(leaderboardKey, record.timeSeconds, memberTag);

    const rank = (redis.zrank(leaderboardKey, memberTag) ?? 0) + 1;

    return {
      record,
      rank,
      isNewBest: true,
      progress: updatedProgress,
      antiCheatCheck: {
        passed: true,
        verifiedAt: new Date().toISOString(),
        minPhysicalTime,
      },
    };
  }
}
