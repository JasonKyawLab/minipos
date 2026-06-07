// =========================================================
// order.service.ts
// Path: backend/src/modules/order/order.service.ts
// Line: Replace all error throws with appError
// =========================================================

import { ShopRepository } from "../shop/shop.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { OrderRepository } from "./order.repository.js";
import { ProductRepository } from "../product/product.repository.js";
import {
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  ListOrdersFilter,
  OrderStatus,
  ModifierSnapshot,
} from "./order.types.js";
import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";
import { SOCKET_EVENTS } from "../socket/socket.events.js";
import { emitToShop ,emitToQrSession } from "../socket/socket.js";
import { KitchenService } from '../kitchen/kitchen.service.js';

const ALL_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;
const WRITE_ROLES = ["OWNER", "MANAGER"] as const;

async function assertShopMember(
  shopId: string,
  userId: string,
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

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  OPEN: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  PAID: [],
  CANCELLED: [],
  REFUNDED: [],
};

const ALLOWED_ORDER_TYPES_BY_SHOP: Record<string, string[]> = {
  RETAIL:      ["RETAIL"],
  RESTAURANT:  ["DINE_IN", "TAKEAWAY"],
  ONLINE_SHOP: ["ONLINE", "DELIVERY", "PICKUP"],
};

export class OrderService {


static async createOrder(params: CreateOrderInput & { requesterId: string }) {
  await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

  const { taxRate, shopType } = await getShopInfo(params.shopId);

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


  static async getOrders(filter: ListOrdersFilter, requesterId: string) {
    await assertShopMember(filter.shopId, requesterId, ALL_ROLES);
    return OrderRepository.findOrders(filter);
  }

  static async getOrderById(orderId: string, shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderWithItems(orderId, shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    return order;
  }

  static async updateOrderStatus(params: {
    orderId: string;
    shopId: string;
    requesterId: string;
    newStatus: OrderStatus;
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

// ── Notify QR customer if this is a QR order ─────────────
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

// Always notify staff room too
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

if (params.newStatus === 'CONFIRMED') {
  try {
    // Get table number if this is a dine-in order
    let tableNumber: string | null = null;
    if (order.order_type === 'DINE_IN' && order.table_id) {
      const tableResult = await pool.query(
        `SELECT table_number FROM restaurant_tables WHERE id = $1`,
        [order.table_id]
      );
      tableNumber = tableResult.rows[0]?.table_number ?? null;
    }

    await KitchenService.createTicket({
      shopId:       params.shopId,
      orderId:      params.orderId,
      orderNo:      order.order_no,
      orderType:    order.order_type,
      tableNumber,
      customerName: order.customer_name,
      notes:        order.notes,
    });
  } catch (kitchenErr) {
    // Kitchen ticket creation failure is non-fatal.
    // The order status change is already committed.
    console.error('Kitchen ticket creation failed:', kitchenErr);
  }
}

if (params.newStatus === 'CANCELLED') {
  try {
    await KitchenService.cancelTicket({
      shopId:  params.shopId,
      orderId: params.orderId,
      orderNo: order.order_no,
    });
  } catch (kitchenErr) {
    console.error('Kitchen ticket cancellation failed:', kitchenErr);
  }
}

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: `ORDER_STATUS_CHANGED_TO_${params.newStatus}`,
      entity: "ORDER",
      entityId: params.orderId,
      metadata: {
        from: order.status,
        to: params.newStatus,
      },
    });

    return updated;
  }

  static async addOrderItem(params: AddOrderItemInput & { requesterId: string }) {
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
    if (!productItem) throw new appError("PRODUCT_ITEM_NOT_FOUND", 404);
    if (!productItem.is_active) throw new appError("PRODUCT_ITEM_INACTIVE", 400);

    const productModel = await ProductRepository.findModelById(
      productItem.product_model_id,
      params.shopId
    );
    if (!productModel) throw new appError("PRODUCT_MODEL_NOT_FOUND", 404);

    const taxRate = await getShopTaxRate(params.shopId);
const rawModifiers = params.modifiers ?? [];
const modifiers: ModifierSnapshot[] = await Promise.all(
  rawModifiers.map(async (m) => {
    const { rows } = await pool.query(
      `SELECT name, price_delta FROM modifier_options WHERE id = $1`,
      [m.modifier_option_id]
    );
    const opt = rows[0];
    return {
      modifier_option_id: m.modifier_option_id,
      name:               opt?.name       ?? "",
      price_delta:        Number(opt?.price_delta ?? 0),
    };
  })
);
    const orderItem = await OrderRepository.addOrderItem({
      orderId: params.orderId,
      productItemId: params.productItemId,
      productNameSnapshot: productModel.name,
      itemNameSnapshot: productItem.name,
      unitPriceSnapshot: Number(productItem.price),
      qty: params.qty,
      modifierSnapshot: modifiers,
      itemNote: params.itemNote,
    });

    await OrderRepository.recalculateOrderTotals(params.orderId, taxRate);

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: "ORDER_ITEM_ADDED",
      entity: "ORDER_ITEM",
      entityId: orderItem.id,
      metadata: {
        orderId: params.orderId,
        itemName: productItem.name,
        qty: params.qty,
        unit_price: productItem.price,
      },
    });

