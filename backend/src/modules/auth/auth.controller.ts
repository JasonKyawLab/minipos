import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { LoginRequest } from "./auth.types.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { env } from "../../config/validation.js";
import { pool } from "../../db/pool.js";

export class AuthController {

  static login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const result = await AuthService.login(email, password);

    res.cookie("access_token", result.token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    pool.query("UPDATE users SET is_online = true WHERE id = $1", [result.user.id]).catch(() => {});

    res.json({
      user: result.user,
    });
  });

  static register = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password required",
      });
    }

    const result = await AuthService.register(name, email, password);

    if (result.restored) {
      return res.status(200).json({
        message: "Your account was previously deleted. It has been restored. Please log in using your previous password.",
      });
    }

    res.status(201).json({
      message: "Account created successfully",
    });
  });

  static logout = asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.id) {
      pool.query("UPDATE users SET is_online = false WHERE id = $1", [req.user.id]).catch(() => {});
    }
    res.clearCookie("access_token");
    res.json({ message: "Logged out successfully" });
  });
}