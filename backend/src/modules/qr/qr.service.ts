// =========================================================
// qr.service.ts
// Path: backend/src/modules/qr/qr.service.ts
// =========================================================
// Business logic for the QR ordering flow.
//
// Key design decisions:
//   1. placeQrOrder() reuses OrderRepository directly — the
//      QR order is just a regular order with type=QR and a
//      pre-set tableId. No parallel order creation path.
//   2. After placing an order, we emit TWO events:
//      - QR_ORDER_PLACED → shop room (staff see new order)
//      - (customer joins qr_session room after receiving orderId)
//   3. getQrOrderStatus() returns minimal data — only what
//      the customer needs to track their order. Never leaks
//      staff notes or internal pricing.
// =========================================================

import { QrRepository } from "./qr.repository.js";
import { OrderRepository } from "../order/order.repository.js";
import { ProductRepository } from "../product/product.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { appError } from "../../utils/appError.js";
import { emitToShop } from "../socket/socket.js";
import { SOCKET_EVENTS } from "../socket/socket.events.js";
import { PlaceQrOrderInput } from "./qr.types.js";
import { pool } from "../../db/pool.js";

async function getShopTaxRate(shopId: string): Promise<number> {
  const result = await pool.query(
    `SELECT tax_rate FROM shops WHERE id = $1 AND is_deleted = false`,
    [shopId]
  );
  if (result.rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);
  return parseFloat(result.rows[0].tax_rate);
}

export class QrService {

  // ── Get public menu ──────────────────────────────────────
  static async getMenu(shopId: string) {
    return QrRepository.getPublicMenu(shopId);
  }

  // ── Place order as a customer (no auth) ──────────────────
  static async placeOrder(params: {
    shopId: string;
    tableId: string;
    input: PlaceQrOrderInput;
  }) {
    if (!params.input.items || params.input.items.length === 0) {
      throw new appError("ORDER_HAS_NO_ITEMS", 400);
    }

    const taxRate = await getShopTaxRate(params.shopId);

    // Create the order shell
    const order = await OrderRepository.createOrder(
      {
        shopId:        params.shopId,
        cashierId:     null as any,  // no cashier — customer self-service
        orderType:     "QR",
        tableId:       params.tableId,
        customerName:  params.input.customer_name ?? undefined,
        notes:         params.input.notes ?? undefined,
      },
      taxRate
    );

    // Add each item
    for (const inputItem of params.input.items) {
      const productItem = await ProductRepository.findItemById(
        inputItem.product_item_id,
        params.shopId
      );

      if (!productItem) throw new appError("PRODUCT_ITEM_NOT_FOUND", 404);
      if (!productItem.is_active) throw new appError("PRODUCT_ITEM_INACTIVE", 400);
      if (productItem.is_sold_out) throw new appError("PRODUCT_ITEM_SOLD_OUT", 400);

      const productModel = await ProductRepository.findModelById(
        productItem.product_model_id,
        params.shopId
      );
      if (!productModel) throw new appError("PRODUCT_MODEL_NOT_FOUND", 404);

      const modifiers = (inputItem.modifiers ?? []).map(m => ({
        modifier_option_id: m.modifier_option_id,
        name:               m.name,
        price_delta:        m.price_delta,
      }));

      await OrderRepository.addOrderItem({
        orderId:             order.id,
        productItemId:       inputItem.product_item_id,
        productNameSnapshot: productModel.name,
        itemNameSnapshot:    productItem.name,
        unitPriceSnapshot:   Number(productItem.price),
        qty:                 inputItem.qty,
        modifierSnapshot:    modifiers,
        itemNote:            inputItem.item_note,
      });
    }

    // Recalculate totals after all items are added
    const finalOrder = await OrderRepository.recalculateOrderTotals(order.id, taxRate);

    // Notify staff in real-time
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.QR_ORDER_PLACED, {
        orderId:      finalOrder.id,
        orderNo:      finalOrder.order_no,
        tableId:      params.tableId,
        customerName: params.input.customer_name ?? null,
        totalAmount:  finalOrder.total_amount,
        itemCount:    params.input.items.length,
        timestamp:    new Date().toISOString(),
      });
    } catch (socketErr) {
      // Non-fatal — order was saved, socket is best-effort
      console.error("Socket emit failed:", socketErr);
    }

    await AuditService.log({
      shopId:   params.shopId,
      action:   "QR_ORDER_PLACED",
      entity:   "ORDER",
      entityId: finalOrder.id,
      metadata: {
        orderNo:      finalOrder.order_no,
        tableId:      params.tableId,
        customerName: params.input.customer_name,
        itemCount:    params.input.items.length,
      },
    });

    // Return just what the customer needs to track their order
    return {
      order_id:     finalOrder.id,
      order_no:     finalOrder.order_no,
      total_amount: finalOrder.total_amount,
      status:       finalOrder.status,
    };
  }

  // ── Get order status (customer polling / initial load) ───
  // Deliberately minimal response — no staff notes, no cashier info.
  static async getOrderStatus(params: {
    shopId: string;
    orderId: string;
  }) {
    const order = await OrderRepository.findOrderWithItems(
      params.orderId,
      params.shopId
    );

    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return {
      order_id:     order.id,
      order_no:     order.order_no,
      status:       order.status,
      total_amount: order.total_amount,
      items: order.items.map(item => ({
        id:                   item.id,
        product_name:         item.product_name_snapshot,
        item_name:            item.item_name_snapshot,
        qty:                  item.qty,
        unit_price:           item.unit_price_snapshot,
        subtotal:             item.subtotal,
        modifier_snapshot:    item.modifier_snapshot,
        item_note:            item.item_note,
        status:               item.status,
      })),
    };
  }
}