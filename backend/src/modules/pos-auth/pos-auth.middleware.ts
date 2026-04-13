// =========================================================
// pos-auth.middleware.ts
// Path: backend/src/modules/pos-auth/pos-auth.middleware.ts
// =========================================================
// Two responsibilities:
//
//   1. requirePosAuth — verifies the pos_token cookie,
//      attaches req.posSession for downstream handlers.
//
//   2. requireShopRole — a route-level guard that checks
//      the platform-authenticated user's SHOP role (OWNER,
//      MANAGER, CASHIER) before the request reaches the
//      service layer.
//
//      WHY we need this:
//      requireRole() only checks the PLATFORM role (ADMIN |
//      USER). It knows nothing about which shop the user
//      belongs to or what role they hold there.
//
//      requireShopRole() queries shop_users so we can block
//      a CASHIER from calling force-logout at the ROUTE level,
//      before we even touch the service. This is defense in
//      depth — the service layer also checks, but having two
//      layers means a future refactor in one place won't
//      accidentally open a privilege escalation hole.
//
//      Usage in routes (always after requireAuth):
//        router.post(
//          "/force-logout/:userId",
//          requireShopRole("OWNER", "MANAGER"),
//          controller.forceLogout
//        );
// =========================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/validation.js";
import { pool } from "../../db/pool.js";

// ── POS JWT payload ───────────────────────────────────────

interface PosJwtPayload {
  userId:       string;
  shopId:       string;
  shopRole:     "OWNER" | "MANAGER" | "CASHIER";
  type:         "POS";
  tokenVersion: number;
}

// ─────────────────────────────────────────────────────────
// requirePosAuth
//
// Reads pos_token cookie (not access_token).
// Verifies type:"POS" claim so a platform token can never
// be used to authenticate a POS session.
// Attaches req.posSession.
// ─────────────────────────────────────────────────────────

export async function requirePosAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies.pos_token;

  if (!token) {
    res.status(401).json({ message: "POS_NOT_AUTHENTICATED" });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as PosJwtPayload;

    if (decoded.type !== "POS") {
      res.status(401).json({ message: "INVALID_TOKEN_TYPE" });
      return;
    }

    // Check token version — this makes force-logout effective
    const { rows } = await pool.query(
      `SELECT pos_token_version
       FROM shop_users
       WHERE shop_id  = $1
         AND user_id  = $2
         AND is_active = true`,
      [decoded.shopId, decoded.userId]
    );

    if (rows.length === 0 || decoded.tokenVersion !== rows[0].pos_token_version) {
      res.status(401).json({ message: "TOKEN_REVOKED" });
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

// ─────────────────────────────────────────────────────────
// requirePosRole
//
// Guards a POS-authenticated route to specific shop roles.
// Must come AFTER requirePosAuth in the middleware chain.
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// requireShopRole
//
// Route-level guard for PLATFORM-authenticated routes that
// need a shop-role check BEFORE reaching the service layer.
//
// Requires:
//   - req.user to be set (i.e., requireAuth must run first)
//   - :shopId to be in req.params
//
// This queries shop_users once per request. The result is
// NOT cached on req — the service layer does its own check
// for business-logic purposes. The two DB reads are cheap
// and keep the layers independent.
// ─────────────────────────────────────────────────────────

export function requireShopRole(...allowedRoles: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // requireAuth must have run first
    if (!req.user) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const shopId = req.params.shopId;
    if (!shopId) {
      res.status(400).json({ message: "shopId is required" });
      return;
    }

    try {
      const { rows } = await pool.query(
        `
        SELECT su.role, su.is_active
        FROM shop_users su
        JOIN shops s ON s.id = su.shop_id
        WHERE su.shop_id  = $1
          AND su.user_id  = $2
          AND s.is_deleted = false
        `,
        [shopId, req.user.id]
      );

      const member = rows[0];

      if (!member || !member.is_active) {
        res.status(403).json({ message: "FORBIDDEN" });
        return;
      }

      if (!allowedRoles.includes(member.role)) {
        // Return 403 with a clear message so the client can
        // distinguish "not a member" from "wrong role".
        res.status(403).json({ message: "FORBIDDEN" });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}