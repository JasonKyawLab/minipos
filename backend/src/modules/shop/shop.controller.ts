// =========================================================
// shop.controller.ts
// Path: backend/src/modules/shop/shop.controller.ts
//
// NEW: changeStaffRole() — HTTP handler for role changes
// =========================================================

import { Request, Response }  from "express";
import { ShopService }        from "./shop.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";

export class ShopController {

  static async createShop(req: Request, res: Response) {
    try {
      const { name, shopType, currency } = req.body;
      const shop = await ShopService.createShop({
        ownerId: req.user!.id, name, shopType, currency,
      });
      res.status(201).json(shop);
    } catch (err: any) { return handleError(res, err); }
  }

  static async updateShop(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const { name, currency } = req.body;
      const updated = await ShopService.updateShop({
        shopId, requesterId: req.user!.id, name, currency,
      });
      res.json(updated);
    } catch (err: any) { return handleError(res, err); }
  }

  static async deleteShop(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      await ShopService.deleteShop({ shopId, requesterId: req.user!.id });
      res.json({ success: true });
    } catch (err: any) { return handleError(res, err); }
  }

  static async addStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const { userId, role } = req.body;
      const result = await ShopService.addStaff({
        shopId, requesterId: req.user!.id, staffUserId: userId, role,
      });
      res.status(201).json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const staff  = await ShopService.getStaff(shopId, req.user!.id);
      res.json(staff);
    } catch (err: any) { return handleError(res, err); }
  }

  static async removeStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const userId = getParamAsString(req.params.userId, "userId");
      await ShopService.removeStaffFromShop(shopId, userId, req.user!.id);
      res.json({ success: true });
    } catch (err: any) { return handleError(res, err); }
  }

  // ── NEW: Change a staff member's role ────────────────────
  // PATCH /api/shops/:shopId/staff/:userId/role
  // Body: { role: "MANAGER" | "CASHIER" | "CHEF" }
  //
  // Permission: OWNER can change any non-OWNER role.
  //             MANAGER can change CASHIER ↔ CHEF only.
  static async changeStaffRole(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const { role }     = req.body;

      const result = await ShopService.changeStaffRole({
        shopId,
        requesterId:  req.user!.id,
        targetUserId,
        newRole:      role,
      });
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async verifyPassword(req: Request, res: Response) {
    try {
      const shopId   = getParamAsString(req.params.shopId, "shopId");
      const userId   = req.user!.id;
      const { password } = req.body;

      await ShopService.verifyUserPassword({ shopId, userId, password });
      res.json({ valid: true });
    } catch (err: any) { return handleError(res, err); }
  }

  static async inviteStaff(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const { email, role } = req.body;
      const result = await ShopService.inviteStaffByEmail({
        shopId,
        requesterId: req.user!.id,
        email,
        role,
      });
      res.status(201).json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }
}