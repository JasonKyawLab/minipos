import { Request, Response }  from "express";
import { ShopService }        from "./shop.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { asyncHandler }       from "../../utils/asyncHandler.js";

export class ShopController {

  static createShop = asyncHandler(async (req: Request, res: Response) => {
    const { name, shopType, currency } = req.body;
    const shop = await ShopService.createShop({
      ownerId: req.user!.id, name, shopType, currency,
    });
    res.status(201).json(shop);
  });

  static updateShop = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { name, currency } = req.body;
    const updated = await ShopService.updateShop({
      shopId, requesterId: req.user!.id, name, currency,
    });
    res.json(updated);
  });

  static deleteShop = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    await ShopService.deleteShop({ shopId, requesterId: req.user!.id });
    res.json({ success: true });
  });

  static addStaff = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { userId, role } = req.body;
    const result = await ShopService.addStaff({
      shopId, requesterId: req.user!.id, staffUserId: userId, role,
    });
    res.status(201).json(result);
  });

  static getStaff = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const staff  = await ShopService.getStaff(shopId, req.user!.id);
    res.json(staff);
  });

  static removeStaff = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const userId = getParamAsString(req.params.userId, "userId");
    await ShopService.removeStaffFromShop(shopId, userId, req.user!.id);
    res.json({ success: true });
  });

  // PATCH /api/shops/:shopId/staff/:userId/role
  // Body: { role: "MANAGER" | "CASHIER" | "CHEF" }
  // Permission: OWNER can change any non-OWNER role.
  //             MANAGER can change CASHIER ↔ CHEF only.
  static changeStaffRole = asyncHandler(async (req: Request, res: Response) => {
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
  });

  static verifyPassword = asyncHandler(async (req: Request, res: Response) => {
    const shopId   = getParamAsString(req.params.shopId, "shopId");
    const userId   = req.user!.id;
    const { password } = req.body;

    await ShopService.verifyUserPassword({ shopId, userId, password });
    res.json({ valid: true });
  });

  static inviteStaff = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const { email, role } = req.body;
    const result = await ShopService.inviteStaffByEmail({
      shopId,
      requesterId: req.user!.id,
      email,
      role,
    });
    res.status(201).json(result);
  });
}