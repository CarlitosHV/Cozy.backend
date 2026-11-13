import { z } from 'zod';

export const purchaseItemSchema = z.object({
  itemId: z.string().min(1, 'itemId is required').max(64),
  autoEquip: z.boolean().optional().default(false),
});

export const equipItemSchema = z
  .object({
    itemId: z.string().min(1).max(64).optional(),
    itemIds: z.array(z.string().min(1).max(64)).min(1).max(12).optional(),
  })
  .refine(
    (data) => Boolean(data.itemId || (data.itemIds && data.itemIds.length > 0)),
    'Either itemId or itemIds must be provided'
  );
