// =========================================================
// pos-auth.controller.ts
// Path: backend/src/modules/pos-auth/pos-auth.controller.ts
//
// NEW handlers:
//   setStaffPin()    — manager sets PIN for a specific staff member
//   removeStaffPin() — manager removes PIN for a specific staff member
// =========================================================

import { Request, Response }  from "express";
import { PosAuthService }     from "./pos-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { env }                from "../../config/validation.js";

export class PosAuthController {

  // GET /api/shops/:shopId/pos-auth/staff-list
  // Public — no cookie needed. CHEF excluded at repository level.
  static async getStaffList(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const list   = await PosAuthService.getStaffList(shopId);
      return res.json(list);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/pin
  // Sets the caller's own POS PIN. Requires platform access_token.
  static async setPin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { pin }     = req.body;

      const result = await PosAuthService.setPin({ shopId, requesterId, pin });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/staff/:userId/pin
  // NEW: Manager/Owner sets the POS PIN for a specific staff member.
  // This is the "onboarding" flow — manager enters PIN on behalf of staff.
  static async setStaffPin(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;
      const { pin }      = req.body;

      const result = await PosAuthService.setStaffPin({
        shopId,
        requesterId,
        targetUserId,
        pin,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // DELETE /api/shops/:shopId/pos-auth/pin
  // Removes the caller's own POS PIN.
  static async removePin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await PosAuthService.removePin({ shopId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // DELETE /api/shops/:shopId/pos-auth/staff/:userId/pin
  // NEW: Manager/Owner removes a specific staff member's POS PIN.
  static async removeStaffPin(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await PosAuthService.removeStaffPin({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/login
  // PIN login — issues pos_token cookie. CHEF blocked at service level.
  static async login(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const { user_id, pin, device_id } = req.body;

      const result = await PosAuthService.loginWithPin({
        shopId,
        userId:   user_id,
        pin,
        deviceId: device_id,
      });

      res.cookie("pos_token", result.token, {
        httpOnly: true,
        secure:   env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   8 * 60 * 60 * 1000,
      });

      res.clearCookie("access_token");

      return res.json({ role: result.role });
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/logout
  static async logout(_req: Request, res: Response) {
    try {
      res.clearCookie("pos_token");
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/force-logout/:userId
  static async forceLogout(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await PosAuthService.forceLogoutStaff({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId
  static async resetStaffLock(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await PosAuthService.resetStaffLock({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/pos-auth/settings
  static async updateSettings(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const requesterId  = req.user!.id;
      const { pin_max_attempts } = req.body;

      const result = await PosAuthService.updatePinMaxAttempts({
        shopId,
        requesterId,
        maxAttempts: pin_max_attempts,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }
}