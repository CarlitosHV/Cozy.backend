import { Request, Response } from 'express';
import { db } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { CanonicalGameMode, normalizeGameMode } from '../../models/types.js';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  timeSeconds: number;
  collectiblesFound: number;
  createdAt?: string;
}

async function fetchModeLeaderboard(
  levelId: number,
  mode: CanonicalGameMode,
  limit: number
): Promise<LeaderboardEntry[]> {
  const redisKey = `leaderboard:level:${levelId}:${mode}`;
  const sortedSet = redis.zrange(redisKey, 0, limit - 1);

  if (sortedSet && sortedSet.length > 0) {
    return sortedSet.map((item, index) => {
      const [userId, username] = item.member.split('|');
      return {
        rank: index + 1,
        userId,
        username: username || 'Jugador',
        timeSeconds: Number(item.score.toFixed(2)),
        collectiblesFound: 0,
      };
    });
  }

  // Fallback to real DB records and warm Redis sorted set
  const records = await db.getLeaderboard(levelId, mode, limit);
  return records.map((r, i) => {
    const memberTag = `${r.userId}|${r.username}`;
    redis.zadd(redisKey, r.timeSeconds, memberTag);
    return {
      rank: i + 1,
      userId: r.userId,
      username: r.username,
      timeSeconds: r.timeSeconds,
      collectiblesFound: r.collectiblesFound || 0,
      createdAt: r.createdAt,
    };
  });
}

export class LeaderboardController {
  /**
   * GET /api/v1/leaderboard/:levelId
   * Devuelve las tablas de ranking de los 3 modos: "normal", "contrareloj" y "persecución".
   * Sin registros falsos: solo partidas reales registradas.
   */
  static async getByLevelId(req: Request, res: Response): Promise<void> {
    try {
      const levelId = Number(req.params.levelId);
      if (isNaN(levelId) || levelId < 1) {
        res.status(400).json({
          status: 'error',
          code: 'INVALID_LEVEL_ID',
          message: 'El parámetro levelId debe ser un número entero positivo',
        });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const requestedMode = req.query.mode ? normalizeGameMode(req.query.mode as string) : undefined;

      // Obtener simultáneamente los 3 rankings: normal, contrareloj y persecucion
      const [normal, contrareloj, persecucion] = await Promise.all([
        fetchModeLeaderboard(levelId, 'normal', limit),
        fetchModeLeaderboard(levelId, 'contrareloj', limit),
        fetchModeLeaderboard(levelId, 'persecucion', limit),
      ]);

      const tables = {
        normal,
        contrareloj,
        persecucion,
      };

      const counts = {
        normal: normal.length,
        contrareloj: contrareloj.length,
        persecucion: persecucion.length,
        total: normal.length + contrareloj.length + persecucion.length,
      };

      // Si se pidió un modo específico, se incluye también en "leaderboard" para compatibilidad
      const selectedList = requestedMode ? tables[requestedMode] : tables.normal;

      res.status(200).json({
        status: 'success',
        levelId,
        mode: requestedMode || 'all',
        count: selectedList.length,
        leaderboard: selectedList,
        tables,
        rankings: tables,
        counts,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        code: 'LEADERBOARD_FETCH_FAILED',
        message: err.message || 'Error al obtener tablas de ranking',
      });
    }
  }

  /**
   * GET /api/v1/leaderboard
   * Devuelve un resumen de tablas de ranking para todos los niveles activos (1 al 5).
   */
  static async getAllLevels(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const levels = [1, 2, 3, 4, 5];

      const levelsData: Record<number, any> = {};

      await Promise.all(
        levels.map(async (lvl) => {
          const [normal, contrareloj, persecucion] = await Promise.all([
            fetchModeLeaderboard(lvl, 'normal', limit),
            fetchModeLeaderboard(lvl, 'contrareloj', limit),
            fetchModeLeaderboard(lvl, 'persecucion', limit),
          ]);
          levelsData[lvl] = {
            normal,
            contrareloj,
            persecucion,
            totalRecords: normal.length + contrareloj.length + persecucion.length,
          };
        })
      );

      res.status(200).json({
        status: 'success',
        levels: levelsData,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        code: 'LEADERBOARD_FETCH_FAILED',
        message: err.message || 'Error al obtener rankings de niveles',
      });
    }
  }
}
