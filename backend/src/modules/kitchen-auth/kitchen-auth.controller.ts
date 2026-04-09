import { Request, Response } from "express";
import { KitchenAuthService } from "./kitchen-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { env }                from "../../config/validation.js";
import { AuditService } from "../audit/audit.service.js";
import { UserRepository } from "../user/user.repository.js";
import { appError } from "../../utils/appError.js";
import { comparePassword } from "../../utils/password.js";

export class KitchenAuthController {

  static async getStaffList(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const list   = await KitchenAuthService.getStaffList(shopId);
      return res.json(list);
    } catch (err) { return handleError(res, err); }
  }

  static async setPin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { pin }     = req.body;

      const result = await KitchenAuthService.setPin({ shopId, requesterId, pin });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async removePin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await KitchenAuthService.removePin({ shopId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async login(req: Request, res: Response) {
    try {
      const shopId           = getParamAsString(req.params.shopId, "shopId");
      const { user_id, pin } = req.body;

      const result = await KitchenAuthService.loginWithPin({ shopId, userId: user_id, pin });

      res.cookie("kitchen_token", result.token, {
        httpOnly: true,
        secure:   env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   12 * 60 * 60 * 1000,  // 12 hours
      });

      return res.json({ role: result.role });
    } catch (err) { return handleError(res, err); }
  }

  static async logout(_req: Request, res: Response) {
    try {
      res.clearCookie("kitchen_token");
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  }

  static async forceLogout(req: Request, res: Response) {
  try {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;  // platform access_token required

    const result = await KitchenAuthService.forceLogoutStaff({
      shopId,
      requesterId,
      targetUserId,
    });
    return res.json(result);
  } catch (err) { return handleError(res, err); }
  }

  static async resetStaffLock(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId,  "userId");
      const requesterId  = req.user!.id;

      const result = await KitchenAuthService.resetStaffLock({ shopId, requesterId, targetUserId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async exitKitchenMode(req: Request, res: Response) {
  try {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { password } = req.body;

    // The user must have a valid access_token (platform auth)
    const userId = req.user!.id;

    // Verify password against the user's stored hash
    const user = await UserRepository.findById(userId);
    if (!user) throw new appError("USER_NOT_FOUND", 404);

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) throw new appError("INVALID_PASSWORD", 401);

    // Clear both cookies
    res.clearCookie("access_token");
    res.clearCookie("kitchen_token");

    await AuditService.log({
      shopId,
      userId,
      action: "KITCHEN_MODE_EXITED",
      entity: "USER",
      entityId: userId,
    });

    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}
}