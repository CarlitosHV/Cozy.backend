import { db } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { FriendRequestDocument, UserDocument } from '../../models/types.js';

function toPublicUser(user: UserDocument) {
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

function throwHttp(message: string, status: number, code: string): never {
  const err: any = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

export class FriendsService {
  static isOnline(userId: string): boolean {
    return redis.sismember('presence:online_users', userId);
  }

  static async listFriends(userId: string) {
    const friends = await db.listFriends(userId);
    return friends.map((friend) => ({
      ...toPublicUser(friend),
      online: this.isOnline(friend._id),
    }));
  }

  static async listPendingRequests(userId: string) {
    const requests = await db.listPendingRequestsFor(userId);
    const enriched = [];

    for (const request of requests) {
      const fromUser = await db.findUserById(request.fromUserId);
      enriched.push({
        _id: request._id,
        status: request.status,
        createdAt: request.createdAt,
        fromUser: fromUser ? toPublicUser(fromUser) : null,
      });
    }

    return enriched;
  }

  static async searchUsers(userId: string, query: string) {
    const users = await db.searchUsersByUsername(query, userId);
    const results = [];

    for (const user of users) {
      const alreadyFriends = await db.areFriends(userId, user._id);
      const outgoing = await db.findPendingRequestBetween(userId, user._id);
      const incoming = await db.findPendingRequestBetween(user._id, userId);

      results.push({
        ...toPublicUser(user),
        online: this.isOnline(user._id),
        relationship: alreadyFriends
          ? 'friends'
          : outgoing
            ? 'outgoing_request'
            : incoming
              ? 'incoming_request'
              : 'none',
        requestId: outgoing?._id || incoming?._id || null,
      });
    }

    return results;
  }

  static async sendRequest(fromUserId: string, username: string): Promise<FriendRequestDocument> {
    const toUser = await db.findUserByUsername(username);
    if (!toUser) {
      throwHttp('User not found', 404, 'USER_NOT_FOUND');
    }
    if (toUser._id === fromUserId) {
      throwHttp('You cannot send a friend request to yourself', 400, 'INVALID_FRIEND_REQUEST');
    }

    const alreadyFriends = await db.areFriends(fromUserId, toUser._id);
    if (alreadyFriends) {
      throwHttp('You are already friends with this user', 409, 'ALREADY_FRIENDS');
    }

    const existingOutgoing = await db.findPendingRequestBetween(fromUserId, toUser._id);
    if (existingOutgoing) {
      throwHttp('Friend request already pending', 409, 'FRIEND_REQUEST_PENDING');
    }

    const existingIncoming = await db.findPendingRequestBetween(toUser._id, fromUserId);
    if (existingIncoming) {
      return db.acceptFriendRequest(existingIncoming._id, fromUserId);
    }

    return db.sendFriendRequest(fromUserId, toUser._id);
  }

  static async acceptRequest(userId: string, requestId: string) {
    const request = await db.acceptFriendRequest(requestId, userId);
    const friend = await db.findUserById(request.fromUserId);
    return {
      request,
      friend: friend ? { ...toPublicUser(friend), online: this.isOnline(friend._id) } : null,
    };
  }

  static async declineRequest(userId: string, requestId: string) {
    return db.declineFriendRequest(requestId, userId);
  }

  static async removeFriend(userId: string, friendUserId: string) {
    const friend = await db.findUserById(friendUserId);
    if (!friend) {
      throwHttp('User not found', 404, 'USER_NOT_FOUND');
    }

    const removed = await db.removeFriend(userId, friendUserId);
    if (!removed) {
      throwHttp('This user is not in your friends list', 404, 'NOT_FRIENDS');
    }

    return { removedUserId: friendUserId };
  }
}
