// =========================================================
// qr.schema.ts
// Path: backend/src/modules/qr/qr.schema.ts
// =========================================================

import { z } from "zod";

const qrModifierSchema = z.object({
  modifier_option_id: z.string().uuid(),
  name:               z.string().min(1).max(100),
  price_delta:        z.number(),
});

const qrOrderItemSchema = z.object({
  product_item_id: z.string().uuid(),
  qty:             z.number().int().positive(),
  modifiers:       z.array(qrModifierSchema).optional().default([]),
  item_note:       z.string().max(255).optional(),
});

export const placeQrOrderSchema = z.object({
  customer_name: z.string().min(1).max(150).optional(),
  items:         z.array(qrOrderItemSchema).min(1, "At least one item is required"),
  notes:         z.string().max(500).optional(),
});