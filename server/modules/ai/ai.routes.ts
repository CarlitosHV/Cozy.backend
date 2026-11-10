import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { redis } from '../../config/redis.js';
import { CONFIG } from '../../config/env.js';
import { directCopies, sanitizeInput } from './ai.service.js';

const router = Router();

// GET /api/v1/ai/status - Is the AI director available? (no secrets)
router.get('/status', (_req, res: Response) => {
  res.status(200).json({ status: 'success', data: { enabled: Boolean(CONFIG.XAI_API_KEY), model: CONFIG.XAI_MODEL } });
});

// POST /api/v1/ai/skinwalker - What each copy of the Skinwalker does next
router.post('/skinwalker', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.sub || 'anon';
  // One decision every few seconds per player, and a global cap to protect the bill
  const mine = redis.incrementRateLimit(`ai:sk:${userId}`, CONFIG.XAI_MIN_INTERVAL_S);
  const all = redis.incrementRateLimit('ai:sk:global', 60);
  if (mine.count > 1 || all.count > CONFIG.XAI_MAX_PER_MIN) {
    res.status(429).json({ status: 'error', code: 'AI_BUSY', message: 'Demasiadas consultas a la IA, espera un momento', retryAfterSeconds: mine.ttl || 5 });
    return;
  }
  try {
    const data = await directCopies(sanitizeInput(req.body));
    res.status(200).json({ status: 'success', data });
  } catch (err: any) {
    res.status(err?.status || 500).json({ status: 'error', code: err?.code || 'AI_ERROR', message: err?.message || 'Error de la IA' });
  }
});

export default router;
