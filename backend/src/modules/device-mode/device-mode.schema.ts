import { z } from 'zod';

export const activateModeSchema = z.object({
  password: z.string().min(1),
  mode:     z.enum(['POS', 'KITCHEN']),
});

export const exitModeSchema = z.object({
  // password required for normal exit, optional for forced
  password: z.string().min(1).optional(),
  forced:   z.boolean().optional().default(false),
}).refine(
  (data) => data.forced || !!data.password,
  { message: 'password is required when forced is false', path: ['password'] }
);