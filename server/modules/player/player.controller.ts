import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { PlayerService } from './player.service.js';

export class PlayerController {
  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const data = await PlayerService.getMe(userId);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'PLAYER_FETCH_FAILED',
        message: err.message || 'Error fetching player profile',
      });
    }
  }

  static async updateAppearance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const appearance = await PlayerService.updateAppearance(userId, req.body);
      res.status(200).json({
        status: 'success',
        message: 'Character appearance updated successfully',
        data: { appearance },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'APPEARANCE_UPDATE_FAILED',
        message: err.message || 'Error updating character appearance',
      });
    }
  }

  static async updateInventory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const inventory = await PlayerService.updateInventory(userId, req.body);
      res.status(200).json({
        status: 'success',
        message: 'Inventory slots updated successfully',
        data: { inventory },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'INVENTORY_UPDATE_FAILED',
        message: err.message || 'Error updating inventory',
      });
    }
  }

  static async completeLevel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const result = await PlayerService.completeLevel(userId, req.body);
      res.status(200).json({
        status: 'success',
        message: 'Level completion validated and recorded',
        data: result,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        status: 'error',
        code: err.code || 'LEVEL_COMPLETION_FAILED',
        message: err.message || 'Error validating level completion',
      });
    }
  }
}
