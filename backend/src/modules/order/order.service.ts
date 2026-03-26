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
} from "./order.types.js";
import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";

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

export class OrderService {

  static async createOrder(params: CreateOrderInput & { requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const taxRate = await getShopTaxRate(params.shopId);

    const order = await OrderRepository.createOrder(
      {
        shopId: params.shopId,
        cashierId: params.requesterId,
        orderType: params.orderType,
        tableId: params.tableId,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        deliveryAddress: params.deliveryAddress,
        deliveryNote: params.deliveryNote,
        notes: params.notes,
      },
      taxRate
    );

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: "ORDER_CREATED",
      entity: "ORDER",
      entityId: order.id,
      metadata: {
        order_no: order.order_no,
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
    const modifiers = params.modifiers ?? [];

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
}