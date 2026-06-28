// =========================================================
// order.service.ts
// Path: backend/src/modules/order/order.service.ts
//
// FIX (kitchen tickets not appearing):
//   KitchenService.createTicket() requires `round` and
//   `is_addon` after the Flow D migration. Both callers
//   (updateOrderStatus and updateOrderStatusFromPOS) were
//   not passing those fields, causing a NOT NULL constraint
//   violation that was silently swallowed by the catch block.
//   No ticket was ever inserted → kitchen display stayed empty.
//
//   Fix: both callers now call
//   KitchenRepository.getTicketRoundCount() before creating
//   the ticket, exactly as qr.service.ts already does.
// =========================================================

import { ShopRepository }    from "../shop/shop.repository.js";
import { AuditService }      from "../audit/audit.service.js";
import { OrderRepository }   from "./order.repository.js";
import { ProductRepository } from "../product/product.repository.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";
import {
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  ListOrdersFilter,
  OrderStatus,
  OrderType,
  ModifierSnapshot,
} from "./order.types.js";
import { pool }              from "../../db/pool.js";
import { appError }          from "../../utils/appError.js";
import { SOCKET_EVENTS }     from "../socket/socket.events.js";
import { emitToShop, emitToQrSession } from "../socket/socket.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { buildPaginatedResult, PaginationParams } from "../../utils/pagination.js";

const ALL_ROLES   = ["OWNER", "MANAGER", "CASHIER"] as const;
const WRITE_ROLES = ["OWNER", "MANAGER"] as const;

async function assertShopMember(
  shopId:  string,
  userId:  string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

async function getShopInfo(shopId: string): Promise<{ taxRate: number; shopType: string }> {
  const result = await pool.query(
    `SELECT tax_rate, shop_type FROM shops WHERE id = $1 AND is_deleted = false`,
    [shopId]
  );
  if (result.rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);
  return {
    taxRate:  parseFloat(result.rows[0].tax_rate),
    shopType: result.rows[0].shop_type,
  };
}

async function getShopTaxRate(shopId: string): Promise<number> {
  const result = await pool.query(
    `SELECT tax_rate FROM shops WHERE id = $1 AND is_deleted = false`,
    [shopId]
  );
  if (result.rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);
  return parseFloat(result.rows[0].tax_rate);
}

// ── Helper: look up table_number for orders that have a table ──
// Used by both updateOrderStatus and updateOrderStatusFromPOS
// to populate kitchen ticket table_number on CONFIRMED.
async function resolveTableNumber(
  orderType: string,
  tableId:   string | null
): Promise<string | null> {
  if ((orderType === "DINE_IN" || orderType === "QR") && tableId) {
    const tableResult = await pool.query(
      `SELECT table_number FROM restaurant_tables WHERE id = $1`,
      [tableId]
    );
    return tableResult.rows[0]?.table_number ?? null;
  }
  return null;
}

const ALLOWED_ORDER_TYPES_BY_SHOP: Record<string, string[]> = {
  RESTAURANT:  ["DINE_IN", "TAKEAWAY", "QR"],
  RETAIL:      ["RETAIL"],
  ONLINE_SHOP: ["ONLINE", "DELIVERY", "PICKUP"],
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN:      ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CLOSING", "PAID", "CANCELLED"],
  CLOSING:   ["PAID", "CANCELLED"],
  PAID:      ["REFUNDED"],
  CANCELLED: [],
  REFUNDED:  [],
};

export class OrderService {

  // =======================================================
  // CREATE ORDER
  // =======================================================

  static async createOrder(params: {
    shopId:          string;
    requesterId:     string;
    cashierId:       string | null;
    orderType:       OrderType;
    tableId?:        string;
    customerName?:   string;
    customerPhone?:  string;
    deliveryAddress?: string;
    deliveryNote?:   string;
    notes?:          string;
  }) {
    const { taxRate, shopType } = await getShopInfo(params.shopId);

    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    if (params.orderType !== "QR") {
      const allowed = ALLOWED_ORDER_TYPES_BY_SHOP[shopType] ?? [];
      if (!allowed.includes(params.orderType)) {
        throw new appError(
          `Order type '${params.orderType}' is not valid for a ${shopType} shop`,
          400
        );
      }
    }

    if (params.orderType === "DINE_IN" && params.tableId) {
      const tableResult = await pool.query(
        `SELECT id, is_active FROM restaurant_tables
         WHERE id = $1 AND shop_id = $2`,
        [params.tableId, params.shopId]
      );
      if (tableResult.rows.length === 0) {
        throw new appError("TABLE_NOT_FOUND", 404);
      }
      if (!tableResult.rows[0].is_active) {
        throw new appError("TABLE_NOT_ACTIVE", 400);
      }
    }

    const order = await OrderRepository.createOrder(
      {
        shopId:          params.shopId,
        cashierId:       params.requesterId,
        orderType:       params.orderType,
        tableId:         params.tableId,
        customerName:    params.customerName,
        customerPhone:   params.customerPhone,
        deliveryAddress: params.deliveryAddress,
        deliveryNote:    params.deliveryNote,
        notes:           params.notes,
      },
      taxRate
    );

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "ORDER_CREATED",
      entity:   "ORDER",
      entityId: order.id,
      metadata: {
        order_no:   order.order_no,
        order_type: order.order_type,
      },
    });

    return order;
  }

  // =======================================================
  // READ ORDERS
  // =======================================================

