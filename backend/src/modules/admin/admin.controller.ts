import { Request, Response } from "express";
import { AdminService } from "./admin.service.js";

export class AdminController {

  static async getUsers(_req: Request, res: Response) {
    try {
      const users = await AdminService.getAllUsers();
      res.json(users);
    } catch (err: any) { return handleError(res, err); }
  }

  static async promote(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.promoteToAdmin(userId, actorId);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async demote(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.demoteToUser(userId, actorId);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async deleteUser(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.deleteUser(userId, actorId);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async restoreUser(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.restoreUser(userId, actorId);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getShops(_req: Request, res: Response) {
    try {
      const shops = await AdminService.getAllShops();
      res.json(shops);
    } catch (err: any) { return handleError(res, err); }
  }

  static async deleteShop(req: Request<{ shopId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { shopId } = req.params;
      const result = await AdminService.deleteShop(shopId, actorId);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async restoreShop(req: Request<{ shopId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { shopId } = req.params;
      const result = await AdminService.restoreShop(shopId, actorId);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }
}

function handleError(res: Response, err: any) {
  const map: Record<string, number> = {
    CANNOT_MODIFY_SELF_ROLE:  400,
    CANNOT_DEMOTE_SELF:       400,
    CANNOT_DEMOTE_LAST_ADMIN: 400,
    CANNOT_DELETE_SELF:       400,
    USER_NOT_FOUND:           404,
    SHOP_NOT_FOUND:           404,
  };
  const status = map[err.message] ?? 500;
  if (status === 500) console.error("[AdminController]", err);
  res.status(status).json({ message: err.message });
}