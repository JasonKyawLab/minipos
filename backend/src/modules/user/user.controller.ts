import { Request, Response } from "express";
import { UserService } from "./user.service.js";
import { toUserDTO } from "./user.dto.js";
import { AuthService } from "../auth/auth.service.js";

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

  static async changePassword(req: Request, res: Response) {
  if (!req.user) return res.sendStatus(401);

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "MISSING_FIELDS" });
  }

  const token = await AuthService.changePassword(
  req.user.id,
  currentPassword,
  newPassword
);

  res.cookie("token", token, {
  httpOnly: true,
  secure: false, // true in production (HTTPS)
  sameSite: "lax",
});


  res.json({ message: "Password changed successfully" });
}

}