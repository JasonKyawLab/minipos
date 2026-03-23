// =========================================================
// refund.schema.ts
// Path: backend/src/modules/refund/refund.schema.ts
// =========================================================

import { z } from "zod";

// ── Per-item schema for partial refunds ───────────────────

const refundItemSchema = z.object({
  order_item_id: z.string().uuid(),

  // qty must be positive — you cannot refund 0 of an item
  qty: z.number().int().positive(),

  // Staff decides per item whether to restock based on
  // physical condition of the returned item
  restock: z.boolean(),

  // Optional per-item reason
  // e.g. "broken from factory", "food cooked badly"
  reason: z.string().max(500).optional(),
});

// ── Main refund schema ────────────────────────────────────

export const processRefundSchema = z
  .object({
    type: z.enum(["FULL", "PARTIAL"]),

    // FULL refund: one restock decision for all items
    // PARTIAL refund: restock is per item — this field is ignored
    // Default false — safer assumption (damaged goods)
    restock: z.boolean().optional().default(false),

    // Required for PARTIAL, must have at least 1 item
    items: z.array(refundItemSchema).optional(),

    // Overall reason for the refund
    reason: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    // PARTIAL refund must have items
    if (data.type === "PARTIAL") {
      if (!data.items || data.items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "items are required for PARTIAL refunds",
          path: ["items"],
        });
      }
    }

    // FULL refund should NOT have items array
    // (we refund everything — specifying items makes no sense)
    if (data.type === "FULL" && data.items && data.items.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "items should not be provided for FULL refunds — use PARTIAL instead",
        path: ["items"],
      });
    }
  });