    return orderItem;
  }

  static async updateOrderItem(params: {
    orderId: string;
    itemId: string;
    shopId: string;
    requesterId: string;
    input: UpdateOrderItemInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);

    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new appError("ORDER_NOT_EDITABLE", 400);
    }

    const updated = await OrderRepository.updateOrderItem(
      params.itemId,
      params.orderId,
      params.input.qty
    );
    if (!updated) throw new appError("ORDER_ITEM_NOT_FOUND", 404);

    const taxRate = await getShopTaxRate(params.shopId);
    await OrderRepository.recalculateOrderTotals(params.orderId, taxRate);

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: "ORDER_ITEM_UPDATED",
      entity: "ORDER_ITEM",
      entityId: params.itemId,
      metadata: { orderId: params.orderId, newQty: params.input.qty },
    });

    return updated;
  }

  static async removeOrderItem(params: {
    orderId: string;
    itemId: string;
    shopId: string;
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
      shopId: params.shopId,
      userId: params.requesterId,
      action: "ORDER_ITEM_REMOVED",
      entity: "ORDER_ITEM",
      entityId: params.itemId,
      metadata: { orderId: params.orderId },
    });

    return { success: true };
  }

    static async updateOrderStatusFromPOS(params: {
    orderId:     string;
    shopId:      string;
    requesterId: string;   // cashier's userId from pos_token
    newStatus:   "CONFIRMED" | "CANCELLED";
  }) {
    // ALL_ROLES — cashiers are permitted to confirm/cancel
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);
 
    const order = await OrderRepository.findOrderById(params.orderId, params.shopId);
    if (!order) throw new appError("ORDER_NOT_FOUND", 404);
 
    // Validate transition using the same rules as updateOrderStatus()
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(params.newStatus)) {
      throw new appError("INVALID_STATUS_TRANSITION", 400);
    }
 
    const updated = await OrderRepository.updateOrderStatus(
      params.orderId,
      params.shopId,
      params.newStatus
    );
 
    // Emit real-time event to platform dashboard
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
        let tableNumber: string | null = null;
        if (order.order_type === "DINE_IN" && order.table_id) {
          const tableResult = await pool.query(
            `SELECT table_number FROM restaurant_tables WHERE id = $1`,
            [order.table_id]
          );
          tableNumber = tableResult.rows[0]?.table_number ?? null;
        }
 
        await KitchenService.createTicket({
          shopId:       params.shopId,
          orderId:      params.orderId,
          orderNo:      order.order_no,
          orderType:    order.order_type,
          tableNumber,
          customerName: order.customer_name,
          notes:        order.notes,
        });
      } catch (kitchenErr) {
        // Non-fatal — order is already confirmed in DB
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
}