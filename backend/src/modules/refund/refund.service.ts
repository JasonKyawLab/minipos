import { AuditService }     from "../audit/audit.service.js";
import { OrderRepository }  from "../order/order.repository.js";
import { RefundRepository } from "./refund.repository.js";
import { KitchenService }   from "../kitchen/kitchen.service.js";
import { ProcessRefundInput, RefundItemInput, ListRefundsFilter } from "./refund.types.js";
import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";
import { assertShopRole } from "../../utils/authorize.js";
import { WRITE_ROLES } from "../../constants/roles.constants.js";
import { SOCKET_EVENTS } from "../socket/socket.events.js";
import { emitToShop } from "../socket/socket.js";

// ── Fetch payment helper ──────────────────────────────────
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

// ── Calculate and validate refund amounts helper ───────
// Validates each item and calculates total refund amount.
// Note: this is a PRE-CHECK only. The repository will do
// the same checks again inside a transaction with FOR UPDATE
// to prevent race conditions.
async function calculateRefundAmounts(
  orderId: string,
  shopId: string,
  requesterId: string,
  items: RefundItemInput[]
): Promise<{ total: number; validatedItems: RefundItemInput[] }> {
  let total = 0;
  const validatedItems: RefundItemInput[] = [];

  for (const refundItem of items) {

    if (refundItem.qty <= 0) {
      throw new appError("REFUND_QTY_MUST_BE_POSITIVE", 400);
    }

    const result = await pool.query(
      `
      SELECT status, subtotal, qty, refunded_qty
      FROM order_items
      WHERE id = $1 AND order_id = $2
      `,
      [refundItem.order_item_id, orderId]
    );

    if (result.rows.length === 0) {
      await AuditService.log({
        shopId,
        userId: requesterId,
        action: "REFUND_VALIDATION_FAILED",
        entity: "ORDER_ITEM",
        entityId: refundItem.order_item_id,
        metadata: { reason: "ITEM_NOT_FOUND" },
      });
      throw new appError("ORDER_ITEM_NOT_FOUND", 404);
    }

    const row = result.rows[0];

    if (row.status !== "ACTIVE" || row.refunded_qty >= row.qty) {
      await AuditService.log({
        shopId,
        userId: requesterId,
        action: "REFUND_VALIDATION_FAILED",
        entity: "ORDER_ITEM",
        entityId: refundItem.order_item_id,
        metadata: {
          reason:         "ITEM_ALREADY_REFUNDED",
          current_status: row.status,
        },
      });
      throw new appError("ORDER_ITEM_ALREADY_REFUNDED", 400);
    }

    const remainingQty = row.qty - row.refunded_qty;
    if (refundItem.qty > remainingQty) {
      await AuditService.log({
        shopId,
        userId: requesterId,
        action: "REFUND_VALIDATION_FAILED",
        entity: "ORDER_ITEM",
        entityId: refundItem.order_item_id,
        metadata: {
          reason:        "QTY_EXCEEDS_REMAINING",
          requested_qty: refundItem.qty,
          remaining_qty: remainingQty,
        },
      });
      throw new appError("REFUND_QTY_EXCEEDS_ORIGINAL", 400);
    }

    // Effective unit price includes modifiers baked into subtotal
    const effectiveUnitPrice = parseFloat(row.subtotal) / row.qty;
    total += effectiveUnitPrice * refundItem.qty;
    validatedItems.push(refundItem);
  }

  return {
    total:          parseFloat(total.toFixed(2)),
    validatedItems,
  };
}

export class RefundService {

  static async processRefund(params: ProcessRefundInput) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

    if (params.idempotency_key) {
      const existing = await RefundRepository.findRefundByIdempotencyKey(
        params.idempotency_key
      );
      if (existing) {
        return {
          refund:          existing,
          refund_amount:   parseFloat(String(existing.amount)),
          restocked_items: 0,
          skipped_restock: 0,
          was_duplicate:   true,
        };
      }
    }

    // ── Fetch and validate order ──────────────────────
    const order = await OrderRepository.findOrderWithItems(
      params.orderId,
      params.shopId
    );
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

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
    const alreadyRefunded     = await RefundRepository.getTotalRefundedAmount(params.orderId);
    const originalAmount      = parseFloat(Number(payment.amount).toFixed(2));
    const remainingRefundable = parseFloat((originalAmount - alreadyRefunded).toFixed(2));

    if (remainingRefundable <= 0) {
      throw new appError("ORDER_FULLY_REFUNDED", 400);
    }

