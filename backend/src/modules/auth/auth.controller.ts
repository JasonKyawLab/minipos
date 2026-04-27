import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { LoginRequest } from "./auth.types.js";
import { handleError } from "../../utils/handleError.js";
import { env } from "../../config/validation.js";

export class AuthController {

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as LoginRequest;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          message: "Email and password are required",
        });
      }

      // Authenticate
      const result = await AuthService.login(email, password);

      res.cookie("access_token", result.token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.json({
        user: result.user,
      });

    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async register(req: Request, res: Response) {
    try {
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

      return res.status(201).json({
        message: "Account created successfully",
      });

    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async logout(_req: Request, res: Response) {
    try {
      res.clearCookie("access_token");
      return res.json({ message: "Logged out successfully" });
    } catch (err: any) {
      return handleError(res, err);
    }
  }
}