import { z } from 'zod';

const companionEnum = z.enum(['nube', 'estrella', 'luciernaga', 'catarina', 'hada', 'serpiente']);
const inventorySlotItem = z.enum(['baya', 'nuez', 'llave', 'resortera', 'piedra', 'bate', 'red', 'bomba', 'luz', 'antorcha']).nullable();

export const appearanceSchema = z.object({
  bodyType: z.enum(['chico', 'chica']),
  skinColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color'),
  hairStyle: z.string().min(1).max(50),
  hairColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color'),
  eyesStyle: z.string().min(1).max(50),
  eyesColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color'),
  shirtStyle: z.string().min(1).max(50),
  shirtColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color'),
  pantsStyle: z.string().min(1).max(50),
  pantsColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color'),
  shoesColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color'),
  hat: z.string().max(50).default('none'),
  glasses: z.string().max(50).default('none'),
  backpack: z.string().max(50).default('explorer_pack'),
  companion: companionEnum,
});

export const inventorySchema = z.object({
  slots: z
    .array(inventorySlotItem)
    .length(5, 'Inventory must contain exactly 5 slots'),
});

export const completeLevelSchema = z.object({
  levelId: z.number().int().min(1).max(10),
  timeSeconds: z.number().positive(),
  relicsFound: z.number().int().min(0).max(50).default(0),
  mode: z.enum(['free', 'time_trial', 'chase']).default('time_trial'),
  authTicket: z.string().optional(),
});
