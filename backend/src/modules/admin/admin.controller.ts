import { Request, Response } from "express";
import { AdminService } from "./admin.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export class AdminController {

  static getUsers = asyncHandler(async (_req: Request, res: Response) => {
    const users = await AdminService.getAllUsers();
    res.json(users);
  });

  static promote = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { userId } = req.params;
    const result = await AdminService.promoteToAdmin(userId, actorId);
    res.json(result);
  });

  static demote = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { userId } = req.params;
    const result = await AdminService.demoteToUser(userId, actorId);
    res.json(result);
  });

  static deleteUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { userId } = req.params;
    const result = await AdminService.deleteUser(userId, actorId);
    res.json(result);
  });

  static restoreUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { userId } = req.params;
    const result = await AdminService.restoreUser(userId, actorId);
    res.json(result);
  });

  static getShops = asyncHandler(async (_req: Request, res: Response) => {
    const shops = await AdminService.getAllShops();
    res.json(shops);
  });

  static deleteShop = asyncHandler(async (req: Request<{ shopId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { shopId } = req.params;
    const result = await AdminService.deleteShop(shopId, actorId);
    res.json(result);
  });

  static restoreShop = asyncHandler(async (req: Request<{ shopId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { shopId } = req.params;
    const result = await AdminService.restoreShop(shopId, actorId);
    res.json(result);
  });

  static suspendShop = asyncHandler(async (req: Request<{ shopId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { shopId } = req.params;
    const { reason } = req.body;
    const result = await AdminService.suspendShop(shopId, reason, actorId);
    res.json(result);
  });

  static unsuspendShop = asyncHandler(async (req: Request<{ shopId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { shopId } = req.params;
    const result = await AdminService.unsuspendShop(shopId, actorId);
    res.json(result);
  });

  static suspendUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { userId } = req.params;
    const result = await AdminService.suspendUser(userId, actorId);
    res.json(result);
  });

  static reactivateUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
    const actorId = req.user!.id;
    const { userId } = req.params;
    const result = await AdminService.reactivateUser(userId, actorId);
    res.json(result);
  });

  static getStats = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await AdminService.getStats();
    res.json(stats);
  });
}