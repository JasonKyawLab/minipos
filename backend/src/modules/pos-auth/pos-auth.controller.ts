import { Request, Response }  from "express";
import { PosAuthService }     from "./pos-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { env }                from "../../config/validation.js";

export class PosAuthController {

  // GET /api/shops/:shopId/pos-auth/staff-list
  // Public within the shop — no cookie needed.
  // The tablet login screen calls this to populate the
  // staff grid before any PIN is entered.
  static async getStaffList(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const list   = await PosAuthService.getStaffList(shopId);
      return res.json(list);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/pin
  // Requires platform access_token (staff must be logged in
  // to their normal account to set their POS PIN).
  static async setPin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { pin }     = req.body;

      const result = await PosAuthService.setPin({ shopId, requesterId, pin });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // DELETE /api/shops/:shopId/pos-auth/pin
  // Staff removes their own PIN.
  static async removePin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await PosAuthService.removePin({ shopId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/login
  // No platform token needed — this is the PIN tap-to-login.
  // On success sets pos_token httpOnly cookie (8h expiry).
  static async login(req: Request, res: Response) {
    try {
      const shopId           = getParamAsString(req.params.shopId, "shopId");
      const { user_id, pin } = req.body;

      const result = await PosAuthService.loginWithPin({
        shopId,
        userId: user_id,
        pin,
      });

      // pos_token is separate from access_token —
      // different cookie name, shorter life, POS-only
      res.cookie("pos_token", result.token, {
        httpOnly: true,
        secure:   env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   8 * 60 * 60 * 1000,  // 8 hours = one shift
      });

      return res.json({ role: result.role });
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/pos-auth/logout
  // Clears pos_token cookie.
  static async logout(_req: Request, res: Response) {
    try {
      res.clearCookie("pos_token");
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId
  // OWNER / MANAGER can unlock a locked-out cashier.
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
  // OWNER sets pin_max_attempts for the shop.
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