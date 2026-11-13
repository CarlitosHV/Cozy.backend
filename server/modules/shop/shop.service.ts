import { db } from '../../config/database.js';
import {
  CharacterAppearance,
  PlayerProfileDocument,
  ShopCategory,
  ShopItem,
  ShopPurchaseRecord,
  ShopRarity,
} from '../../models/types.js';
import {
  SHOP_CATALOG,
  SHOP_CATEGORIES,
  STARTER_UNLOCKED_IDS,
  getShopItemById,
} from './shop.catalog.js';

export interface CatalogItemView extends ShopItem {
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
}

export function getEffectiveRelicsBalance(profile: PlayerProfileDocument): number {
  if (typeof profile.relicsBalance === 'number' && Number.isFinite(profile.relicsBalance)) {
    return Math.max(0, Math.floor(profile.relicsBalance));
  }
  return Math.max(0, Math.floor(profile.progress?.totalCollectiblesFound || 0));
}

export function getEffectiveUnlockedSet(profile: PlayerProfileDocument): Set<string> {
  const unlocked = new Set<string>(STARTER_UNLOCKED_IDS);

  if (Array.isArray(profile.unlockedItems)) {
    for (const id of profile.unlockedItems) {
      if (typeof id === 'string' && id.trim()) unlocked.add(id.trim());
    }
  }

  // Sync legacy unlockedCompanions from progress
  if (Array.isArray(profile.progress?.unlockedCompanions)) {
    for (const comp of profile.progress.unlockedCompanions) {
      unlocked.add(`companion_${comp}`);
    }
  }

  return unlocked;
}

export function isItemEquipped(item: ShopItem, appearance: CharacterAppearance): boolean {
  const entries = Object.entries(item.appearancePatch);
  if (entries.length === 0) return false;
  return entries.every(([key, val]) => appearance[key] === val);
}

export class ShopService {
  static async getCatalog(
    userId?: string,
    filters?: { category?: string; rarity?: string; onlyOwned?: boolean }
  ): Promise<{
    currency: 'relics';
    relicsBalance: number | null;
    categories: Array<{ id: ShopCategory; label: string }>;
    totalItems: number;
    items: CatalogItemView[] | ShopItem[];
  }> {
    let items = [...SHOP_CATALOG];

    if (filters?.category) {
      const cat = filters.category.toLowerCase().trim();
      items = items.filter((item) => item.category === cat);
    }

    if (filters?.rarity) {
      const rar = filters.rarity.toLowerCase().trim() as ShopRarity;
      items = items.filter((item) => item.rarity === rar);
    }

    if (!userId) {
      return {
        currency: 'relics',
        relicsBalance: null,
        categories: SHOP_CATEGORIES,
        totalItems: items.length,
        items: items.map((item) => ({
          ...item,
          owned: item.priceRelics === 0,
          equipped: false,
          canAfford: false,
        })),
      };
    }

    const profile = await db.findProfileByUserId(userId);
    if (!profile) {
      return {
        currency: 'relics',
        relicsBalance: 0,
        categories: SHOP_CATEGORIES,
        totalItems: items.length,
        items: items.map((item) => ({
          ...item,
          owned: item.priceRelics === 0,
          equipped: false,
          canAfford: item.priceRelics === 0,
        })),
      };
    }

    const relicsBalance = getEffectiveRelicsBalance(profile);
    const unlockedSet = getEffectiveUnlockedSet(profile);

    let enriched: CatalogItemView[] = items.map((item) => {
      const owned = item.priceRelics === 0 || unlockedSet.has(item.id);
      return {
        ...item,
        owned,
        equipped: isItemEquipped(item, profile.appearance),
        canAfford: owned || relicsBalance >= item.priceRelics,
      };
    });

    if (filters?.onlyOwned) {
      enriched = enriched.filter((item) => item.owned);
    }

    return {
      currency: 'relics',
      relicsBalance,
      categories: SHOP_CATEGORIES,
      totalItems: enriched.length,
      items: enriched,
    };
  }

