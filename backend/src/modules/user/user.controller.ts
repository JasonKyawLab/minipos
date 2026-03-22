import { Request, Response } from "express";
import { UserService } from "./user.service.js";
import { toUserDTO } from "./user.dto.js";
import { AuthService } from "../auth/auth.service.js";

export class UserController {

  static async updateMe(req: Request, res: Response) {
    try {
      if (!req.user) return res.sendStatus(401);
      const user = await UserService.updateMe(req.user.id, req.body);
      res.json(toUserDTO(user));
    } catch (err: any) { return handleError(res, err); }
  }

  static async deleteMe(req: Request, res: Response) {
    try {
      if (!req.user) return res.sendStatus(401);
      const result = await UserService.deleteMe(req.user.id);
      res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async myShops(req: Request, res: Response) {
    try {
      if (!req.user) return res.sendStatus(401);
      const shops = await UserService.getMyShops(req.user.id);
      res.json(shops);
    } catch (err: any) { return handleError(res, err); }
  }

  static async changePassword(req: Request, res: Response) {
    try {
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
        secure: false,
        sameSite: "lax",
      });
      res.json({ message: "Password changed successfully" });
    } catch (err: any) { return handleError(res, err); }
  }
}

function handleError(res: Response, err: any) {
  const map: Record<string, number> = {
    NOTHING_TO_UPDATE:          400,
    PASSWORD_MUST_BE_DIFFERENT: 400,
    MISSING_FIELDS:             400,
    INVALID_CURRENT_PASSWORD:   401,
    USER_NOT_FOUND:             404,
  };
  const status = map[err.message] ?? 500;
  if (status === 500) console.error("[UserController]", err);
  res.status(status).json({ message: err.message });
}