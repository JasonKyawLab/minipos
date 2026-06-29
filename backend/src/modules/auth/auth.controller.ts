import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { LoginRequest } from "./auth.types.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { env } from "../../config/validation.js";

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

  static logout = asyncHandler(async (_req: Request, res: Response) => {
    res.clearCookie("access_token");
    res.json({ message: "Logged out successfully" });
  });
}