// =========================================================
// order.schema.ts
// Path: backend/src/modules/order/order.schema.ts
// =========================================================
// Zod validation schemas for all order-related request bodies.
//
// Key design: conditional validation with superRefine()
//   - DINE_IN   → table_id required
//   - DELIVERY  → customer_name, customer_phone,
//                 delivery_address required
//   - ONLINE /
//     PICKUP    → customer_name, customer_phone required
// =========================================================

import { z } from "zod";

// ── Create Order ──────────────────────────────────────────

export const createOrderSchema = z
  .object({
    order_type: z.enum([
      "RETAIL",
      "DINE_IN",
      "TAKEAWAY",
      "ONLINE",
      "DELIVERY",
      "PICKUP",
      "QR",
    ]),

    table_id: z.string().uuid().optional(),

    customer_name:    z.string().min(1).max(150).optional(),
    customer_phone:   z.string().min(1).max(50).optional(),
    delivery_address: z.string().min(1).optional(),
    delivery_note:    z.string().optional(),
    notes:            z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // DINE_IN requires a table
    if (data.order_type === "DINE_IN" && !data.table_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "table_id is required for DINE_IN orders",
        path: ["table_id"],
      });
    }

    // DELIVERY requires customer info + address
    if (data.order_type === "DELIVERY") {
      if (!data.customer_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "customer_name is required for DELIVERY orders",
          path: ["customer_name"],
        });
      }
      if (!data.customer_phone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "customer_phone is required for DELIVERY orders",
          path: ["customer_phone"],
        });
      }
      if (!data.delivery_address) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "delivery_address is required for DELIVERY orders",
          path: ["delivery_address"],
        });
      }
    }

    // ONLINE and PICKUP require customer contact info
    if (
      data.order_type === "ONLINE" ||
      data.order_type === "PICKUP"
    ) {
      if (!data.customer_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `customer_name is required for ${data.order_type} orders`,
          path: ["customer_name"],
        });
      }
      if (!data.customer_phone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `customer_phone is required for ${data.order_type} orders`,
          path: ["customer_phone"],
        });
      }
    }
  });

// ── Add Item to Order ─────────────────────────────────────

const modifierSnapshotSchema = z.object({
  // We store the option ID so we can trace back what was selected
  modifier_option_id: z.string().uuid(),
  name:               z.string().min(1).max(100),

  // price_delta can be negative (discount modifier)
  price_delta:        z.number(),
});

export const addOrderItemSchema = z.object({
  product_item_id: z.string().uuid(),
  qty:             z.number().int().positive(),

  // modifiers is optional — not all items have modifiers
  modifiers: z.array(modifierSnapshotSchema).optional().default([]),

  item_note: z.string().max(255).optional(),
});

// ── Update Order Item ─────────────────────────────────────

export const updateOrderItemSchema = z.object({
  qty: z.number().int().positive(),
});

// ── Update Order Status ───────────────────────────────────

export const updateOrderStatusSchema = z.object({
  // Only these transitions are allowed via this endpoint.
  // PAID is set automatically by the payment module, not manually.
  // REFUNDED is set by the refund module (Phase 3).
  status: z.enum(["CONFIRMED", "CANCELLED"]),
});