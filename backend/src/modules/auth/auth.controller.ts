/** 
	•	Read req.body
	•	Validate input
	•	Return HTTP response
	•	Call service 
**/

import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { LoginRequest } from "./auth.types.js";

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

      if (!result) {
        return res.status(401).json({
          message: "Invalid email or password",
        });
      }

      // Success
      return res.json({
      token: result.token,   // 👈 IMPORTANT
      user: result.user,
      });
    } catch (error) {
      console.error("Auth login error:", error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  static async register(req: Request, res: Response) {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password required",
      });
    }

    try {
      const user = await AuthService.register(
        name,
        email,
        password
      );

      return res.status(201).json({ user });
    } catch (err: any) {
      if (err.message === "USER_EXISTS") {
        return res.status(409).json({
          message: "User already exists",
        });
      }

      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

}