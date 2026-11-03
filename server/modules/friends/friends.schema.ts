import { z } from 'zod';

export const friendRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
});

export const friendRequestActionSchema = z.object({
  requestId: z.string().min(1, 'requestId is required'),
});
