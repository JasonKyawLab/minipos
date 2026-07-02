// backend/src/modules/qr/qr.service.ts
//
// FLOW D — Mixed QR Architecture
//
// CHANGED: every raw pool.query() call removed — replaced with
// repository methods:
//   getShopTaxRate (duplicate of order.service's own helper)
//     → ShopRepository.findOperationalInfo()
//   findActiveTableOrder / closing-order lookups
//     → OrderRepository.findActiveOrderForTable() /
//       OrderRepository.findClosingQrOrderForTable()
//   items+ticket join in getTableSession
//     → OrderRepository.findActiveItemsWithTicketInfo()
//   "SELECT currency FROM shops" (x2)
//     → ShopRepository.findBasicInfo()
//   table_number lookup in requestBill
//     → TableRepository.findTableById()
//   CLOSING/OPEN status updates
//     → OrderRepository.markOrderClosing() / markOrderOpen()
//
// No business logic changed. This file no longer imports `pool`.

import { QrRepository }      from "./qr.repository.js";
import { OrderRepository }   from "../order/order.repository.js";
import { ProductRepository } from "../product/product.repository.js";
import { ShopRepository }    from "../shop/shop.repository.js";
import { TableRepository }   from "../table/table.repository.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";
import { AuditService }      from "../audit/audit.service.js";
import { appError }          from "../../utils/appError.js";
import { emitToShop, emitToQrSession, emitToPosTerminals} from "../socket/socket.js";
import { SOCKET_EVENTS }     from "../socket/socket.events.js";
import { PlaceQrOrderInput } from "./qr.types.js";

async function getShopTaxRate(shopId: string): Promise<number> {
  const info = await ShopRepository.findOperationalInfo(shopId);
  if (!info) throw new appError("SHOP_NOT_FOUND", 404);
  return info.taxRate;
}

export class QrService {

  static async getMenu(shopId: string) {
    return QrRepository.getPublicMenu(shopId);
  }

  // ── Get table session ────────────────────────────────────
  static async getTableSession(params: { shopId: string; tableId: string }) {
    // Check OPEN first, then CLOSING
    let activeOrder = await OrderRepository.findActiveOrderForTable(params.shopId, params.tableId);

    if (!activeOrder) {
      activeOrder = await OrderRepository.findClosingQrOrderForTable(params.shopId, params.tableId);
    }

    if (!activeOrder) return null;

    const items = await OrderRepository.findActiveItemsWithTicketInfo(activeOrder.id);
    const shop  = await ShopRepository.findBasicInfo(params.shopId);

    return {
      order_id:       activeOrder.id,
      order_no:       activeOrder.order_no,
      status:         activeOrder.status,
      bill_requested: activeOrder.bill_requested ?? false,
      subtotal:       parseFloat(String(activeOrder.subtotal)),
      tax_amount:     parseFloat(String(activeOrder.tax_amount)),
      total_amount:   parseFloat(String(activeOrder.total_amount)),
      customer_name:  activeOrder.customer_name,
      currency:       shop?.currency ?? 'THB',
      items,
    };
  }

