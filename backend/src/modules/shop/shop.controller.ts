// =========================================================
// src/modules/shop/shop.controller.ts
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

  // ── Mode gate ─────────────────────────────────────────────
  // POST /api/shops/:shopId/verify-password
  //
  // Verifies that the currently logged-in user's platform
  // password is correct. Used by the frontend mode gate to
  // confirm identity before entering or exiting POS/Kitchen.
  //
  // Returns 200 { valid: true } on success.
  // Returns 401 { message: "INVALID_PASSWORD" } on failure.
  // Never reveals whether the user exists — same response shape
  // for wrong password regardless of reason.
  static async verifyPassword(req: Request, res: Response) {
    try {
      const shopId   = getParamAsString(req.params.shopId, "shopId");
      const userId   = req.user!.id;
      const { password } = req.body;

      await ShopService.verifyUserPassword({ shopId, userId, password });
      res.json({ valid: true });
    } catch (err: any) { return handleError(res, err); }
  }

  // ── Staff invitation ───────────────────────────────────
  // POST /api/shops/:shopId/staff/invite
  //
  // Invites a new staff member by email. The user must register first before being added to the shop.ß
  // Only OWNER or MANAGER can send an invite.
  // Body: { email: string, role: "MANAGER"|"CASHIER" }
  // Response: 201 { success: true } on success.
  //           400 if user with email doesn't exist or is already active in this shop.
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