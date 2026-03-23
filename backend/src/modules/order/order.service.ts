// =========================================================
// order.service.ts
// Path: backend/src/modules/order/order.service.ts
// =========================================================
// Business logic layer.
//
// Responsibilities:
//   - Permission checks (shop membership + role)
//   - Fetch product snapshot data before adding items
//   - Enforce order lifecycle rules (what status can transition to what)
//   - Trigger total recalculation after item changes
//   - Write audit logs for all mutations
//
// Rules:
//   - OPEN / CONFIRMED orders → can add/remove items
//   - PAID / CANCELLED orders → locked, no changes
//   - Only OWNER / MANAGER can CONFIRM or CANCEL an order
//   - CASHIER can create orders and add items
// =========================================================

import { ShopRepository }   from "../shop/shop.repository.js";
import { AuditService }     from "../audit/audit.service.js";
import { OrderRepository }  from "./order.repository.js";
import { ProductRepository } from "../product/product.repository.js";
import {
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  ListOrdersFilter,
  OrderStatus,
} from "./order.types.js";
import { pool } from "../../db/pool.js";

// ── Permission constants ──────────────────────────────────
const ALL_ROLES   = ["OWNER", "MANAGER", "CASHIER"] as const;
const WRITE_ROLES = ["OWNER", "MANAGER"]             as const;

// ── Permission helper ─────────────────────────────────────
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

  return member;
}

// ── Shop tax rate helper ──────────────────────────────────
// Fetch the shop's tax rate for total calculation.
// We fetch it fresh each time so if the owner changes tax rate,
// new orders use the updated rate immediately.
async function getShopTaxRate(shopId: string): Promise<number> {
  const result = await pool.query(
    `SELECT tax_rate FROM shops WHERE id = $1 AND is_deleted = false`,
    [shopId]
  );

  if (result.rows.length === 0) throw new Error("SHOP_NOT_FOUND");

  // tax_rate comes back as a string from pg (NUMERIC type)
  return parseFloat(result.rows[0].tax_rate);
}

// ── Order status transition rules ────────────────────────
// Defines valid transitions to prevent illegal status jumps.
//
// Example: cannot go from PAID → OPEN
//          cannot go from CANCELLED → CONFIRMED
//
// PAID and REFUNDED are set by payment/refund modules,
// not directly by this service.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  OPEN:      ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  PAID:      [],         // set by payment module only
  CANCELLED: [],         // terminal state
  REFUNDED:  [],         // set by refund module (Phase 3)
};

export class OrderService {

  // =======================================================
  // ORDERS
  // =======================================================

  static async createOrder(params: CreateOrderInput & { requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const taxRate = await getShopTaxRate(params.shopId);

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

  static async getOrders(
    filter: ListOrdersFilter,
    requesterId: string
  ) {
    await assertShopMember(filter.shopId, requesterId, ALL_ROLES);
    return OrderRepository.findOrders(filter);
  }

  static async getOrderById(
    orderId: string,
    shopId: string,
    requesterId: string
  ) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderWithItems(orderId, shopId);
    if (!order) throw new Error("ORDER_NOT_FOUND");

    return order;
  }

  static async updateOrderStatus(params: {
    orderId: string;
    shopId: string;
    requesterId: string;
    newStatus: OrderStatus;
  }) {
    // Only OWNER and MANAGER can change order status
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");

    // Validate the transition is allowed
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(params.newStatus)) {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    const updated = await OrderRepository.updateOrderStatus(
      params.orderId,
      params.shopId,
      params.newStatus
    );

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   `ORDER_STATUS_CHANGED_TO_${params.newStatus}`,
      entity:   "ORDER",
      entityId: params.orderId,
      metadata: {
        from: order.status,
        to:   params.newStatus,
      },
    });

    return updated;
  }

  // =======================================================
  // ORDER ITEMS
  // =======================================================

  static async addOrderItem(
    params: AddOrderItemInput & { requesterId: string }
  ) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    // Fetch the order and verify it belongs to this shop
    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");

    // Enforce: can only add items to OPEN or CONFIRMED orders
    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new Error("ORDER_NOT_EDITABLE");
    }

    // Fetch product item to build the snapshot
    // This is the source of truth for name and price AT THIS MOMENT
    const productItem = await ProductRepository.findItemById(
      params.productItemId,
      params.shopId
    );
    if (!productItem) throw new Error("PRODUCT_ITEM_NOT_FOUND");
    if (!productItem.is_active) throw new Error("PRODUCT_ITEM_INACTIVE");

    // Fetch the parent model for product_name_snapshot
    const productModel = await ProductRepository.findModelById(
      productItem.product_model_id,
      params.shopId
    );
    if (!productModel) throw new Error("PRODUCT_MODEL_NOT_FOUND");

    const taxRate = await getShopTaxRate(params.shopId);
    const modifiers = params.modifiers ?? [];

    // Add the item with snapshotted values
    const orderItem = await OrderRepository.addOrderItem({
      orderId:              params.orderId,
      productItemId:        params.productItemId,
      productNameSnapshot:  productModel.name,
      itemNameSnapshot:     productItem.name,
      unitPriceSnapshot:    Number(productItem.price),
      qty:                  params.qty,
      modifierSnapshot:     modifiers,
      itemNote:             params.itemNote,
    });

    // Recalculate order totals after adding the item
    await OrderRepository.recalculateOrderTotals(params.orderId, taxRate);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "ORDER_ITEM_ADDED",
      entity:   "ORDER_ITEM",
      entityId: orderItem.id,
      metadata: {
        orderId:    params.orderId,
        itemName:   productItem.name,
        qty:        params.qty,
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

    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");

    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new Error("ORDER_NOT_EDITABLE");
    }

    const updated = await OrderRepository.updateOrderItem(
      params.itemId,
      params.orderId,
      params.input.qty
    );
    if (!updated) throw new Error("ORDER_ITEM_NOT_FOUND");

    const taxRate = await getShopTaxRate(params.shopId);
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
    orderId: string;
    itemId: string;
    shopId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const order = await OrderRepository.findOrderById(
      params.orderId,
      params.shopId
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");

    if (order.status === "PAID" || order.status === "CANCELLED") {
      throw new Error("ORDER_NOT_EDITABLE");
    }

    const cancelled = await OrderRepository.cancelOrderItem(
      params.itemId,
      params.orderId
    );
    if (!cancelled) throw new Error("ORDER_ITEM_NOT_FOUND");

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