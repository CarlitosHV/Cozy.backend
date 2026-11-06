import { z } from 'zod';

const companionEnum = z.enum(['nube', 'estrella', 'luciernaga', 'catarina', 'hada', 'serpiente']);
const inventorySlotItem = z.enum(['baya', 'nuez', 'llave', 'resortera', 'piedra', 'bate', 'red', 'bomba', 'luz', 'antorcha']).nullable();

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color');

/**
 * The game's character has more pieces than the original spec (eye style, accessory, outfit,
 * scarf, height, name…). Those extra fields are kept as plain values so the whole character is
 * saved and other players see it exactly as it was made.
 */
export const appearanceSchema = z
  .object({
    bodyType: z.enum(['chico', 'chica']),
    skinColor: hexColor.optional(),
    hairStyle: z.string().min(1).max(50).optional(),
    hairColor: hexColor.optional(),
    eyesStyle: z.string().min(1).max(50).optional(),
    eyesColor: hexColor.optional(),
    shirtStyle: z.string().min(1).max(50).optional(),
    shirtColor: hexColor.optional(),
    pantsStyle: z.string().min(1).max(50).optional(),
    pantsColor: hexColor.optional(),
    shoesColor: hexColor.optional(),
    hat: z.string().max(50).default('none'),
    glasses: z.string().max(50).default('none'),
    backpack: z.string().max(50).default('explorer_pack'),
    companion: companionEnum.or(z.literal('ninguno')).optional(),
    name: z.string().max(24).optional(),
  })
  .catchall(z.union([z.string().max(48), z.number().finite(), z.boolean()]))
  .refine((a) => Object.keys(a).length <= 48, 'Too many appearance fields');

export const inventorySchema = z.object({
  slots: z
    .array(inventorySlotItem)
    .length(5, 'Inventory must contain exactly 5 slots'),
});

export const completeLevelSchema = z.object({
  levelId: z.number().int().min(1).max(10),
  timeSeconds: z.number().positive(),
  relicsFound: z.number().int().min(0).max(50).default(0),
  mode: z
    .enum(['normal', 'contrareloj', 'persecucion', 'free', 'time_trial', 'chase'])
    .default('normal'),
  authTicket: z.string().optional(),
});
