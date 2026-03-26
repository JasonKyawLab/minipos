// =========================================================
// payment.service.ts
// Path: backend/src/modules/payment/payment.service.ts
// Line: Replace all error throws with appError
// =========================================================

import { ShopRepository } from "../shop/shop.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { OrderRepository } from "../order/order.repository.js";
import { PaymentRepository } from "./payment.repository.js";
import { ProcessPaymentInput } from "./payment.types.js";
import { appError } from "../../utils/appError.js";
import { SOCKET_EVENTS } from "../socket/socket.events.js";
import { emitToShop } from "../socket/socket.js";

const ALL_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

async function assertShopMember(
  shopId: string,
  userId: string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
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

    const expectedTotal = parseFloat(Number(order.total_amount).toFixed(2));
    const providedAmount = parseFloat(Number(params.amount).toFixed(2));

    if (providedAmount !== expectedTotal) {
      throw new appError("AMOUNT_MISMATCH", 400);
    }

    const payment = await PaymentRepository.processPayment({
      orderId: params.orderId,
      shopId: params.shopId,
      cashierId: params.requesterId,
      method: params.method,
      amount: params.amount,
      receivedAmount: params.receivedAmount,
      note: params.note,
    });

    const changeAmount =
      params.method === "CASH" && params.receivedAmount != null
        ? parseFloat((params.receivedAmount - params.amount).toFixed(2))
        : null;

    // Emit real-time event
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.PAYMENT_PROCESSED, {
        orderId: params.orderId,
        orderNo: order.order_no,
        amount: params.amount,
        method: params.method,
        change: changeAmount,
        timestamp: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Socket emit failed:", socketErr);
    }

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: "PAYMENT_PROCESSED",
      entity: "PAYMENT",
      entityId: payment.id,
      metadata: {
        orderId: params.orderId,
        order_no: order.order_no,
        method: params.method,
        amount: params.amount,
        change: changeAmount,
      },
    });

    return {
      payment,
      change_amount: changeAmount,
      order_no: order.order_no,
      total_amount: order.total_amount,
    };
  }

  static async getPaymentsByOrder(params: {
    orderId: string;
    shopId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return PaymentRepository.findPaymentsByOrder(params.orderId);
  }
}