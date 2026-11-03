export type CompanionType = 'nube' | 'estrella' | 'luciernaga' | 'catarina' | 'hada' | 'serpiente';
export type InventoryItemType = 'baya' | 'nuez' | 'llave' | null;
export type AnimationType = 'idle' | 'walk' | 'run' | 'jump' | 'fall';
export type GameMode = 'free' | 'time_trial' | 'chase';

export interface CharacterAppearance {
  bodyType: 'chico' | 'chica';
  skinColor: string;       // Hex (#f8d5b8)
  hairStyle: string;       // 'cozy_messy', 'short_crop', 'ponytail', etc.
  hairColor: string;
  eyesStyle: string;
  eyesColor: string;
  shirtStyle: string;
  shirtColor: string;
  pantsStyle: string;
  pantsColor: string;
  shoesColor: string;
  hat: string;
  glasses: string;
  backpack: string;
  companion: CompanionType;
}

export interface InventoryStatus {
  slots: [InventoryItemType, InventoryItemType, InventoryItemType, InventoryItemType, InventoryItemType];
}

export interface PlayerProgress {
  maxUnlockedLevel: number;
  completedLevels: number[];
  totalCollectiblesFound: number;
  unlockedCompanions: CompanionType[];
}

export interface PlayerStats {
  totalPlayTimeSeconds: number;
  totalJumps: number;
  totalFalls: number;
}

export interface UserDocument {
  _id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role: 'player' | 'admin';
  isActive: boolean;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProfileDocument {
  _id: string;
  userId: string;
  appearance: CharacterAppearance;
  inventory: InventoryStatus;
  progress: PlayerProgress;
  stats: PlayerStats;
  updatedAt: string;
}

export interface LevelRecordDocument {
  _id: string;
  userId: string;
  username: string;
  levelId: number;
  mode: GameMode;
  timeSeconds: number;
  collectiblesFound: number;
  createdAt: string;
}

export interface PlayerRemoteState {
  userId: string;
  username: string;
  displayName?: string;
  appearance: CharacterAppearance;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: AnimationType;
  action?: string;
  lastUpdate: number;
  socketId: string;
  levelId: number;
}

export interface FriendRequestDocument {
  _id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export interface GameInvitePayload {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
  levelId: number;
  roomId?: string;
  createdAt: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: 'player' | 'admin';
  iat?: number;
  exp?: number;
}
