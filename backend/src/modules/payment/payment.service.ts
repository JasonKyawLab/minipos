// =========================================================
// payment.service.ts
// Path: backend/src/modules/payment/payment.service.ts
// =========================================================

import { ShopRepository }    from "../shop/shop.repository.js";
import { AuditService }      from "../audit/audit.service.js";
import { OrderRepository }   from "../order/order.repository.js";
import { PaymentRepository } from "./payment.repository.js";
import { ProcessPaymentInput } from "./payment.types.js";

const ALL_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

async function assertShopMember(
  shopId: string,
  userId: string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(
    shopId,
    userId
  );
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new Error("FORBIDDEN");
  }
}

export class PaymentService {

  static async processPayment(
    params: ProcessPaymentInput & { requesterId: string }
  ) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    // Fetch the order to validate it
    const order = await OrderRepository.findOrderWithItems(
      params.orderId,
      params.shopId
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");

    // Cannot pay an already paid or cancelled order
    if (order.status === "PAID") {
      throw new Error("ORDER_ALREADY_PAID");
    }
    if (order.status === "CANCELLED") {
      throw new Error("ORDER_CANCELLED");
    }

    // Must have at least one item to pay
    if (!order.items || order.items.length === 0) {
      throw new Error("ORDER_HAS_NO_ITEMS");
    }

    // Amount must match order total exactly
    // We round to 2 decimal places to avoid float comparison issues
    const expectedTotal = parseFloat(Number(order.total_amount).toFixed(2));
    const providedAmount = parseFloat(Number(params.amount).toFixed(2));

    if (providedAmount !== expectedTotal) {
      throw new Error("AMOUNT_MISMATCH");
    }

    // Process the payment (atomic transaction in repository)
    const payment = await PaymentRepository.processPayment({
      orderId:         params.orderId,
      shopId:          params.shopId,
      cashierId:       params.requesterId,
      method:          params.method,
      amount:          params.amount,
      receivedAmount:  params.receivedAmount,
      note:            params.note,
    });

    const changeAmount =
      params.method === "CASH" && params.receivedAmount != null
        ? parseFloat((params.receivedAmount - params.amount).toFixed(2))
        : null;

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PAYMENT_PROCESSED",
      entity:   "PAYMENT",
      entityId: payment.id,
      metadata: {
        orderId:    params.orderId,
        order_no:   order.order_no,
        method:     params.method,
        amount:     params.amount,
        change:     changeAmount,
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
    orderId: string;
    shopId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");

    return PaymentRepository.findPaymentsByOrder(params.orderId);
  }
}