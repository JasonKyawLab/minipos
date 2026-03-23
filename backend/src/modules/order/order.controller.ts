// =========================================================
// order.controller.ts
// Path: backend/src/modules/order/order.controller.ts
// =========================================================
// HTTP layer only.
// Responsibilities:
//   - Read req.params, req.body, req.query
//   - Call service
//   - Return HTTP response
//   - Handle errors via shared handleError()
// =========================================================

import { Request, Response } from "express";
import { OrderService }      from "./order.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { ListOrdersFilter, OrderStatus }  from "./order.types.js";

export class OrderController {

  // =======================================================
  // ORDERS
  // =======================================================

  static async createOrder(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const {
        order_type,
        table_id,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_note,
        notes,
      } = req.body;

      const order = await OrderService.createOrder({
        shopId,
        requesterId,
        cashierId:      requesterId,
        orderType:       order_type,
        tableId:         table_id,
        customerName:    customer_name,
        customerPhone:   customer_phone,
        deliveryAddress: delivery_address,
        deliveryNote:    delivery_note,
        notes,
      });

      return res.status(201).json(order);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getOrders(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      // Parse query string filters
      const filter: ListOrdersFilter = {
        shopId,
        status:    req.query.status    as OrderStatus | undefined,
        orderType: req.query.order_type as any,
        from:      req.query.from      as string | undefined,
        to:        req.query.to        as string | undefined,
        limit:     req.query.limit     ? parseInt(req.query.limit as string)  : undefined,
        offset:    req.query.offset    ? parseInt(req.query.offset as string) : undefined,
      };

      const orders = await OrderService.getOrders(filter, requesterId);
      return res.json(orders);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getOrderById(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;

      const order = await OrderService.getOrderById(
        orderId,
        shopId,
        requesterId
      );
      return res.json(order);
    } catch (err: any) { return handleError(res, err); }
  }

  static async updateOrderStatus(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;
      const { status }  = req.body;

      const updated = await OrderService.updateOrderStatus({
        orderId,
        shopId,
        requesterId,
        newStatus: status,
      });

      return res.json(updated);
    } catch (err: any) { return handleError(res, err); }
  }

  // =======================================================
  // ORDER ITEMS
  // =======================================================

  static async addOrderItem(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;

      const { product_item_id, qty, modifiers, item_note } = req.body;

      const item = await OrderService.addOrderItem({
        orderId,
        shopId,
        requesterId,
        productItemId: product_item_id,
        qty,
        modifiers,
        itemNote: item_note,
      });

      return res.status(201).json(item);
    } catch (err: any) { return handleError(res, err); }
  }

  static async updateOrderItem(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const itemId      = getParamAsString(req.params.itemId,  "itemId");
      const requesterId = req.user!.id;

      const item = await OrderService.updateOrderItem({
        orderId,
        itemId,
        shopId,
        requesterId,
        input: { qty: req.body.qty },
      });

      return res.json(item);
    } catch (err: any) { return handleError(res, err); }
  }

  static async removeOrderItem(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const itemId      = getParamAsString(req.params.itemId,  "itemId");
      const requesterId = req.user!.id;

      const result = await OrderService.removeOrderItem({
        orderId,
        itemId,
        shopId,
        requesterId,
      });

      return res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }
}

// ── Shared error handler ──────────────────────────────────
function handleError(res: Response, err: any) {
  const map: Record<string, number> = {
    FORBIDDEN:                 403,
    ORDER_NOT_FOUND:           404,
    ORDER_ITEM_NOT_FOUND:      404,
    PRODUCT_ITEM_NOT_FOUND:    404,
    PRODUCT_MODEL_NOT_FOUND:   404,
    SHOP_NOT_FOUND:            404,
    PRODUCT_ITEM_INACTIVE:     400,
    ORDER_NOT_EDITABLE:        400,
    INVALID_STATUS_TRANSITION: 400,
  };

  const status = map[err.message] ?? 500;
  if (status === 500) console.error("[OrderController]", err);
  return res.status(status).json({ message: err.message });
}