  // ── Place order (Flow D) ─────────────────────────────────
  static async placeOrder(params: {
    shopId:      string;
    tableId:     string;
    tableNumber: string;
    input:       PlaceQrOrderInput;
  }) {
    if (!params.input.items || params.input.items.length === 0) {
      throw new appError("ORDER_HAS_NO_ITEMS", 400);
    }

    // Guard: reject if table is locked
    const lockedOrder = await OrderRepository.findClosingQrOrderForTable(params.shopId, params.tableId);
    if (lockedOrder) {
      throw new appError("TABLE_IS_CLOSING", 400);
    }

    const taxRate = await getShopTaxRate(params.shopId);

    // Find or create master order
    let order = await OrderRepository.findActiveOrderForTable(params.shopId, params.tableId);
    let isNewOrder = false;

    if (!order) {
      order = await OrderRepository.createOrder(
        {
          shopId:       params.shopId,
          cashierId:    null,
          orderType:    "QR",
          tableId:      params.tableId,
          customerName: params.input.customer_name ?? undefined,
          notes:        params.input.notes         ?? undefined,
        },
        taxRate
      );
      isNewOrder = true;
    }

    // Add items
    for (const inputItem of params.input.items) {
      const productItem = await ProductRepository.findItemById(
        inputItem.product_item_id,
        params.shopId
      );
      if (!productItem)           throw new appError("PRODUCT_ITEM_NOT_FOUND", 404);
      if (!productItem.is_active)  throw new appError("PRODUCT_ITEM_INACTIVE", 400);
      if (productItem.is_sold_out) throw new appError("PRODUCT_ITEM_SOLD_OUT", 400);

      const productModel = await ProductRepository.findModelById(
        productItem.product_model_id,
        params.shopId
      );
      if (!productModel) throw new appError("PRODUCT_MODEL_NOT_FOUND", 404);

      await OrderRepository.addOrderItem({
        orderId:             order.id,
        productItemId:       inputItem.product_item_id,
        productNameSnapshot: productModel.name,
        itemNameSnapshot:    productItem.name,
        unitPriceSnapshot:   Number(productItem.price),
        qty:                 inputItem.qty,
        modifierSnapshot:    (inputItem.modifiers ?? []).map(m => ({
          modifier_option_id: m.modifier_option_id,
          name:               m.name,
          price_delta:        m.price_delta,
        })),
        itemNote: inputItem.item_note,
      });
    }

    const updatedOrder = await OrderRepository.recalculateOrderTotals(order.id, taxRate);

    // Determine round
    const existingRounds = await KitchenRepository.getTicketRoundCount(order.id);
    const round    = existingRounds + 1;
    const is_addon = round > 1;

    // Create kitchen ticket for this round
    try {
      await KitchenService.createTicket({
        shopId:       params.shopId,
        orderId:      order.id,
        orderNo:      order.order_no,
        orderType:    "QR",
        tableNumber:  params.tableNumber,
        customerName: params.input.customer_name ?? order.customer_name ?? null,
        notes:        params.input.notes ?? null,
        round,
        is_addon,
      });
    } catch (kitchenErr) {
      console.error("Kitchen ticket creation failed:", kitchenErr);
    }

    // Notify POS
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.QR_ORDER_PLACED, {
        orderId:     order.id,
        orderNo:     order.order_no,
        tableId:     params.tableId,
        tableNumber: params.tableNumber,
        totalAmount: updatedOrder.total_amount,
        itemCount:   params.input.items.length,
        round,
        is_addon,
        isNewOrder,
        timestamp:   new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Socket emit failed:", socketErr);
    }

    // Notify POS terminals (cashier-facing)
    try {
      emitToPosTerminals(params.shopId, SOCKET_EVENTS.QR_ORDER_PLACED, {
        orderId:     order.id,
        orderNo:     order.order_no,
        tableId:     params.tableId,
        tableNumber: params.tableNumber,
        totalAmount: updatedOrder.total_amount,
        itemCount:   params.input.items.length,
        round,
        is_addon,
        isNewOrder,
        timestamp:   new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("POS terminal socket emit failed:", socketErr);
    }

    await AuditService.log({
      shopId:   params.shopId,
      action:   is_addon ? "QR_ADDON_ORDER_PLACED" : "QR_ORDER_PLACED",
      entity:   "ORDER",
      entityId: order.id,
      metadata: { orderNo: order.order_no, tableId: params.tableId, round, itemCount: params.input.items.length },
    });

    return {
      order_id:    order.id,
      order_no:    order.order_no,
      total_amount: updatedOrder.total_amount,
      status:      updatedOrder.status,
      round,
      is_addon,
    };
  }

  // ── Request bill ─────────────────────────────────────────
  static async requestBill(params: { shopId: string; tableId: string }) {
    const order = await OrderRepository.findActiveOrderForTable(params.shopId, params.tableId);
    if (!order) throw new appError("NO_ACTIVE_ORDER", 404);
    if (parseFloat(String(order.total_amount)) <= 0) throw new appError("ORDER_HAS_NO_ITEMS", 400);

    await OrderRepository.markOrderClosing(order.id);

    const table = await TableRepository.findTableById(params.tableId, params.shopId);
    const tableNumber = table?.table_number ?? null;

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.QR_BILL_REQUESTED, {
        orderId:     order.id,
        orderNo:     order.order_no,
        tableId:     params.tableId,
        tableNumber,
        totalAmount: order.total_amount,
        timestamp:   new Date().toISOString(),
      });
    } catch (e) { console.error("Bill request emit failed:", e); }

    // The POS terminal floor view runs on the "burn the ships" terminal
    // session, not the platform JWT, so it only ever joins
    // terminal:{shopId}:POS. emitToShop alone only reaches platform-authenticated
    // dashboard sockets — it never reaches the actual cashier-facing terminal
    // screen. Without this, the floor view's listener never fires.
    try {
      emitToPosTerminals(params.shopId, SOCKET_EVENTS.QR_BILL_REQUESTED, {
        orderId:     order.id,
        orderNo:     order.order_no,
        tableId:     params.tableId,
        tableNumber,
        totalAmount: order.total_amount,
        timestamp:   new Date().toISOString(),
      });
    } catch (e) { console.error("Bill request POS terminal emit failed:", e); }

    try {
      emitToQrSession(order.id, SOCKET_EVENTS.QR_TABLE_LOCKED, {
        orderId:   order.id,
        orderNo:   order.order_no,
        timestamp: new Date().toISOString(),
      });
    } catch (e) { console.error("Table locked emit failed:", e); }

    await AuditService.log({
      shopId:   params.shopId,
      action:   "QR_BILL_REQUESTED",
      entity:   "ORDER",
      entityId: order.id,
      metadata: { orderNo: order.order_no, tableId: params.tableId, tableNumber },
    });

    return { order_id: order.id, order_no: order.order_no, status: "CLOSING", total_amount: order.total_amount };
  }

