import { AuditService }      from "../audit/audit.service.js";
import { OrderRepository }   from "./order.repository.js";
import { ProductRepository } from "../product/product.repository.js";
import { ModifierRepository } from "../modifier/modifier.repository.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";
import { TableRepository }   from "../table/table.repository.js";
import { ShopRepository }    from "../shop/shop.repository.js";
import {
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  ListOrdersFilter,
  OrderStatus,
  OrderType,
  ModifierSnapshot,
} from "./order.types.js";
import { appError }          from "../../utils/appError.js";
import { assertShopRole }    from "../../utils/authorize.js";
import { READ_ROLES, WRITE_ROLES } from "../../constants/roles.constants.js";
import { SOCKET_EVENTS }     from "../socket/socket.events.js";
import { emitToShop, emitToQrSession } from "../socket/socket.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { buildPaginatedResult, PaginationParams } from "../../utils/pagination.js";

async function getShopInfo(shopId: string): Promise<{ taxRate: number; shopType: string }> {
  const info = await ShopRepository.findOperationalInfo(shopId);
  if (!info) throw new appError("SHOP_NOT_FOUND", 404);
  return info;
}

async function getShopTaxRate(shopId: string): Promise<number> {
  const info = await ShopRepository.findOperationalInfo(shopId);
  if (!info) throw new appError("SHOP_NOT_FOUND", 404);
  return info.taxRate;
}

// ── Helper: look up table_number for orders that have a table ──
// Used by both updateOrderStatus and updateOrderStatusFromPOS
// to populate kitchen ticket table_number on CONFIRMED.
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

    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

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
      const table = await TableRepository.findTableById(params.tableId, params.shopId);
      if (!table) {
        throw new appError("TABLE_NOT_FOUND", 404);
      }
      if (!table.is_active) {
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
    await assertShopRole(filter.shopId, requesterId, READ_ROLES);
    const { rows, totalCount } = await OrderRepository.findOrders(filter);
    return buildPaginatedResult(rows, totalCount, paginationParams);
  }

  static async getOrderById(orderId: string, shopId: string, requesterId: string) {
    await assertShopRole(shopId, requesterId, READ_ROLES);

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
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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

    if (params.newStatus === "CONFIRMED") {
      try {
        const tableNumber = await resolveTableNumber(params.shopId, order.order_type, order.table_id);

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

  static async updateOrderStatusFromPOS(params: {
    orderId:     string;
    shopId:      string;
    requesterId: string;
    newStatus:   "CONFIRMED" | "CANCELLED";
  }) {
    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

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

    if (params.newStatus === "CONFIRMED") {
      try {
        const tableNumber = await resolveTableNumber(params.shopId, order.order_type, order.table_id);

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
    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

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
      const options = await ModifierRepository.findActiveOptionsByIds(modifierIds);
      resolvedModifiers = options.map((row) => ({
        modifier_option_id: row.id,
        name:               row.name,
        price_delta:        parseFloat(String(row.price_delta)),
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
    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

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
    await assertShopRole(params.shopId, params.requesterId, READ_ROLES);

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