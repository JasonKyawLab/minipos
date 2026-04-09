import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/validation.js";

interface KitchenJwtPayload {
  userId:   string;
  shopId:   string;
  shopRole: "OWNER" | "MANAGER" | "CHEF";
  type:     "KITCHEN_SESSION";
}

// Reads kitchen_token cookie — completely separate from pos_token and access_token.
// type:"KITCHEN_SESSION" in the JWT payload prevents any other token
// from being accepted here, even if someone tries to reuse a POS token.
export function requireKitchenAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies.kitchen_token;

  if (!token) {
    res.status(401).json({ message: "KITCHEN_NOT_AUTHENTICATED" });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as KitchenJwtPayload;

    // Reject platform tokens or POS tokens used here
    if (decoded.type !== "KITCHEN_SESSION") {
      res.status(401).json({ message: "INVALID_TOKEN_TYPE" });
      return;
    }

    req.kitchenSession = {
      userId:   decoded.userId,
      shopId:   decoded.shopId,
      shopRole: decoded.shopRole,
    };

    next();
  } catch {
    res.status(401).json({ message: "INVALID_KITCHEN_TOKEN" });
  }
}

// Role guard for kitchen routes that need elevated permissions
export function requireKitchenRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.kitchenSession) {
      res.status(401).json({ message: "KITCHEN_NOT_AUTHENTICATED" });
      return;
    }

    if (!roles.includes(req.kitchenSession.shopRole)) {
      res.status(403).json({ message: "FORBIDDEN" });
      return;
    }

    next();
  };
}