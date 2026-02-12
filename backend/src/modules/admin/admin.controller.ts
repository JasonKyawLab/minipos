import { Request, Response } from "express";
import { AdminService } from "./admin.service.js";

export class AdminController {

  static async getUsers(req: Request, res: Response) {
    const users = await AdminService.getAllUsers();
    res.json(users);
  }

  static async promote(
    req: Request<{ userId: string }>,
    res: Response
  ) {
    const actorId = req.user!.id;
    const { userId } = req.params;

    const result = await AdminService.promoteToAdmin(userId, actorId);
    res.json(result);
  }

  static async demote(
    req: Request<{ userId: string }>,
    res: Response
  ) {
    const actorId = req.user!.id;
    const { userId } = req.params;

    const result = await AdminService.demoteToUser(userId, actorId);
    res.json(result);
  }

  static async deleteUser(
    req: Request<{ userId: string }>,
    res: Response
  ) {
    const actorId = req.user!.id;
    const { userId } = req.params;

    const result = await AdminService.deleteUser(userId, actorId);
    res.json(result);
  }

  static async restoreUser(
    req: Request<{ userId: string }>,
    res: Response
  ) {
    const actorId = req.user!.id;
    const { userId } = req.params;

    const result = await AdminService.restoreUser(userId, actorId);
    res.json(result);
  }

  static async getShops(req: Request, res: Response) {
    const shops = await AdminService.getAllShops();
    res.json(shops);
  }

  static async deleteShop(
    req: Request<{ shopId: string }>,
    res: Response
  ) {
    const actorId = req.user!.id;
    const { shopId } = req.params;

    const result = await AdminService.deleteShop(shopId, actorId);
    res.json(result);
  }

  static async restoreShop(
    req: Request<{ shopId: string }>,
    res: Response
  ) {
    const actorId = req.user!.id;
    const { shopId } = req.params;

    const result = await AdminService.restoreShop(shopId, actorId);
    res.json(result);
  }
}