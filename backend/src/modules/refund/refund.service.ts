// =========================================================
// refund.service.ts
// Path: backend/src/modules/refund/refund.service.ts
// =========================================================
// Business logic layer.
//
// Responsibilities:
//   - Permission checks (OWNER / MANAGER only)
//   - Validate order is in PAID status
//   - Fetch payment record to link to refund
//   - Calculate refund amount from order items
//   - Prevent over-refunding
//   - Delegate atomic DB work to repository
//   - Write audit logs
// =========================================================

import { ShopRepository }   from "../shop/shop.repository.js";
import { AuditService }     from "../audit/audit.service.js";
import { OrderRepository }  from "../order/order.repository.js";
import { RefundRepository } from "./refund.repository.js";
import { PaymentRepository } from "../payment/payment.repository.js";
import { ProcessRefundInput } from "./refund.types.js";
import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";
import app from "../../app.js";

// ── Permission constants ──────────────────────────────────
// Only OWNER and MANAGER can process refunds.
// CASHIER cannot — this is a deliberate business rule.
// Refunds involve restocking decisions and financial reversals
// that should require manager-level authority.
const REFUND_ROLES = ["OWNER", "MANAGER"] as const;

// ── Permission helper ─────────────────────────────────────
async function assertCanRefund(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(
    shopId,
    userId
  );

  if (!member || !member.is_active || !REFUND_ROLES.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
}

// ── Fetch payment helper ──────────────────────────────────
// We need the payment ID to link the refund record.
// We fetch the most recent PAID payment for this order.
async function getPaidPayment(orderId: string) {
  const result = await pool.query(
    `
    SELECT id, amount
    FROM payments
    WHERE order_id = $1
      AND status IN ('PAID', 'PARTIALLY_REFUNDED')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [orderId]
  );

  return result.rows[0] ?? null;
}

// ── Calculate partial refund amount ──────────────────────
// Fetch the unit price of each item being refunded and
// multiply by the refunded qty.
// We use the stored subtotal/qty ratio to get the effective
// unit price (includes modifiers).
async function calculatePartialRefundAmount(
  orderId: string,
  items: { order_item_id: string; qty: number }[]
): Promise<number> {
  let total = 0;

  for (const item of items) {
    const result = await pool.query(
      `
      SELECT subtotal, qty
      FROM order_items
      WHERE id       = $1
        AND order_id = $2
        AND status   = 'ACTIVE'
      `,
      [item.order_item_id, orderId]
    );

    if (result.rows.length === 0) {
        throw new appError("ORDER_ITEM_NOT_FOUND", 404);
    }

    const row = result.rows[0];

    // Effective unit price = subtotal / qty
    // This includes modifiers already baked into subtotal
    const effectiveUnitPrice = parseFloat(row.subtotal) / row.qty;
    total += effectiveUnitPrice * item.qty;
  }

  // Round to 2 decimal places to avoid float drift
  return parseFloat(total.toFixed(2));
}

export class RefundService {

  static async processRefund(params: ProcessRefundInput) {
    await assertCanRefund(params.shopId, params.requesterId);

    // ── Fetch and validate order ──────────────────────
    const order = await OrderRepository.findOrderWithItems(
      params.orderId,
      params.shopId
    );
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    // Can only refund a PAID order and cannot refund an already refunded order
    if (order.status === "REFUNDED") {
     throw new appError("ORDER_FULLY_REFUNDED", 400);
    }

    if (order.status !== "PAID") {
      throw new appError("ORDER_NOT_PAID", 400);
    }

    // ── Fetch the payment ─────────────────────────────
    const payment = await getPaidPayment(params.orderId);
    if (!payment) throw new appError("PAYMENT_NOT_FOUND", 404);

    // ── Check existing refunds ────────────────────────
    // Prevent refunding more than what was originally paid
    const alreadyRefunded = await RefundRepository.getTotalRefundedAmount(
      params.orderId
    );

    const originalAmount = parseFloat(Number(payment.amount).toFixed(2));
    const remainingRefundable = parseFloat(
      (originalAmount - alreadyRefunded).toFixed(2)
    );

    if (remainingRefundable <= 0) {
      throw new appError("ORDER_FULLY_REFUNDED", 400);
    }

    // ── FULL REFUND ───────────────────────────────────
    if (params.type === "FULL") {
      const refundAmount = remainingRefundable;

      const refund = await RefundRepository.processFullRefund({
        orderId:      params.orderId,
        shopId:       params.shopId,
        paymentId:    payment.id,
        refundAmount,
        restock:      params.restock ?? false,
        reason:       params.reason,
        processedBy:  params.requesterId,
      });

      // Count restocked vs skipped items for response
      const activeItems = order.items.filter(i => i.status === "ACTIVE");
      const restockedItems  = params.restock ? activeItems.length : 0;
      const skippedRestock  = params.restock ? 0 : activeItems.length;

      await AuditService.log({
        shopId:   params.shopId,
        userId:   params.requesterId,
        action:   "REFUND_FULL_PROCESSED",
        entity:   "REFUND",
        entityId: refund.id,
        metadata: {
          orderId:         params.orderId,
          order_no:        order.order_no,
          refundAmount,
          restock:         params.restock ?? false,
          reason:          params.reason,
          restockedItems,
          skippedRestock,
        },
      });

      return {
        refund,
        refund_amount:    refundAmount,
        restocked_items:  restockedItems,
        skipped_restock:  skippedRestock,
      };
    }

    // ── PARTIAL REFUND ────────────────────────────────
    if (params.type === "PARTIAL") {
      if (!params.items || params.items.length === 0) {
        throw new appError("REFUND_ITEMS_REQUIRED", 400);
      }

      // Calculate how much this partial refund costs
      const refundAmount = await calculatePartialRefundAmount(
        params.orderId,
        params.items
      );

      // Cannot refund more than what's left to refund
      if (refundAmount > remainingRefundable) {
        throw new appError("REFUND_EXCEEDS_REMAINING", 400);
      }

      const refund = await RefundRepository.processPartialRefund({
        orderId:      params.orderId,
        shopId:       params.shopId,
        paymentId:    payment.id,
        refundAmount,
        items:        params.items,
        reason:       params.reason,
        processedBy:  params.requesterId,
      });

      // Count restocked vs skipped items for response
      const restockedItems = params.items.filter(i => i.restock).length;
      const skippedRestock = params.items.filter(i => !i.restock).length;

      await AuditService.log({
        shopId:   params.shopId,
        userId:   params.requesterId,
        action:   "REFUND_PARTIAL_PROCESSED",
        entity:   "REFUND",
        entityId: refund.id,
        metadata: {
          orderId:         params.orderId,
          order_no:        order.order_no,
          refundAmount,
          itemCount:       params.items.length,
          reason:          params.reason,
          restockedItems,
          skippedRestock,
        },
      });

      return {
        refund,
        refund_amount:   refundAmount,
        restocked_items: restockedItems,
        skipped_restock: skippedRestock,
      };
    }

    // Should never reach here — Zod schema validates type
    throw new appError("INVALID_REFUND_TYPE", 400);
  }

  static async getRefundsByOrder(params: {
    orderId: string;
    shopId: string;
    requesterId: string;
  }) {
    await assertCanRefund(params.shopId, params.requesterId);

    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return RefundRepository.findRefundsByOrder(params.orderId);
  }
}