import { Request, Response } from "express";
import { OrderService }      from "./order.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";
import { ListOrdersFilter, OrderStatus, OrderType } from "./order.types.js";
import { parsePaginationParams } from "../../utils/pagination.js";

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
        cashierId:       requesterId,
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

static async getOrders(req: Request<{ shopId: string }>, res: Response)  {
    try {
      const paginationParams = parsePaginationParams(req);
      const { shopId } = req.params;
      const { status, orderType, from, to } = req.query;

      const filter: ListOrdersFilter = {
        shopId,
        status: status as OrderStatus | undefined,
        orderType: orderType as OrderType | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        limit: paginationParams.limit,
        offset: paginationParams.offset,
      };

      const result = await OrderService.getOrders(filter, req.user!.id, paginationParams);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getOrderById(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;

      const order = await OrderService.getOrderById(orderId, shopId, requesterId);
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