// =========================================================
// pos-auth.middleware.ts
// Path: backend/src/modules/pos-auth/pos-auth.middleware.ts
// =========================================================
// requirePosAuth — completely separate from requireAuth.
//
// Reads pos_token cookie (not access_token).
// Verifies type:"POS" claim so a platform token can never
// be used to authenticate a POS session and vice versa.
//
// Attaches req.posSession so controllers can read shopId
// and shopRole without re-querying the DB.
// =========================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PosJwtPayload } from "./pos-auth.types.js";
import { env } from "../../config/validation.js";

// Extend Express Request to carry the POS session
declare global {
  namespace Express {
    interface Request {
      posSession?: {
        userId:   string;
        shopId:   string;
        shopRole: "OWNER" | "MANAGER" | "CASHIER";
      };
    }
  }
}

export function requirePosAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies.pos_token;

  if (!token) {
    res.status(401).json({ message: "POS_NOT_AUTHENTICATED" });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as PosJwtPayload;

    // Guard: reject platform tokens used on POS endpoints
    if (decoded.type !== "POS") {
      res.status(401).json({ message: "INVALID_TOKEN_TYPE" });
      return;
    }

    req.posSession = {
      userId:   decoded.userId,
      shopId:   decoded.shopId,
      shopRole: decoded.shopRole,
    };

    next();
  } catch {
    res.status(401).json({ message: "INVALID_POS_TOKEN" });
  }
}

// ── Optional: restrict POS actions by role ────────────────
// e.g. requirePosRole("OWNER", "MANAGER") on refund endpoints
export function requirePosRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.posSession) {
      res.status(401).json({ message: "POS_NOT_AUTHENTICATED" });
      return;
    }

    if (!roles.includes(req.posSession.shopRole)) {
      res.status(403).json({ message: "FORBIDDEN" });
      return;
    }

    next();
  };
}