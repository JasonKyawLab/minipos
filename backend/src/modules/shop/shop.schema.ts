// =========================================================
// shop.schema.ts
// Path: backend/src/modules/shop/shop.schema.ts
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
 
// ── Mode gate password verification ──────────────────────
// Accepts the user's own platform password.
// The backend compares it against their stored bcrypt hash.
// No role is encoded here — the route middleware handles that.
export const verifyPasswordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
 
// ── Staff invitation ───────────────────────────────────
// Invites a new staff member by email. The user must register first before being added to the shop.ß
export const inviteStaffSchema = z.object({
  email: z.string().email(),
  role:  z.enum(["MANAGER", "CASHIER"]),
});