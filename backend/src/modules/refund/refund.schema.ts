import { z } from "zod";

const refundItemSchema = z.object({
  order_item_id: z.string().uuid(),
  qty:           z.number().int().positive(),  //  — positive enforced by Zod
  restock:       z.boolean(),
  reason:        z.string().max(500).optional(),
});

export const processRefundSchema = z
  .object({
    type:    z.enum(["FULL", "PARTIAL"]),
    restock: z.boolean().optional().default(false),
    items:   z.array(refundItemSchema).optional(),
    reason:  z.string().max(500).optional(),

    //  — optional idempotency key, must be a UUID
    idempotency_key: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PARTIAL") {
      if (!data.items || data.items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "items are required for PARTIAL refunds",
          path: ["items"],
        });
      }
    }

    if (data.type === "FULL" && data.items && data.items.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "items should not be provided for FULL refunds",
        path: ["items"],
      });
    }
  });

//  — pagination schema for GET /refunds
export const listRefundsSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});