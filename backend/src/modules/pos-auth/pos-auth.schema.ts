import { z } from "zod";

export const setPinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

export const updatePinMaxAttemptsSchema = z.object({
  pin_max_attempts: z
    .number()
    .int()
    .min(1, "Minimum 1 attempt")
    .max(10, "Maximum 10 attempts"),
});

export const pinLoginSchema = z.object({
  user_id:   z.string().uuid(),
  pin:       z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
  device_id: z.string().uuid().optional(),  // ← add this
});