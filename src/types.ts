export type CompanionType = 'nube' | 'estrella' | 'luciernaga' | 'catarina' | 'hada' | 'serpiente';
export type InventoryItemType = 'baya' | 'nuez' | 'llave' | null;
export type AnimationType = 'idle' | 'walk' | 'run' | 'jump' | 'fall';

export interface CharacterAppearance {
  bodyType: 'chico' | 'chica';
  skinColor: string;
  hairStyle: string;
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

export interface User {
  _id: string;
  username: string;
  displayName: string;
  email: string;
  role: 'player' | 'admin';
  isActive: boolean;
  lastLoginAt: string;
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
