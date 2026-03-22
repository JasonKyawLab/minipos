// =========================================================
// modifier.schema.ts
// Path: backend/src/modules/modifier/modifier.schema.ts
// =========================================================

import { z } from "zod";

// ── Modifier Group ─────────────────────────────────────────

export const createGroupSchema = z.object({
  name:        z.string().min(1).max(100),
  is_required: z.boolean().optional(),

  // min_select / max_select validated together below
  min_select:  z.number().int().min(0).optional(),
  max_select:  z.number().int().min(1).optional(),

  sort_order:  z.number().int().min(0).optional(),
}).refine(
  (data) => {
    // Only validate the pair if BOTH are provided
    if (data.min_select !== undefined && data.max_select !== undefined) {
      return data.min_select <= data.max_select;
    }
    return true;
  },
  {
    message: "min_select must be <= max_select",
    path: ["min_select"],
  }
);

export const updateGroupSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  is_required: z.boolean().optional(),
  min_select:  z.number().int().min(0).optional(),
  max_select:  z.number().int().min(1).optional(),
  sort_order:  z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
).refine(
  (data) => {
    if (data.min_select !== undefined && data.max_select !== undefined) {
      return data.min_select <= data.max_select;
    }
    return true;
  },
  {
    message: "min_select must be <= max_select",
    path: ["min_select"],
  }
);

// ── Modifier Option ────────────────────────────────────────

export const createOptionSchema = z.object({
  name:                   z.string().min(1).max(100),

  // price_delta can be negative (discount modifier)
  price_delta:            z.number().optional(),

  // UUID of a product_item (optional linked stock)
  linked_product_item_id: z.string().uuid().optional(),

  sort_order:             z.number().int().min(0).optional(),
});

export const updateOptionSchema = z.object({
  name:                   z.string().min(1).max(100).optional(),
  price_delta:            z.number().optional(),
  linked_product_item_id: z.string().uuid().nullable().optional(),
  is_active:              z.boolean().optional(),
  sort_order:             z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);