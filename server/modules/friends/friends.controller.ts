import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { FriendsService } from './friends.service.js';

export class FriendsController {
  static async listFriends(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const friends = await FriendsService.listFriends(req.user!.sub);
      res.status(200).json({
        status: 'success',
        data: { friends },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIENDS_LIST_FAILED',
        message: err.message || 'Error fetching friends list',
      });
    }
  }

  static async listRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const requests = await FriendsService.listPendingRequests(req.user!.sub);
      res.status(200).json({
        status: 'success',
        data: { requests },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIEND_REQUESTS_FAILED',
        message: err.message || 'Error fetching friend requests',
      });
    }
  }

  static async search(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const query = String(req.query.q || '');
      const results = await FriendsService.searchUsers(req.user!.sub, query);
      res.status(200).json({
        status: 'success',
        data: { results },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIEND_SEARCH_FAILED',
        message: err.message || 'Error searching users',
      });
    }
  }

  static async sendRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const request = await FriendsService.sendRequest(req.user!.sub, req.body.username);
      res.status(201).json({
        status: 'success',
        message: request.status === 'accepted'
          ? 'Incoming request auto-accepted; you are now friends'
          : 'Friend request sent',
        data: { request },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIEND_REQUEST_FAILED',
        message: err.message || 'Error sending friend request',
      });
    }
  }

  static async acceptRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data = await FriendsService.acceptRequest(req.user!.sub, req.body.requestId);
      res.status(200).json({
        status: 'success',
        message: 'Friend request accepted',
        data,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIEND_ACCEPT_FAILED',
        message: err.message || 'Error accepting friend request',
      });
    }
  }

  static async declineRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const request = await FriendsService.declineRequest(req.user!.sub, req.body.requestId);
      res.status(200).json({
        status: 'success',
        message: 'Friend request declined',
        data: { request },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIEND_DECLINE_FAILED',
        message: err.message || 'Error declining friend request',
      });
    }
  }

  static async removeFriend(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data = await FriendsService.removeFriend(req.user!.sub, req.params.userId);
      res.status(200).json({
        status: 'success',
        message: 'Friend removed',
        data,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'FRIEND_REMOVE_FAILED',
        message: err.message || 'Error removing friend',
      });
    }
  }
}
