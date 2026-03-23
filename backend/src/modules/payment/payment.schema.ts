// =========================================================
// payment.schema.ts
// Path: backend/src/modules/payment/payment.schema.ts
// =========================================================

import { z } from "zod";

export const processPaymentSchema = z
  .object({
    method: z.enum(["CASH", "COD"]),
    // Future methods — uncomment when ready:
    // method: z.enum(["CASH", "COD", "CARD", "ONLINE_TRANSFER"]),

    // amount must match order total — validated in service layer
    // We accept it here so the client is explicit about what it expects to pay
    amount: z.number().positive(),

    // Required for CASH, ignored for COD
    received_amount: z.number().positive().optional(),

    note: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.method === "CASH" && !data.received_amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "received_amount is required for CASH payments",
        path: ["received_amount"],
      });
    }

    if (
      data.method === "CASH" &&
      data.received_amount !== undefined &&
      data.received_amount < data.amount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "received_amount must be >= amount",
        path: ["received_amount"],
      });
    }
  });