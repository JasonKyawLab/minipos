import { Request, Response } from "express";
import { UserService } from "./user.service.js";
import { toUserDTO } from "./user.dto.js";
import { AuthService } from "../auth/auth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { env } from "../../config/validation.js";

export class UserController {

  static updateMe = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    const user = await UserService.updateMe(req.user.id, req.body);
    res.json(toUserDTO(user));
  });

  static deleteMe = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    const result = await UserService.deleteMe(req.user.id);
    res.json(result);
  });

  static myShops = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    const shops = await UserService.getMyShops(req.user.id);
    res.json(shops);
  });

  static changePassword = asyncHandler(async (req: Request, res: Response) => {
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
    res.cookie("access_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    });
    res.json({ message: "Password changed successfully" });
  });
}