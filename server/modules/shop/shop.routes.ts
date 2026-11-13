import { Router } from 'express';
import { ShopController } from './shop.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { equipItemSchema, purchaseItemSchema } from './shop.schema.js';

const router = Router();

// GET /api/v1/shop/catalog - Browse all unlockable items (optional JWT marks owned/equipped)
router.get('/catalog', ShopController.getCatalog);

// GET /api/v1/shop/inventory - Get player's spendable relics balance & unlocked items
router.get('/inventory', requireAuth, ShopController.getInventory);

// POST /api/v1/shop/purchase - Spend relics to unlock an item
router.post('/purchase', requireAuth, validateBody(purchaseItemSchema), ShopController.purchase);

// POST /api/v1/shop/equip - Equip one or more unlocked shop items onto character appearance
router.post('/equip', requireAuth, validateBody(equipItemSchema), ShopController.equip);

export default router;
