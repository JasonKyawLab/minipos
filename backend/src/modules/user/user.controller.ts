import { Request, Response } from "express";
import { UserService } from "./user.service.js";
import { toUserDTO } from "./user.dto.js";

export class UserController {
  static async updateMe(req: Request, res: Response) {
    if (!req.user) return res.sendStatus(401);

    const user = await UserService.updateMe(req.user.id, req.body);
    res.json(toUserDTO(user));
  }

  static async deleteMe(req: Request, res: Response) {
    if (!req.user) return res.sendStatus(401);

    const result = await UserService.deleteMe(req.user.id);
    res.json(result);
  }

  static async myShops(req: Request, res: Response) {
    if (!req.user) return res.sendStatus(401);

    const shops = await UserService.getMyShops(req.user.id);
    res.json(shops);
  }

}