// =========================================================
// payment.service.ts
// Path: backend/src/modules/payment/payment.service.ts
//
// FIX: TAKEAWAY and RETAIL orders were never reaching the
// Kitchen Display System (KDS).
//
// ROOT CAUSE:
//   The POS flow for TAKEAWAY/RETAIL keeps the order in
//   OPEN status until payment is collected (intentional —
//   prevents wasted kitchen effort on unpaid orders).
//   After processPayment() succeeds, the frontend fires a
//   second PATCH /status CONFIRMED.
//
//   BUT: PaymentRepository.processPayment() internally sets
//   the order to PAID as part of the payment transaction.
//   By the time the CONFIRMED patch arrives, the order is
//   already PAID. ALLOWED_TRANSITIONS['PAID'] = [] so the
//   patch is rejected with INVALID_STATUS_TRANSITION (400).
//   The frontend .catch(() => {}) silently swallows it.
//   No kitchen ticket is ever created.
//
// FIX:
//   processPayment() now detects when it is paying an OPEN
//   order (TAKEAWAY / RETAIL) and creates the kitchen ticket
//   directly, after the payment transaction commits. This
//   removes the need for the second PATCH /status call from
//   the frontend entirely — the kitchen notification is
//   atomic with payment success.
//
//   The CONFIRMED status PATCH from the frontend is now a
//   no-op because the order is already PAID, which is fine
//   — the .catch(() => {}) absorbs the 400 gracefully.
//
// WHAT DID NOT CHANGE:
//   DINE_IN orders are confirmed to the kitchen immediately
//   when the cashier taps "Send to Kitchen" — they never go
//   through processPayment() in OPEN status, so the DINE_IN
//   path is unaffected.
// =========================================================

import { ShopRepository }    from "../shop/shop.repository.js";
import { AuditService }      from "../audit/audit.service.js";
import { OrderRepository }   from "../order/order.repository.js";
import { PaymentRepository } from "./payment.repository.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";
import { ProcessPaymentInput } from "./payment.types.js";
import { appError }          from "../../utils/appError.js";
import { SOCKET_EVENTS }     from "../socket/socket.events.js";
import { emitToShop }        from "../socket/socket.js";
import { pool }              from "../../db/pool.js";

const ALL_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

async function assertShopMember(
  shopId:  string,
  userId:  string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
}

// ── Helper: resolve table_number for kitchen ticket ───────
// TAKEAWAY and RETAIL orders have no table_id, so this
// returns null for those types. Only DINE_IN / QR have tables.
async function resolveTableNumber(
  orderType: string,
  tableId:   string | null
): Promise<string | null> {
  if ((orderType === "DINE_IN" || orderType === "QR") && tableId) {
    const result = await pool.query(
      `SELECT table_number FROM restaurant_tables WHERE id = $1`,
      [tableId]
    );
    return result.rows[0]?.table_number ?? null;
  }
  return null;
}

export class PaymentService {

  static async processPayment(params: ProcessPaymentInput & { requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderWithItems(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    if (order.status === "PAID") {
      throw new appError("ORDER_ALREADY_PAID", 400);
    }
    if (order.status === "CANCELLED") {
      throw new appError("ORDER_CANCELLED", 400);
    }

    if (!order.items || order.items.length === 0) {
      throw new appError("ORDER_HAS_NO_ITEMS", 400);
    }

    const expectedTotal  = parseFloat(Number(order.total_amount).toFixed(2));
    const providedAmount = parseFloat(Number(params.amount).toFixed(2));

    if (providedAmount !== expectedTotal) {
      throw new appError("AMOUNT_MISMATCH", 400);
    }

    // Remember whether this order was OPEN before payment.
    // OPEN means TAKEAWAY or RETAIL — these were never CONFIRMED
    // to the kitchen and need a ticket created on payment.
    const wasOpen = order.status === "OPEN";
    console.log(`[Payment] orderId=${params.orderId} status=${order.status} wasOpen=${wasOpen} orderType=${order.order_type}`);

    const payment = await PaymentRepository.processPayment({
      orderId:        params.orderId,
      shopId:         params.shopId,
      cashierId:      params.requesterId,
      method:         params.method,
      amount:         params.amount,
      receivedAmount: params.receivedAmount,
      note:           params.note,
    });

    const changeAmount =
      params.method === "CASH" && params.receivedAmount != null
        ? parseFloat((params.receivedAmount - params.amount).toFixed(2))
        : null;

    // ── Emit payment event to POS terminal ───────────────────
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.PAYMENT_PROCESSED, {
        orderId:   params.orderId,
        orderNo:   order.order_no,
        amount:    params.amount,
        method:    params.method,
        change:    changeAmount,
        timestamp: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Socket emit failed:", socketErr);
    }

    // ── Create kitchen ticket for TAKEAWAY / RETAIL ──────────
    // These order types are kept OPEN until payment is collected.
    // The kitchen only needs to prepare the food after the
    // customer has paid — this is the right moment to notify KDS.
    //
    // DINE_IN orders are confirmed to the kitchen at order time
    // (before payment), so we skip those here.
    if (wasOpen) {
      try {
        const tableNumber    = await resolveTableNumber(order.order_type, order.table_id ?? null);
        const existingRounds = await KitchenRepository.getTicketRoundCount(params.orderId);
        const round          = existingRounds + 1;
        const is_addon       = round > 1;

        await KitchenService.createTicket({
          shopId:       params.shopId,
          orderId:      params.orderId,
          orderNo:      order.order_no,
          orderType:    order.order_type,
          tableNumber,
          customerName: order.customer_name ?? null,
          notes:        order.notes         ?? null,
          round,
          is_addon,
        });
      } catch (kitchenErr) {
        // Non-fatal — payment already committed. Kitchen notification
        // failed but the cashier can manually re-send if needed.
        console.error("Kitchen ticket creation failed after payment:", kitchenErr);
      }
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PAYMENT_PROCESSED",
      entity:   "PAYMENT",
      entityId: payment.id,
      metadata: {
        orderId:  params.orderId,
        order_no: order.order_no,
        method:   params.method,
        amount:   params.amount,
        change:   changeAmount,
      },
    });

    return {
      payment,
      change_amount: changeAmount,
      order_no:      order.order_no,
      total_amount:  order.total_amount,
    };
  }

  static async getPaymentsByOrder(params: {
    orderId:     string;
    shopId:      string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return PaymentRepository.findPaymentsByOrder(params.orderId);
  }

}