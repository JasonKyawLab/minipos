// =========================================================
// admin.controller.ts
// Path: backend/src/modules/admin/admin.controller.ts
// Line: Replace handleError function
// =========================================================

import { Request, Response } from "express";
import { AdminService } from "./admin.service.js";
import { handleError } from "../../utils/handleError.js";

export class AdminController {

  static async getUsers(_req: Request, res: Response) {
    try {
      const users = await AdminService.getAllUsers();
      res.json(users);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async promote(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.promoteToAdmin(userId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async demote(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.demoteToUser(userId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async deleteUser(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.deleteUser(userId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async restoreUser(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.restoreUser(userId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getShops(_req: Request, res: Response) {
    try {
      const shops = await AdminService.getAllShops();
      res.json(shops);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async deleteShop(req: Request<{ shopId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { shopId } = req.params;
      const result = await AdminService.deleteShop(shopId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async restoreShop(req: Request<{ shopId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { shopId } = req.params;
      const result = await AdminService.restoreShop(shopId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async suspendShop(req: Request<{ shopId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { shopId } = req.params;
      const { reason } = req.body;
      const result = await AdminService.suspendShop(shopId, reason, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async unsuspendShop(req: Request<{ shopId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { shopId } = req.params;
      const result = await AdminService.unsuspendShop(shopId, actorId);
      res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async suspendUser(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.suspendUser(userId, actorId);
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async reactivateUser(req: Request<{ userId: string }>, res: Response) {
    try {
      const actorId = req.user!.id;
      const { userId } = req.params;
      const result = await AdminService.reactivateUser(userId, actorId);
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async getStats(_req: Request, res: Response) {
    try {
      const stats = await AdminService.getStats();
      return res.json(stats);
    } catch (err) { return handleError(res, err); }
  }
}