  static async getPlayerInventory(userId: string): Promise<{
    currency: 'relics';
    relicsBalance: number;
    totalRelicsEarned: number;
    unlockedItems: string[];
    equippedItems: string[];
    appearance: CharacterAppearance;
    purchaseHistory: ShopPurchaseRecord[];
  }> {
    const profile = await db.findProfileByUserId(userId);
    if (!profile) {
      const err: any = new Error('Player profile not found');
      err.status = 404;
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    const relicsBalance = getEffectiveRelicsBalance(profile);
    const unlockedItems = Array.from(getEffectiveUnlockedSet(profile));
    const equippedItems = SHOP_CATALOG.filter((item) =>
      isItemEquipped(item, profile.appearance)
    ).map((item) => item.id);

    return {
      currency: 'relics',
      relicsBalance,
      totalRelicsEarned: profile.progress?.totalCollectiblesFound || 0,
      unlockedItems,
      equippedItems,
      appearance: profile.appearance,
      purchaseHistory: profile.purchaseHistory || [],
    };
  }

  static async purchaseItem(
    userId: string,
    itemId: string,
    autoEquip = false
  ): Promise<{
    purchasedItem: ShopItem;
    relicsBalance: number;
    relicsSpent: number;
    unlockedItems: string[];
    equipped: boolean;
    appearance: CharacterAppearance;
  }> {
    const item = getShopItemById(itemId);
    if (!item) {
      const err: any = new Error(`Shop item '${itemId}' does not exist`);
      err.status = 404;
      err.code = 'ITEM_NOT_FOUND';
      throw err;
    }

    const profile = await db.findProfileByUserId(userId);
    if (!profile) {
      const err: any = new Error('Player profile not found');
      err.status = 404;
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    const unlockedSet = getEffectiveUnlockedSet(profile);
    if (unlockedSet.has(item.id) || item.priceRelics === 0) {
      const err: any = new Error(`You already own '${item.name}'`);
      err.status = 409;
      err.code = 'ALREADY_OWNED';
      throw err;
    }

    const currentBalance = getEffectiveRelicsBalance(profile);
    if (currentBalance < item.priceRelics) {
      const err: any = new Error(
        `Not enough relics to buy '${item.name}'. Required: ${item.priceRelics}, Available: ${currentBalance}`
      );
      err.status = 400;
      err.code = 'INSUFFICIENT_RELICS';
      err.details = {
        required: item.priceRelics,
        available: currentBalance,
        missing: item.priceRelics - currentBalance,
      };
      throw err;
    }

    const newBalance = currentBalance - item.priceRelics;
    unlockedSet.add(item.id);
    const unlockedItems = Array.from(unlockedSet);

    const updatedProgress = { ...profile.progress };
    if (item.category === 'companion' && item.companionId) {
      const companionsSet = new Set(updatedProgress.unlockedCompanions || ['nube']);
      companionsSet.add(item.companionId);
      updatedProgress.unlockedCompanions = Array.from(companionsSet);
    }

    const purchaseRecord: ShopPurchaseRecord = {
      itemId: item.id,
      category: item.category,
      priceRelics: item.priceRelics,
      purchasedAt: new Date().toISOString(),
    };

    const purchaseHistory = [...(profile.purchaseHistory || []), purchaseRecord];

    const updatedAppearance: CharacterAppearance = autoEquip
      ? { ...profile.appearance, ...item.appearancePatch }
      : profile.appearance;

    await db.updateProfile(userId, {
      relicsBalance: newBalance,
      unlockedItems,
      progress: updatedProgress,
      purchaseHistory,
      appearance: updatedAppearance,
    });

    return {
      purchasedItem: item,
      relicsBalance: newBalance,
      relicsSpent: item.priceRelics,
      unlockedItems,
      equipped: autoEquip,
      appearance: updatedAppearance,
    };
  }

  static async equipItems(
    userId: string,
    requestedItemIds: string[]
  ): Promise<{
    equippedItems: ShopItem[];
    appearance: CharacterAppearance;
  }> {
    const profile = await db.findProfileByUserId(userId);
    if (!profile) {
      const err: any = new Error('Player profile not found');
      err.status = 404;
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    const unlockedSet = getEffectiveUnlockedSet(profile);
    const itemsToEquip: ShopItem[] = [];

    for (const id of requestedItemIds) {
      const item = getShopItemById(id);
      if (!item) {
        const err: any = new Error(`Shop item '${id}' does not exist`);
        err.status = 404;
        err.code = 'ITEM_NOT_FOUND';
        throw err;
      }

      if (item.priceRelics > 0 && !unlockedSet.has(item.id)) {
        const err: any = new Error(`Item '${item.name}' (${item.id}) is locked. Unlock it in the shop first.`);
        err.status = 403;
        err.code = 'ITEM_LOCKED';
        err.details = { itemId: item.id, priceRelics: item.priceRelics };
        throw err;
      }

      itemsToEquip.push(item);
    }

    let nextAppearance: CharacterAppearance = { ...profile.appearance };
    for (const item of itemsToEquip) {
      nextAppearance = {
        ...nextAppearance,
        ...item.appearancePatch,
      };
    }

    await db.updateProfile(userId, {
      appearance: nextAppearance,
    });

    return {
      equippedItems: itemsToEquip,
      appearance: nextAppearance,
    };
  }
}
