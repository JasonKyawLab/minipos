import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "./auth.types.js";
import { UserRepository } from "../user/user.repository.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    const user = await UserRepository.findById(decoded.userId);

    if (!user || user.is_deleted) {
      return res.status(401).json({ message: "Invalid user" });
    }

    // Always trust DB role
    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}