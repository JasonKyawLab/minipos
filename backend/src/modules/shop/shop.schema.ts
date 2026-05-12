// =========================================================
// shop.schema.ts
// Path: backend/src/modules/shop/shop.schema.ts
//
// NEW: changeStaffRoleSchema — validates the role change body
// =========================================================

import { z } from "zod";

export const createShopSchema = z.object({
  name:     z.string().min(1).max(120),
  shopType: z.enum(["RETAIL", "RESTAURANT", "ONLINE_SHOP"]),
  currency: z.enum(["USD", "SGD", "THB", "MMK", "EUR"]),
});

export const updateShopSchema = z.object({
  name:     z.string().min(1).max(120).optional(),
  currency: z.enum(["USD", "SGD", "THB", "MMK", "EUR"]).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const addStaffSchema = z.object({
  userId: z.string().uuid(),
  role:   z.enum(["MANAGER", "CASHIER", "CHEF"]),
});

// NEW: Validates the role field for the change-role endpoint.
// OWNER role cannot be assigned via this endpoint — it is set
// only at shop creation. This prevents privilege escalation.
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