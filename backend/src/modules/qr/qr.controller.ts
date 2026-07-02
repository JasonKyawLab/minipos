import { Request, Response } from "express";
import { QrService } from "./qr.service.js";
import { ShopRepository } from "../shop/shop.repository.js";
import { getParamAsString } from "../../utils/converter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export class QrController {

  // GET /api/qr/:token/menu
  static getMenu = asyncHandler(async (req: Request, res: Response) => {
    const { shopId, tableNumber } = req.qr!;

    const shop = await ShopRepository.findBasicInfo(shopId);
    if (!shop) {
      return res.status(404).json({ message: "SHOP_NOT_FOUND" });
    }

    const menu = await QrService.getMenu(shopId);
    res.json({
      table_number: tableNumber,
      shop_name: shop.name,
      currency: shop.currency,
      menu,
    });
  });

  // GET /api/qr/:token/table/session
  static getTableSession = asyncHandler(async (req: Request, res: Response) => {
    const { shopId, tableId } = req.qr!;
    const session = await QrService.getTableSession({ shopId, tableId });
    res.json(session ?? null);
  });

  // POST /api/qr/:token/orders
  static placeOrder = asyncHandler(async (req: Request, res: Response) => {
    const { shopId, tableId, tableNumber } = req.qr!;
    const result = await QrService.placeOrder({ shopId, tableId, tableNumber, input: req.body });
    res.status(201).json(result);
  });

  // POST /api/qr/:token/table/request-bill
  static requestBill = asyncHandler(async (req: Request, res: Response) => {
    const { shopId, tableId } = req.qr!;
    const result = await QrService.requestBill({ shopId, tableId });
    res.json(result);
  });

  // GET /api/qr/:token/orders/:orderId
  static getOrderStatus = asyncHandler(async (req: Request, res: Response) => {
    const { shopId } = req.qr!;
    const orderId = getParamAsString(req.params.orderId, "orderId");
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return res.status(400).json({ message: "INVALID_ORDER_ID" });
    }
    const status = await QrService.getOrderStatus({ shopId, orderId });
    res.json(status);
  });
}