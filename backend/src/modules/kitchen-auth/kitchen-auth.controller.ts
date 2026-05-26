// =========================================================
// kitchen-auth.controller.ts
// Path: backend/src/modules/kitchen-auth/kitchen-auth.controller.ts
//
// NEW handlers:
//   setStaffKitchenPin()    — manager sets kitchen PIN for a staff member
//   removeStaffKitchenPin() — manager removes kitchen PIN for a staff member
// =========================================================

import { Request, Response } from "express";
import { KitchenAuthService } from "./kitchen-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { env }                from "../../config/validation.js";
import { AuditService }       from "../audit/audit.service.js";
import { UserRepository }     from "../user/user.repository.js";
import { appError }           from "../../utils/appError.js";
import { comparePassword }    from "../../utils/password.js";

export class KitchenAuthController {

  // GET /api/shops/:shopId/kitchen-auth/staff-list
  // Public — returns kitchen-eligible staff (OWNER, MANAGER, CHEF).
  static async getStaffList(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const list   = await KitchenAuthService.getStaffList(shopId);
      return res.json(list);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/kitchen-auth/pin
  // Sets the caller's own kitchen PIN.
  static async setPin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { pin }     = req.body;

      const result = await KitchenAuthService.setPin({ shopId, requesterId, pin });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/kitchen-auth/staff/:userId/pin
  // NEW: Manager/Owner sets the kitchen PIN for a specific staff member.
  static async setStaffKitchenPin(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;
      const { pin }      = req.body;

      // FIX: Call setStaffPin (the manager-sets-for-others method)
      // with the correct targetUserId, not setPin which only sets
      // the caller's own PIN.
      const result = await KitchenAuthService.setStaffPin({
        shopId,
        requesterId,
        targetUserId,
        pin,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // DELETE /api/shops/:shopId/kitchen-auth/pin
  // Removes the caller's own kitchen PIN.
  static async removePin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await KitchenAuthService.removePin({ shopId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // DELETE /api/shops/:shopId/kitchen-auth/staff/:userId/pin
  // NEW: Manager/Owner removes a specific staff member's kitchen PIN.
static async removeStaffKitchenPin(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      // FIX: Call removeStaffPin with the correct targetUserId
      const result = await KitchenAuthService.removeStaffPin({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/kitchen-auth/login
static async login(req: Request, res: Response) {
  try {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { user_id, pin } = req.body;

    // Read the hardware passport from the HttpOnly cookie.
    // The frontend cannot access or forge this value.
    // This is the same terminal_id cookie set during mode activation.
    const terminalId = req.cookies.terminal_id as string | undefined;

    const result = await KitchenAuthService.loginWithPin({
      shopId,
      userId:     user_id,
      pin,
      terminalId, // pass cookie value, not body value
    });

    res.cookie("kitchen_token", result.token, {
      httpOnly: true,
      secure:   env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   12 * 60 * 60 * 1000,
    });

    res.clearCookie("access_token");

    return res.json({ role: result.role });
  } catch (err) {
    return handleError(res, err);
  }
}

  // POST /api/shops/:shopId/kitchen-auth/logout
  static async logout(_req: Request, res: Response) {
    try {
      res.clearCookie("kitchen_token");
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/kitchen-auth/force-logout/:userId
  static async forceLogout(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await KitchenAuthService.forceLogoutStaff({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/kitchen-auth/reset-lock/:userId
  static async resetStaffLock(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId,  "userId");
      const requesterId  = req.user!.id;

      const result = await KitchenAuthService.resetStaffLock({ shopId, requesterId, targetUserId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/kitchen-auth/exit
static async exitKitchenMode(req: Request, res: Response) {
  try {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const { password } = req.body;
    const userId       = req.user!.id;

    const user = await UserRepository.findById(userId);
    if (!user) throw new appError("USER_NOT_FOUND", 404);

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) throw new appError("INVALID_PASSWORD", 401);

    await UserRepository.incrementTokenVersion(userId);

    // Burn the mode cookies — staff session is destroyed
    res.clearCookie("access_token");
    res.clearCookie("kitchen_token");
    // NOTE: terminal_id is deliberately NOT cleared.
    // The hardware passport survives the logout so the next
    // chef who logs in on this tablet is still traceable.

    await AuditService.log({
      shopId,
      userId,
      action:   "KITCHEN_MODE_EXITED",
      entity:   "USER",
      entityId: userId,
    });

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}
}