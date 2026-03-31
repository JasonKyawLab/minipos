// =========================================================
// shop.schema.ts
// Path: backend/src/modules/shop/shop.schema.ts
// =========================================================
// NEW FILE.
// Previously createShop only used requireBody() which checks
// presence but not values. Sending currency:"DOGECOIN" would
// pass the route and hit a raw PostgreSQL enum error.
// Zod validates values against the actual DB enum lists so
// the client gets a clean 400 with a meaningful message.
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
  role:   z.enum(["MANAGER", "CASHIER"]),
});