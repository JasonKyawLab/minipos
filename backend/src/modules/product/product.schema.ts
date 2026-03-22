// =========================================================
// product.schema.ts
// Path: backend/src/modules/product/product.schema.ts
// =========================================================
// Zod schemas for request body validation.
// Used by validate() middleware in product.routes.ts.
//
// Why Zod?
//   • Strips unknown fields automatically (.strip() default)
//   • Returns structured field-level errors → frontend UX
//   • Type-safe: schema.parse() returns typed output
// =========================================================

import { z } from "zod";

// ── Product Model ─────────────────────────────────────────

export const createModelSchema = z.object({
  name:        z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  image_url:   z.string().url().optional(),
});

export const updateModelSchema = z.object({
  name:        z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  image_url:   z.string().url().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

// ── Product Item ──────────────────────────────────────────

export const createItemSchema = z.object({
  name:        z.string().min(1).max(100),
  sku:         z.string().max(100).optional(),
  barcode:     z.string().max(50).optional(),

  // price must be non-negative (matches DB CHECK price >= 0)
  price:       z.number().min(0),
  cost_price:  z.number().min(0).optional(),

  track_stock: z.boolean().optional(),

  // stock_qty must be non-negative (matches DB CHECK stock_qty >= 0)
  stock_qty:   z.number().int().min(0).optional(),
});

export const updateItemSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  sku:         z.string().max(100).optional(),
  barcode:     z.string().max(50).optional(),
  price:       z.number().min(0).optional(),
  cost_price:  z.number().min(0).optional(),
  track_stock: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const setItemActiveSchema = z.object({
  // Explicit boolean — rejects "true" strings from form submissions
  is_active: z.boolean(),
});

// ── Inventory Movement ────────────────────────────────────

export const recordInventorySchema = z.object({
  type: z.enum(["SALE", "PURCHASE", "ADJUSTMENT", "REFUND"]),

  // Caller passes a positive number.
  // Service enforces the correct sign based on type.
  quantity:     z.number().int().positive({ message: "quantity must be a positive integer" }),

  reference_id: z.string().uuid().optional(),
  notes:        z.string().max(500).optional(),
});

// ── Modifier Group Linking ────────────────────────────────

export const linkModifierGroupSchema = z.object({
  groupId: z.string().uuid(),
});