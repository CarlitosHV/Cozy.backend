import { Request, Response } from 'express';
import { db } from '../../config/database.js';
import { redis } from '../../config/redis.js';

export class LeaderboardController {
  static async getByLevelId(req: Request, res: Response): Promise<void> {
    try {
      const levelId = Number(req.params.levelId);
      if (isNaN(levelId) || levelId < 1) {
        res.status(400).json({
          status: 'error',
          code: 'INVALID_LEVEL_ID',
          message: 'Level ID must be a valid positive integer',
        });
        return;
      }

      const mode = (req.query.mode as string) || 'time_trial';
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      // Check fast path: Redis Sorted Set
      const redisKey = `leaderboard:level:${levelId}:${mode}`;
      const sortedSet = redis.zrange(redisKey, 0, limit - 1);

      let entries: Array<{
        rank: number;
        userId: string;
        username: string;
        timeSeconds: number;
        collectiblesFound?: number;
      }> = [];

      if (sortedSet && sortedSet.length > 0) {
        entries = sortedSet.map((item, index) => {
          const [userId, username] = item.member.split('|');
          return {
            rank: index + 1,
            userId,
            username: username || 'Player',
            timeSeconds: Number(item.score.toFixed(2)),
          };
        });
      } else {
        // Fallback to database records and warm Redis
        const records = await db.getLeaderboard(levelId, mode, limit);
        entries = records.map((r, i) => {
          const memberTag = `${r.userId}|${r.username}`;
          redis.zadd(redisKey, r.timeSeconds, memberTag);
          return {
            rank: i + 1,
            userId: r.userId,
            username: r.username,
            timeSeconds: r.timeSeconds,
            collectiblesFound: r.collectiblesFound,
          };
        });
      }

      res.status(200).json({
        status: 'success',
        levelId,
        mode,
        count: entries.length,
        leaderboard: entries,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        code: 'LEADERBOARD_FETCH_FAILED',
        message: err.message || 'Error fetching leaderboard',
      });
    }
  }
}
