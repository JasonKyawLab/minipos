import { AuditService }      from "../audit/audit.service.js";
import { OrderRepository }   from "../order/order.repository.js";
import { PaymentRepository } from "./payment.repository.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";
import { TableRepository }   from "../table/table.repository.js";
import { ProcessPaymentInput } from "./payment.types.js";
import { appError }          from "../../utils/appError.js";
import { assertShopRole }    from "../../utils/authorize.js";
import { READ_ROLES }        from "../../constants/roles.constants.js";
import { SOCKET_EVENTS }     from "../socket/socket.events.js";
import { emitToShop, emitToQrSession } from "../socket/socket.js";

// ── Helper: resolve table_number for kitchen ticket ───────
// TAKEAWAY and RETAIL orders have no table_id, so this
// returns null for those types. Only DINE_IN / QR have tables.
async function resolveTableNumber(
  shopId:    string,
  orderType: string,
  tableId:   string | null
): Promise<string | null> {
  if ((orderType === "DINE_IN" || orderType === "QR") && tableId) {
    const table = await TableRepository.findTableById(tableId, shopId);
    return table?.table_number ?? null;
  }
  return null;
}

export class PaymentService {

  static async processPayment(params: ProcessPaymentInput & { requesterId: string }) {
    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

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
    const wasOpen = order.status === "OPEN"
      && (order.order_type === "TAKEAWAY" || order.order_type === "RETAIL");

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

    try {
      emitToQrSession(params.orderId, SOCKET_EVENTS.QR_ORDER_STATUS, {
        orderId:   params.orderId,
        newStatus: "PAID",
        timestamp: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("QR session socket emit failed:", socketErr);
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
        const tableNumber    = await resolveTableNumber(params.shopId, order.order_type, order.table_id ?? null);
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
    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return PaymentRepository.findPaymentsByOrder(params.orderId);
  }
}