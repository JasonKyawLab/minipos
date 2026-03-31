// =========================================================
// qr.controller.ts
// Path: backend/src/modules/qr/qr.controller.ts
// =========================================================

import { Request, Response } from "express";
import { QrService }         from "./qr.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";

export class QrController {

  // GET /api/qr/:token/menu
  static async getMenu(req: Request, res: Response) {
    try {
      const { shopId } = req.qr!;
      const menu = await QrService.getMenu(shopId);
      return res.json(menu);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/qr/:token/orders
  static async placeOrder(req: Request, res: Response) {
    try {
      const { shopId, tableId } = req.qr!;
      const result = await QrService.placeOrder({
        shopId,
        tableId,
        input: req.body,
      });
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/qr/:token/orders/:orderId
  // Customer checks their own order status.
  // We scope by shopId from the QR token so an orderId from a
  // different shop never accidentally matches.
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