// =========================================================
// product.schema.ts
// Path: backend/src/modules/product/product.schema.ts
//
// CHANGES: Added category CRUD schemas.
//          Added category_id to model create/update schemas.
// =========================================================

import { z } from "zod";

// ── Product Category ──────────────────────────────────────

export const createCategorySchema = z.object({
  name:      z.string().min(1).max(100),
  // Hex colour validation: optional, must be #RRGGBB format
  color:     z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex colour like #FF5733").optional(),
  image_url: z.string().url().optional(),
});

export const updateCategorySchema = z.object({
  name:       z.string().min(1).max(100).optional(),
  color:      z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex colour like #FF5733").optional(),
  image_url:  z.string().url().optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

// ── Product Model ─────────────────────────────────────────

export const createModelSchema = z.object({
  name:        z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  image_url:   z.string().url().optional(),
  category_id: z.string().uuid().optional(),   // NEW
});

export const updateModelSchema = z.object({
  name:        z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  image_url:   z.string().url().optional(),
  // null explicitly removes the category (uncategorises the product)
  category_id: z.string().uuid().nullable().optional(),  // NEW
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

// ── Product Item ──────────────────────────────────────────

export const createItemSchema = z.object({
  name:        z.string().min(1).max(100),
  sku:         z.string().max(100).optional(),
  barcode:     z.string().max(50).optional(),
  price:       z.number().min(0),
  cost_price:  z.number().min(0).optional(),
  track_stock: z.boolean().optional(),
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
  is_active: z.boolean(),
});

// ── Inventory Movement ────────────────────────────────────

export const recordInventorySchema = z.object({
  type:         z.enum(["SALE", "PURCHASE", "ADJUSTMENT", "REFUND"]),
  quantity:     z.number().int().positive({ message: "quantity must be a positive integer" }),
  reference_id: z.string().uuid().optional(),
  notes:        z.string().max(500).optional(),
});

// ── Modifier Group Linking ────────────────────────────────

export const linkModifierGroupSchema = z.object({
  groupId: z.string().uuid(),
});