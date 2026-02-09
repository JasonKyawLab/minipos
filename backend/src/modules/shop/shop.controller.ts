import { Request, Response } from "express";
import { ShopService } from "./shop.service.js";
import { getParamAsString } from "../../utils/converter.js";

export class ShopController {
  /**
   * POST /api/shops
   */
  static async createShop(req: Request, res: Response) {
    try {

          if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
      const { name, shopType, currency } = req.body;

      const shop = await ShopService.createShop({
        ownerId: req.user.userId,
        name,
        shopType,
        currency,
      });

      res.status(201).json(shop);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }

  /**
 * PUT /api/shops/:shopId
 * Update shop info (OWNER only)
 */
static async updateShop(req: Request, res: Response) {
  try {
    if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
    }

    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { name, currency } = req.body;

    const updated = await ShopService.updateShop({
      shopId,
      requesterId: req.user!.userId,
      name,
      currency,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
}

  /**
   * GET /api/shops/my
   */
  static async getMyShops(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const shops = await ShopService.getMyShops(req.user.userId);
      res.json(shops);
    } catch {
      res.status(500).json({ message: "Failed to fetch shops" });
    }
  }

  /**
   * POST /api/shops/:shopId/staff
   */
  static async addStaff(req: Request, res: Response) {
    try {

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

      const shopId = getParamAsString(req.params.shopId, "shopId");
      const { userId, role } = req.body;

      const result = await ShopService.addStaff({
        shopId,
        requesterId: req.user!.userId,
        staffUserId: userId,
        role,
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }

  /**
   * GET /api/shops/:shopId/staff
   */
  static async getStaff(req: Request, res: Response) {
    try {
      if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
      const shopId = getParamAsString(req.params.shopId, "shopId");

      const staff = await ShopService.getStaff(
        shopId,
        req.user!.userId
      );

      res.json(staff);
    } catch (err: any) {
      res.status(403).json({ message: err.message });
    }
  }

  /**
   * DELETE /api/shops/:shopId
   * Delete a shop (OWNER only)
   */
static async deleteShop(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const shopId = getParamAsString(req.params.shopId, "shopId");

    const result = await ShopService.deleteShop({
      shopId,
      requesterId: req.user!.userId,
    });

    res.json(result);
  } catch (err: any) {
    res.status(403).json({ message: err.message });
  }
}

static async removeStaff(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const shopId = getParamAsString(req.params.shopId, "shopId");
      const userId = getParamAsString(req.params.userId, "userId");

      await ShopService.removeStaffFromShop(
        shopId,
        userId,
        req.user.userId
      );

      res.json({ message: "Staff removed" });
    } catch (err: any) {
      res.status(403).json({ message: err.message });
    }
  }

}