    // ── FULL REFUND ───────────────────────────────────
    if (params.type === "FULL") {
      const refundAmount = remainingRefundable;

      const { refund, was_duplicate } = await RefundRepository.processFullRefund({
        orderId:         params.orderId,
        shopId:          params.shopId,
        paymentId:       payment.id,
        refundAmount,
        restock:         params.restock ?? false,
        reason:          params.reason,
        processedBy:     params.requesterId,
        idempotency_key: params.idempotency_key,
      });

      if (!was_duplicate) {
        const activeItems    = order.items.filter(i => i.status === "ACTIVE");
        const restockedItems = params.restock ? activeItems.length : 0;
        const skippedRestock = params.restock ? 0 : activeItems.length;

        await AuditService.log({
          shopId:   params.shopId,
          userId:   params.requesterId,
          action:   "REFUND_FULL_PROCESSED",
          entity:   "REFUND",
          entityId: refund.id,
          metadata: {
            orderId:      params.orderId,
            order_no:     order.order_no,
            refundAmount,
            restock:      params.restock ?? false,
            reason:       params.reason,
            restockedItems,
            skippedRestock,
          },
        });

        try {
          emitToShop(params.shopId, SOCKET_EVENTS.REFUND_PROCESSED, {
            orderId:      params.orderId,
            orderNo:      order.order_no,
            refundAmount,
            type:         "FULL",
            restocked:    params.restock ?? false,
            timestamp:    new Date().toISOString(),
          });
        } catch (socketErr) {
          console.error("Socket emit failed:", socketErr);
        }

        // Cancel any active kitchen ticket so it disappears from kitchen displays
        try {
          await KitchenService.cancelTicket({
            shopId:  params.shopId,
            orderId: params.orderId,
            orderNo: order.order_no,
          });
        } catch {
          // Ticket may not exist (retail/takeaway without kitchen routing) — safe to ignore
        }

        return {
          refund,
          refund_amount:   refundAmount,
          restocked_items: restockedItems,
          skipped_restock: skippedRestock,
          was_duplicate:   false,
        };
      }

      return {
        refund,
        refund_amount:   refundAmount,
        restocked_items: 0,
        skipped_restock: 0,
        was_duplicate:   true,
      };
    }

    // ── PARTIAL REFUND ────────────────────────────────
    if (params.type === "PARTIAL") {
      if (!params.items || params.items.length === 0) {
        throw new appError("REFUND_ITEMS_REQUIRED", 400);
      }

      const { total: refundAmount, validatedItems } = await calculateRefundAmounts(
        params.orderId,
        params.shopId,
        params.requesterId,
        params.items
      );

      if (refundAmount > remainingRefundable) {
        throw new appError("REFUND_EXCEEDS_REMAINING", 400);
      }

      const { refund, was_duplicate } = await RefundRepository.processPartialRefund({
        orderId:         params.orderId,
        shopId:          params.shopId,
        paymentId:       payment.id,
        refundAmount,
        items:           validatedItems,
        reason:          params.reason,
        processedBy:     params.requesterId,
        idempotency_key: params.idempotency_key,
      });

      if (!was_duplicate) {
        const restockedItems = validatedItems.filter(i => i.restock).length;
        const skippedRestock = validatedItems.filter(i => !i.restock).length;

        await AuditService.log({
          shopId:   params.shopId,
          userId:   params.requesterId,
          action:   "REFUND_PARTIAL_PROCESSED",
          entity:   "REFUND",
          entityId: refund.id,
          metadata: {
            orderId:      params.orderId,
            order_no:     order.order_no,
            refundAmount,
            itemCount:    validatedItems.length,
            reason:       params.reason,
            restockedItems,
            skippedRestock,
          },
        });

        try {
          emitToShop(params.shopId, SOCKET_EVENTS.REFUND_PROCESSED, {
            orderId:      params.orderId,
            orderNo:      order.order_no,
            refundAmount,
            type:         "PARTIAL",
            items:        validatedItems.map(i => ({ order_item_id: i.order_item_id, qty: i.qty, restock: i.restock })),
            timestamp:    new Date().toISOString(),
          });
        } catch (socketErr) {
          console.error("Socket emit failed:", socketErr);
        }

        return {
          refund,
          refund_amount:   refundAmount,
          restocked_items: restockedItems,
          skipped_restock: skippedRestock,
          was_duplicate:   false,
        };
      }

      return {
        refund,
        refund_amount:   refundAmount,
        restocked_items: 0,
        skipped_restock: 0,
        was_duplicate:   true,
      };
    }

    throw new appError("INVALID_REFUND_TYPE", 400);
  }

  static async getRefundsByOrder(params: {
    orderId: string;
    shopId: string;
    requesterId: string;
    limit?: number;
    offset?: number;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return RefundRepository.findRefundsByOrder({
      orderId: params.orderId,
      limit:   params.limit,
      offset:  params.offset,
    });
  }
}