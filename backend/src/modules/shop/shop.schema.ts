import { z } from "zod";

export const createShopSchema = z.object({
  name:     z.string().min(1).max(120),
  shopType: z.enum(["RETAIL", "RESTAURANT", "ONLINE_SHOP"]),
  currency: z.enum(["USD", "SGD", "THB", "MMK", "EUR"]),
});

export const updateShopSchema = z.object({
  name:     z.string().min(1).max(120).optional(),
  currency: z.enum(["USD", "SGD", "THB", "MMK", "EUR"]).optional(),
  shopType: z.enum(["RETAIL", "RESTAURANT", "ONLINE_SHOP"]).optional(),
  taxRate:  z.number().min(0).max(100).optional(),
  timezone: z.string().min(1).max(64).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const addStaffSchema = z.object({
  userId: z.string().uuid(),
  role:   z.enum(["MANAGER", "CASHIER", "CHEF"]),
});

export const changeStaffRoleSchema = z.object({
  role: z.enum(["MANAGER", "CASHIER", "CHEF"], {
    error: "role must be one of: MANAGER, CASHIER, CHEF",
  } as any), 
});

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const inviteStaffSchema = z.object({
  email: z.string().email(),
  role:  z.enum(["MANAGER", "CASHIER", "CHEF"]),
});