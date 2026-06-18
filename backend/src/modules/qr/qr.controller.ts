// =========================================================
// qr.controller.ts
// Path: backend/src/modules/qr/qr.controller.ts
// =========================================================

import { Request, Response } from "express";
import { QrService }         from "./qr.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";
import { pool }              from "../../db/pool.js";

export class QrController {

  // GET /api/qr/:token/menu
  static async getMenu(req: Request, res: Response) {
    try {
      const { shopId, tableNumber } = req.qr!;
      const shopResult = await pool.query(
        `SELECT name, currency FROM shops WHERE id = $1 AND is_deleted = false`,
        [shopId]
      );
      if (shopResult.rows.length === 0) {
        return res.status(404).json({ message: "SHOP_NOT_FOUND" });
      }
      const shop = shopResult.rows[0];
      const menu = await QrService.getMenu(shopId);
      return res.json({ table_number: tableNumber, shop_name: shop.name, currency: shop.currency, menu });
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/qr/:token/table/session
  static async getTableSession(req: Request, res: Response) {
    try {
      const { shopId, tableId } = req.qr!;
      const session = await QrService.getTableSession({ shopId, tableId });
      return res.json(session ?? null);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/qr/:token/orders
  static async placeOrder(req: Request, res: Response) {
    try {
      const { shopId, tableId, tableNumber } = req.qr!;
      const result = await QrService.placeOrder({ shopId, tableId, tableNumber, input: req.body });
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/qr/:token/table/request-bill
  static async requestBill(req: Request, res: Response) {
    try {
      const { shopId, tableId } = req.qr!;
      const result = await QrService.requestBill({ shopId, tableId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/qr/:token/orders/:orderId
  static async getOrderStatus(req: Request, res: Response) {
    try {
      const { shopId } = req.qr!;
      const orderId = getParamAsString(req.params.orderId, "orderId");
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderId)) {
        return res.status(400).json({ message: "INVALID_ORDER_ID" });
      }
      const status = await QrService.getOrderStatus({ shopId, orderId });
      return res.json(status);
    } catch (err) { return handleError(res, err); }
  }
}