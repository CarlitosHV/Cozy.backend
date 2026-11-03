import { Router } from 'express';
import { LeaderboardController } from './leaderboard.controller.js';

const router = Router();

// GET /api/v1/leaderboard/:levelId
router.get('/:levelId', LeaderboardController.getByLevelId);

export default router;