  // ── Reopen table (cashier action) ────────────────────────
  // NOTE: still has no route wired to it — flagged separately,
  // left for a future pass per your earlier instruction.
  static async reopenTable(params: { shopId: string; orderId: string; requesterId: string }) {
    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);
    if (order.status !== 'CLOSING') throw new appError("ORDER_NOT_CLOSING", 400);

    await OrderRepository.markOrderOpen(order.id);

    try {
      emitToQrSession(order.id, SOCKET_EVENTS.QR_TABLE_REOPENED, {
        orderId: order.id, orderNo: order.order_no, timestamp: new Date().toISOString(),
      });
    } catch (e) { console.error("Table reopened emit failed:", e); }

    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "QR_TABLE_REOPENED", entity: "ORDER", entityId: order.id,
      metadata: { orderNo: order.order_no },
    });

    return { order_id: order.id, status: "OPEN" };
  }

  // ── Get order status (polling fallback) ──────────────────
  static async getOrderStatus(params: { shopId: string; orderId: string }) {
    const order = await OrderRepository.findOrderWithItems(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    const shop = await ShopRepository.findBasicInfo(params.shopId);

    return {
      order_id:       order.id,
      order_no:       order.order_no,
      status:         order.status,
      bill_requested: order.bill_requested ?? false,      
      total_amount:   order.total_amount,
      currency:       shop?.currency ?? 'THB',
      items:          order.items.map(item => ({
        id:                item.id,
        product_name:      item.product_name_snapshot,
        item_name:         item.item_name_snapshot,
        qty:               item.qty,
        unit_price:        item.unit_price_snapshot,
        subtotal:          item.subtotal,
        modifier_snapshot: item.modifier_snapshot,
        item_note:         item.item_note,
        status:            item.status,
      })),
    };
  }
}