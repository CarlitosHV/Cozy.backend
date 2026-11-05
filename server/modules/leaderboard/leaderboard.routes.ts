import { Router } from 'express';
import { LeaderboardController } from './leaderboard.controller.js';

const router = Router();

// GET /api/v1/leaderboard (resumen de todos los niveles)
router.get('/', LeaderboardController.getAllLevels);

// GET /api/v1/leaderboard/:levelId (retorna tablas de normal, contrareloj y persecucion)
router.get('/:levelId', LeaderboardController.getByLevelId);

export default router;
