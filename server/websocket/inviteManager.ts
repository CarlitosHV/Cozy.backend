import { Server, Socket } from 'socket.io';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import { GameInvitePayload } from '../models/types.js';
import { emitToUser, getUserSocketId } from './presence.js';
import { RoomManager } from './roomManager.js';

const INVITE_TTL_SECONDS = 60;

function inviteKey(inviteId: string): string {
  return `invite:${inviteId}`;
}

function createInviteId(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

function createPartyId(): string {
  return `party_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

export class InviteManager {
  constructor(private io: Server, private roomManager: RoomManager) {}

  async handleSendInvite(
    socket: Socket,
    data: { toUserId?: string; levelId?: number; roomId?: string }
  ): Promise<void> {
    const user = socket.data.user;
    if (!user) return;

    const toUserId = String(data?.toUserId || '');
    const senderBinding0 = this.roomManager.getSocketBinding(socket.id);
    // Invite to the level the sender is actually in when already in a party room
    const levelId = Math.max(1, Math.floor(Number(senderBinding0?.levelId ?? data?.levelId) || 1));

    if (!toUserId) {
      socket.emit('error', { code: 'INVALID_INVITE', message: 'toUserId is required' });
      return;
    }

    if (toUserId === user.userId) {
      socket.emit('error', { code: 'INVALID_INVITE', message: 'You cannot invite yourself' });
      return;
    }

    const areFriends = await db.areFriends(user.userId, toUserId);
    if (!areFriends) {
      socket.emit('error', { code: 'NOT_FRIENDS', message: 'You can only invite friends to play' });
      return;
    }

    const targetSocketId = getUserSocketId(toUserId);
    if (!targetSocketId) {
      socket.emit('error', { code: 'FRIEND_OFFLINE', message: 'That friend is not online right now' });
      return;
    }

    // Determine party room: use passed roomId, or sender's active room binding, or create one
    const senderBinding = this.roomManager.getSocketBinding(socket.id);
    const resolvedRoomId = data?.roomId || senderBinding?.roomKey || createPartyId();

    const userDoc = await db.findUserById(user.userId);
    const fromUsername = userDoc?.displayName || userDoc?.username || user.displayName || user.username;

    const inviteId = createInviteId();
    const invite: GameInvitePayload = {
      inviteId,
      fromUserId: user.userId,
      fromUsername,
      toUserId,
      levelId,
      roomId: resolvedRoomId,
      createdAt: Date.now(),
    };

    redis.set(inviteKey(inviteId), invite, INVITE_TTL_SECONDS);

    const delivered = emitToUser(this.io, toUserId, 'invite:received', {
      inviteId,
      fromUserId: user.userId,
      fromUsername,
      levelId,
      roomId: resolvedRoomId,
      expiresInSeconds: INVITE_TTL_SECONDS,
    });

    if (!delivered) {
      redis.del(inviteKey(inviteId));
      socket.emit('error', { code: 'FRIEND_OFFLINE', message: 'That friend is not online right now' });
      return;
    }

    socket.emit('invite:sent', {
      inviteId,
      toUserId,
      levelId,
      roomId: resolvedRoomId,
      expiresInSeconds: INVITE_TTL_SECONDS,
    });
  }

  async handleRespondInvite(socket: Socket, data: { inviteId?: string; accept?: boolean }): Promise<void> {
    const user = socket.data.user;
    if (!user) return;

    const inviteId = String(data?.inviteId || '');
    const accept = Boolean(data?.accept);

    if (!inviteId) {
      socket.emit('error', { code: 'INVALID_INVITE', message: 'inviteId is required' });
      return;
    }

    const invite = redis.get<GameInvitePayload>(inviteKey(inviteId));
    if (!invite) {
      socket.emit('error', { code: 'INVITE_EXPIRED', message: 'Invite not found or expired' });
      return;
    }

    if (invite.toUserId !== user.userId) {
      socket.emit('error', { code: 'FORBIDDEN', message: 'Only the invited player can respond' });
      return;
    }

    redis.del(inviteKey(inviteId));

    if (!accept) {
      const result = {
        inviteId,
        accepted: false,
        levelId: invite.levelId,
        roomId: invite.roomId,
      };
      socket.emit('invite:result', result);
      emitToUser(this.io, invite.fromUserId, 'invite:result', result);
      return;
    }

    // Reuse existing roomId from invite so all invited friends join the same room!
    const inviterSocketId = getUserSocketId(invite.fromUserId);
    const inviterBinding = inviterSocketId ? this.roomManager.getSocketBinding(inviterSocketId) : undefined;
    const finalRoomId = invite.roomId || inviterBinding?.roomKey || createPartyId();
    // Join the level the inviter is playing right now (they may have moved on since inviting)
    const finalLevelId =
      this.roomManager.getUserLevelInRoom(invite.fromUserId, finalRoomId) ??
      (inviterBinding && inviterBinding.roomKey === finalRoomId ? inviterBinding.levelId : null) ??
      invite.levelId;

    const result = {
      inviteId,
      accepted: true,
      roomId: finalRoomId,
      levelId: finalLevelId,
      fromUsername: invite.fromUsername,
      toUserId: user.userId,
      fromUserId: invite.fromUserId,
    };

    socket.emit('invite:result', result);
    emitToUser(this.io, invite.fromUserId, 'invite:result', result);
  }
}

