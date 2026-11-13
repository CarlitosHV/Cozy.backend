import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../../config/env.js';
import { JwtPayload } from '../../models/types.js';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { ShopService } from './shop.service.js';

function tryExtractUserId(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }
  if (!token) return undefined;
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as JwtPayload;
    return decoded.sub;
  } catch {
    return undefined;
  }
}

export class ShopController {
  static async getCatalog(req: Request, res: Response): Promise<void> {
    try {
      const userId = tryExtractUserId(req);
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const rarity = typeof req.query.rarity === 'string' ? req.query.rarity : undefined;
      const onlyOwned = req.query.onlyOwned === 'true';

      const data = await ShopService.getCatalog(userId, { category, rarity, onlyOwned });
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'SHOP_CATALOG_FAILED',
        message: err.message || 'Error fetching shop catalog',
      });
    }
  }

  static async getInventory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const data = await ShopService.getPlayerInventory(userId);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'SHOP_INVENTORY_FAILED',
        message: err.message || 'Error fetching shop inventory',
      });
    }
  }

  static async purchase(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const { itemId, autoEquip } = req.body;
      const result = await ShopService.purchaseItem(userId, itemId, Boolean(autoEquip));
      res.status(200).json({
        status: 'success',
        message: `'${result.purchasedItem.name}' desbloqueado con éxito`,
        data: result,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        status: 'error',
        code: err.code || 'SHOP_PURCHASE_FAILED',
        message: err.message || 'Error purchasing item',
        ...(err.details ? { details: err.details } : {}),
      });
    }
  }

  static async equip(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const itemIds: string[] = req.body.itemIds
        ? req.body.itemIds
        : req.body.itemId
        ? [req.body.itemId]
        : [];
      const result = await ShopService.equipItems(userId, itemIds);
      res.status(200).json({
        status: 'success',
        message: 'Cosmetic appearance updated',
        data: result,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        status: 'error',
        code: err.code || 'SHOP_EQUIP_FAILED',
        message: err.message || 'Error equipping shop item',
        ...(err.details ? { details: err.details } : {}),
      });
    }
  }
}
