import { Request, Response } from "express";
import { ShopService } from "./shop.service.js";
import { getParamAsString } from "../../utils/converter.js";

export class ShopController {
  static async createShop(req: Request, res: Response) {
    try {
      const { name, shopType, currency } = req.body;

      const shop = await ShopService.createShop({
        ownerId: req.user!.id,
        name,
        shopType,
        currency,
      });

      res.status(201).json(shop);
    } catch (err: any) {
      handleError(res, err);
    }
  }
static async updateShop(req: Request, res: Response) {
  try {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { name, currency } = req.body;

    const updated = await ShopService.updateShop({
      shopId,
      requesterId: req.user!.id,
      name,
      currency,
    });

    res.json(updated);
  } catch (err: any) {
    handleError(res, err);
  }
}

  static async deleteShop(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");

      await ShopService.deleteShop({
        shopId,
        requesterId: req.user!.id,
      });

      res.json({ success: true });
    } catch (err: any) {
      handleError(res, err);
    }
  }

  static async addStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const { userId, role } = req.body;

      const result = await ShopService.addStaff({
        shopId,
        requesterId: req.user!.id,
        staffUserId: userId,
        role,
      });

      res.status(201).json(result);
    } catch (err: any) {
      handleError(res, err);
    }
  }

  static async getStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");

      const staff = await ShopService.getStaff(
        shopId,
        req.user!.id
      );

      res.json(staff);
    } catch (err: any) {
      handleError(res, err);
    }
  }

  static async removeStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const userId = getParamAsString(req.params.userId, "userId");

      await ShopService.removeStaffFromShop(
        shopId,
        userId,
        req.user!.id
      );

      res.json({ success: true });
    } catch (err: any) {
      handleError(res, err);
    }
  }
}

function handleError(res: Response, err: any) {
  const map: Record<string, number> = {
    "Only owner can update shop":  403,
    "Only owner can delete shop":  403,
    "Not authorized":              403,
    "Permission denied":           403,
    "Owner cannot be removed":     403,
    "User already active":         400,  // ← this was missing, caused 403
    SHOP_NOT_FOUND:                404,
    USER_NOT_FOUND:                404,
  };
  const status = map[err.message] ?? 500;
  if (status === 500) console.error("[ShopController]", err);
  res.status(status).json({ message: err.message });
}