static async getOrders(
    filter: ListOrdersFilter,
    requesterId: string,
    paginationParams: PaginationParams
  ) {
    await assertShopMember(filter.shopId, requesterId, ALL_ROLES);
    const { rows, totalCount } = await OrderRepository.findOrders(filter);
    return buildPaginatedResult(rows, totalCount, paginationParams);
  }

  static async getOrderById(orderId: string, shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderWithItems(orderId, shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return order;
  }

  // =======================================================
  // UPDATE ORDER STATUS (platform auth — shop dashboard)
  // =======================================================

  static async updateOrderStatus(params: {
    orderId:     string;
    shopId:      string;
    requesterId: string;
    newStatus:   OrderStatus;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(params.newStatus)) {
      throw new appError("INVALID_STATUS_TRANSITION", 400);
    }

    const updated = await OrderRepository.updateOrderStatus(
      params.orderId,
      params.shopId,
      params.newStatus
    );

    // Notify QR customer if this is a QR order
    if (order.order_type === "QR") {
      try {
        emitToQrSession(params.orderId, SOCKET_EVENTS.QR_ORDER_STATUS, {
          orderId:   params.orderId,
          orderNo:   order.order_no,
          newStatus: params.newStatus,
          timestamp: new Date().toISOString(),
        });
      } catch (socketErr) {
        console.error("QR session socket emit failed:", socketErr);
      }
    }

    // Always notify the staff room
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
        orderId:   params.orderId,
        orderNo:   order.order_no,
        newStatus: params.newStatus,
        oldStatus: order.status,
        orderType: order.order_type,
        timestamp: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Shop socket emit failed:", socketErr);
    }

    // CONFIRMED → create kitchen ticket
    if (params.newStatus === "CONFIRMED") {
      try {
        const tableNumber = await resolveTableNumber(order.order_type, order.table_id);

        // FIX: determine round so the KDS can show ADD-ON badge correctly.
        // Both updateOrderStatus and updateOrderStatusFromPOS must pass
        // round + is_addon — KitchenService.createTicket has them as
        // required fields after the Flow D migration.
        const existingRounds = await KitchenRepository.getTicketRoundCount(params.orderId);
        const round    = existingRounds + 1;
        const is_addon = round > 1;

        await KitchenService.createTicket({
          shopId:       params.shopId,
          orderId:      params.orderId,
          orderNo:      order.order_no,
          orderType:    order.order_type,
          tableNumber,
          customerName: order.customer_name,
          notes:        order.notes,
          round,
          is_addon,
        });
      } catch (kitchenErr) {
        // Non-fatal — order status is already committed
        console.error("Kitchen ticket creation failed:", kitchenErr);
      }
    }

    // CANCELLED → cancel any existing kitchen ticket
    if (params.newStatus === "CANCELLED") {
      try {
        await KitchenService.cancelTicket({
          shopId:  params.shopId,
          orderId: params.orderId,
          orderNo: order.order_no,
        });
      } catch (kitchenErr) {
        console.error("Kitchen ticket cancellation failed:", kitchenErr);
      }
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   `ORDER_STATUS_CHANGED_TO_${params.newStatus}`,
      entity:   "ORDER",
      entityId: params.orderId,
      metadata: { from: order.status, to: params.newStatus },
    });

    return updated;
  }

  // =======================================================
  // UPDATE ORDER STATUS FROM POS (pos_token auth)
  // =======================================================
  // Cashiers are permitted to confirm/cancel — ALL_ROLES.
  // Uses the same kitchen ticket logic as updateOrderStatus.

  static async updateOrderStatusFromPOS(params: {
    orderId:     string;
    shopId:      string;
    requesterId: string;
    newStatus:   "CONFIRMED" | "CANCELLED";
  }) {
    // ALL_ROLES — cashiers are permitted to confirm/cancel
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(params.newStatus)) {
      throw new appError("INVALID_STATUS_TRANSITION", 400);
    }

    const updated = await OrderRepository.updateOrderStatus(
      params.orderId,
      params.shopId,
      params.newStatus
    );

    // Notify the staff room
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
        orderId:   params.orderId,
        orderNo:   order.order_no,
        newStatus: params.newStatus,
        oldStatus: order.status,
        orderType: order.order_type,
        timestamp: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Shop socket emit failed:", socketErr);
    }

    // CONFIRMED → create kitchen ticket
    if (params.newStatus === "CONFIRMED") {
      try {
        const tableNumber = await resolveTableNumber(order.order_type, order.table_id);

        // FIX: determine round so the KDS can show ADD-ON badge correctly.
        // Both updateOrderStatus and updateOrderStatusFromPOS must pass
        // round + is_addon — KitchenService.createTicket has them as
        // required fields after the Flow D migration.
        const existingRounds = await KitchenRepository.getTicketRoundCount(params.orderId);
        const round    = existingRounds + 1;
        const is_addon = round > 1;

        await KitchenService.createTicket({
          shopId:       params.shopId,
          orderId:      params.orderId,
          orderNo:      order.order_no,
          orderType:    order.order_type,
          tableNumber,
          customerName: order.customer_name,
          notes:        order.notes,
          round,
          is_addon,
        });
      } catch (kitchenErr) {
        console.error("Kitchen ticket creation failed:", kitchenErr);
      }
    }

    // CANCELLED → cancel kitchen ticket
    if (params.newStatus === "CANCELLED") {
      try {
        await KitchenService.cancelTicket({
          shopId:  params.shopId,
          orderId: params.orderId,
          orderNo: order.order_no,
        });
      } catch (kitchenErr) {
        console.error("Kitchen ticket cancellation failed:", kitchenErr);
      }
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   `ORDER_STATUS_CHANGED_TO_${params.newStatus}`,
      entity:   "ORDER",
      entityId: params.orderId,
      metadata: { from: order.status, to: params.newStatus },
    });

    return updated;
  }

  // =======================================================
  // ORDER ITEMS
  // =======================================================

  static async addOrderItem(params: {
    orderId:       string;
    shopId:        string;
    requesterId:   string;
    productItemId: string;
    qty:           number;
    modifiers?:    ModifierSnapshot[];
    itemNote?:     string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new appError("ORDER_NOT_EDITABLE", 400);
    }

    const productItem = await ProductRepository.findItemById(
      params.productItemId,
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

    // Re-fetch modifier name + price_delta from DB using the provided IDs.
    // NEVER trust client-supplied price data — the client sends only IDs.
    let resolvedModifiers: ModifierSnapshot[] = [];
    if (params.modifiers && params.modifiers.length > 0) {
      const modifierIds = params.modifiers.map((m) => m.modifier_option_id);
      const modResult   = await pool.query(
        `SELECT id, name, price_delta
         FROM modifier_options
         WHERE id = ANY($1::uuid[]) AND is_active = true`,
        [modifierIds]
      );
      resolvedModifiers = modResult.rows.map((row) => ({
        modifier_option_id: row.id,
        name:               row.name,
        price_delta:        parseFloat(row.price_delta),
      }));
    }

    const taxRate = await getShopTaxRate(params.shopId);

    const item = await OrderRepository.addOrderItem({
      orderId:             params.orderId,
      productItemId:       params.productItemId,
      productNameSnapshot: productModel.name,
      itemNameSnapshot:    productItem.name,
      unitPriceSnapshot:   Number(productItem.price),
      qty:                 params.qty,
      modifierSnapshot:    resolvedModifiers,
      itemNote:            params.itemNote,
    });

    await OrderRepository.recalculateOrderTotals(params.orderId, taxRate);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "ORDER_ITEM_ADDED",
      entity:   "ORDER_ITEM",
      entityId: item.id,
      metadata: { orderId: params.orderId, productItemId: params.productItemId, qty: params.qty },
    });

    return item;
  }

  static async updateOrderItem(params: {
    orderId:     string;
    itemId:      string;
    shopId:      string;
    requesterId: string;
    input:       { qty: number };
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new appError("ORDER_NOT_EDITABLE", 400);
    }

    const taxRate = await getShopTaxRate(params.shopId);

    const updated = await OrderRepository.updateOrderItem(
      params.itemId,
      params.orderId,
      params.input.qty
    );
    if (!updated) throw new appError("ORDER_ITEM_NOT_FOUND", 404);

    await OrderRepository.recalculateOrderTotals(params.orderId, taxRate);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "ORDER_ITEM_UPDATED",
      entity:   "ORDER_ITEM",
      entityId: params.itemId,
      metadata: { orderId: params.orderId, newQty: params.input.qty },
    });

    return updated;
  }

  static async removeOrderItem(params: {
    orderId:     string;
    itemId:      string;
    shopId:      string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new appError("ORDER_NOT_EDITABLE", 400);
    }

    const cancelled = await OrderRepository.cancelOrderItem(params.itemId, params.orderId);
    if (!cancelled) throw new appError("ORDER_ITEM_NOT_FOUND", 404);

    const taxRate = await getShopTaxRate(params.shopId);
    await OrderRepository.recalculateOrderTotals(params.orderId, taxRate);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "ORDER_ITEM_REMOVED",
      entity:   "ORDER_ITEM",
      entityId: params.itemId,
      metadata: { orderId: params.orderId },
    });

    return { success: true };
  }
}