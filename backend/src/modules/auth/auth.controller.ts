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

    // Success
    return res.json({
      token: result.token,
      user: result.user,
    });

  } catch (err: any) {
    if (err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ message: "User not found" });
    }

    if (err.message === "USER_NOT_ACTIVE") {
  return res.status(403).json({ message: "User is not active" });
}
    
    if (err.message === "INVALID_PASSWORD") {
      return res.status(401).json({ message: "Invalid password" });
    }

    console.error("Auth login error:", err);
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
    const result = await AuthService.register(name, email, password);

    if (result.restored) {
      return res.status(200).json({
        message:
          "Your account was previously deleted. It has been restored. Please log in using your previous password.",
      });
    }

    return res.status(201).json({
      message: "Account created successfully",
    });

  } catch (err: any) {
    if (err.message === "USER_EXISTS") {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    console.error(err); // important for debugging
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

}