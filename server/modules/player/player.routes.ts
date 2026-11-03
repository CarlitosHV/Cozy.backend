import { Router } from 'express';
import { PlayerController } from './player.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { appearanceSchema, completeLevelSchema, inventorySchema } from './player.schema.js';

const router = Router();

// All player routes require JWT Authentication (Section 6)
router.use(requireAuth);

// GET /api/v1/player/me
router.get('/me', PlayerController.getMe);

// PUT /api/v1/player/appearance
router.put('/appearance', validateBody(appearanceSchema), PlayerController.updateAppearance);

// PUT /api/v1/player/inventory
router.put('/inventory', validateBody(inventorySchema), PlayerController.updateInventory);

// POST /api/v1/player/complete-level
router.post('/complete-level', validateBody(completeLevelSchema), PlayerController.completeLevel);

export default router;
