// =========================================================
// qr.schema.ts
// Path: backend/src/modules/qr/qr.schema.ts
//
// FIX: Replaced z.string().uuid() with z.string().min(1) for
//      product_item_id and modifier_option_id.
//
// WHY:
//   z.string().uuid() enforces strict RFC 4122 format, which
//   requires specific version/variant bits at positions 13 and
//   17. Development seed UUIDs (e.g. d1000000-0000-0000-0000-...)
//   use 0 in those positions and therefore fail the check.
//
//   These IDs come directly from the menu response — they were
//   just returned by our own database. Validating UUID format
//   here adds no security: if the value is a valid UUID that
//   doesn't exist in the DB, the service throws PRODUCT_ITEM_NOT_FOUND.
//   If it's not a UUID at all, PostgreSQL throws a 22P02 error
//   which handleError() catches and returns as a 400.
//
//   Using z.string().min(1) keeps the "must be present and
//   non-empty" guarantee without breaking on non-standard UUIDs.
// =========================================================

import { z } from "zod";

const qrModifierSchema = z.object({
  modifier_option_id: z.string().min(1),   // was z.string().uuid()
  name:               z.string().min(1).max(100),
  price_delta:        z.number(),
});

const qrOrderItemSchema = z.object({
  product_item_id: z.string().min(1),      // was z.string().uuid()
  qty:             z.number().int().positive(),
  modifiers:       z.array(qrModifierSchema).optional().default([]),
  item_note:       z.string().max(255).optional(),
});

export const placeQrOrderSchema = z.object({
  customer_name: z.string().min(1).max(150).optional(),
  items:         z.array(qrOrderItemSchema).min(1, "At least one item is required"),
  notes:         z.string().max(500).optional(),
});