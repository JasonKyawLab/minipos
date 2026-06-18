// =========================================================
// product.schema.ts
// Path: backend/src/modules/product/product.schema.ts
//
// FIX: Replaced z.string().uuid() with a loose UUID regex
//      on all client-supplied ID fields.
//
// WHY:
//   z.string().uuid() enforces RFC 4122 version 4 strictly —
//   it requires the 13th character to be "4" and the 17th to
//   be 8/9/a/b. Seed data uses hand-crafted UUIDs that are
//   well-formed (correct length and hyphens) but are not v4,
//   so Zod was rejecting them with "Invalid UUID".
//
//   The correct rule for a database foreign key is: "is this
//   a valid UUID-shaped string?" not "is this UUID version 4?"
//   The database enforces referential integrity — Zod only
//   needs to ensure the shape is safe to pass to a query.
// =========================================================

import { z } from "zod";

// ── Reusable UUID validator ───────────────────────────────
// Accepts any well-formed UUID (v1, v4, v5, or hand-crafted).
// 8-4-4-4-12 hex characters, case-insensitive.
const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID"
  );

// ── Product Category ──────────────────────────────────────

export const createCategorySchema = z.object({
  name:      z.string().min(1).max(100),
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
  category_id: uuidSchema.optional(),
});

export const updateModelSchema = z.object({
  name:        z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  image_url:   z.string().url().optional(),
  category_id: uuidSchema.nullable().optional(),
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
  reference_id: uuidSchema.optional(),
  notes:        z.string().max(500).optional(),
});

// ── Modifier Group Linking ────────────────────────────────

export const linkModifierGroupSchema = z.object({
  groupId: uuidSchema,
});