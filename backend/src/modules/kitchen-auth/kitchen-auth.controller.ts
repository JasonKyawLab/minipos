import { Request, Response } from "express";
import { KitchenAuthService } from "./kitchen-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { asyncHandler }       from "../../utils/asyncHandler.js";
import { env }                from "../../config/validation.js";
import { AuditService }       from "../audit/audit.service.js";
import { UserRepository }     from "../user/user.repository.js";
import { appError }           from "../../utils/appError.js";
import { comparePassword }    from "../../utils/password.js";

export class KitchenAuthController {

  // GET /api/shops/:shopId/kitchen-auth/staff-list
  // Public — returns kitchen-eligible staff (OWNER, MANAGER, CHEF).
  static getStaffList = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const list   = await KitchenAuthService.getStaffList(shopId);
    res.json(list);
  });

  // POST /api/shops/:shopId/kitchen-auth/pin
  // Sets the caller's own kitchen PIN.
  static setPin = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const { pin }     = req.body;

    const result = await KitchenAuthService.setPin({ shopId, requesterId, pin });
    res.json(result);
  });

  // POST /api/shops/:shopId/kitchen-auth/staff/:userId/pin
  // Manager/Owner sets the kitchen PIN for a specific staff member.
  static setStaffKitchenPin = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;
    const { pin }      = req.body;

    const result = await KitchenAuthService.setStaffPin({
      shopId,
      requesterId,
      targetUserId,
      pin,
    });
    res.json(result);
  });

  // DELETE /api/shops/:shopId/kitchen-auth/pin
  // Removes the caller's own kitchen PIN.
  static removePin = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const result = await KitchenAuthService.removePin({ shopId, requesterId });
    res.json(result);
  });

  // DELETE /api/shops/:shopId/kitchen-auth/staff/:userId/pin
  // Manager/Owner removes a specific staff member's kitchen PIN.
  static removeStaffKitchenPin = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;

    const result = await KitchenAuthService.removeStaffPin({
      shopId,
      requesterId,
      targetUserId,
    });
    res.json(result);
  });

  // POST /api/shops/:shopId/kitchen-auth/login
  static login = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { user_id, pin } = req.body;

    // Read the hardware passport from the HttpOnly cookie.
    // The frontend cannot access or forge this value.
    const terminalId = req.cookies.terminal_id as string | undefined;

    const result = await KitchenAuthService.loginWithPin({
      shopId,
      userId:     user_id,
      pin,
      terminalId,
    });

    res.cookie("kitchen_token", result.token, {
      httpOnly: true,
      secure:   env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   12 * 60 * 60 * 1000,
    });

    res.clearCookie("access_token");

    res.json({ role: result.role, name: result.name, shopName: result.shopName });
  });

  // POST /api/shops/:shopId/kitchen-auth/logout
  static logout = asyncHandler(async (_req: Request, res: Response) => {
    res.clearCookie("kitchen_token");
    res.json({ success: true });
  });

  // POST /api/shops/:shopId/kitchen-auth/force-logout/:userId
  static forceLogout = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;

    const result = await KitchenAuthService.forceLogoutStaff({
      shopId,
      requesterId,
      targetUserId,
    });
    res.json(result);
  });

  // PATCH /api/shops/:shopId/kitchen-auth/reset-lock/:userId
  static resetStaffLock = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId,  "userId");
    const requesterId  = req.user!.id;

    const result = await KitchenAuthService.resetStaffLock({ shopId, requesterId, targetUserId });
    res.json(result);
  });

  // POST /api/shops/:shopId/kitchen-auth/exit
  static exitKitchenMode = asyncHandler(async (req: Request, res: Response) => {
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

    await AuditService.log({
      shopId,
      userId,
      action:   "KITCHEN_MODE_EXITED",
      entity:   "USER",
      entityId: userId,
    });

    res.json({ success: true });
  });
}