import { z } from "zod";

export const kitchenSetPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

export const kitchenLoginSchema = z.object({
  user_id:   z.string().uuid(),
  pin:       z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
  device_id: z.string().uuid().optional(),
});

export const exitKitchenSchema = z.object({
  password: z.string().min(1),
});