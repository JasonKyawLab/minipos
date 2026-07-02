//
// BUG FIX: NULL tokenVersion comparison
//
// PROBLEM:
//   pos_token_version in shop_users defaults to NULL for new
//   rows (the column was added via ALTER TABLE without a
//   DEFAULT). When a staff member logs in for the first time,
//   PosAuthService assigns tokenVersion: 0 if the column is
//   NULL. The JWT is signed with { tokenVersion: 0 }.
//
//   On the very next authenticated request, requirePosAuth
//   reads the raw DB value and checks:
//     decoded.tokenVersion !== rows[0].pos_token_version
//     → 0 !== null   → true  → TOKEN_REVOKED → 401
//
//   This fires on EVERY login for any staff member whose
//   pos_token_version column has never been explicitly set,
//   which is everyone until force-logout has been used once.
//
// FIX:
//   Normalise the DB value before comparing:
//     const dbVersion = rows[0].pos_token_version ?? 0;
//   Now: 0 !== 0  → false  → token is valid  ✓

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

    // Check token version — this makes force-logout effective.
    const { rows } = await pool.query(
      `SELECT pos_token_version
       FROM shop_users
       WHERE shop_id   = $1
         AND user_id   = $2
         AND is_active = true`,
      [decoded.shopId, decoded.userId]
    );

    if (rows.length === 0) {
      res.status(401).json({ message: "TOKEN_REVOKED" });
      return;
    }

    // FIX: pos_token_version is NULL for rows created before the
    // column was added. Treat NULL as 0 — the same default the
    // service assigns when signing the JWT. Without this, every
    // first-time login produces: 0 !== null → true → 401.
    const dbVersion = rows[0].pos_token_version ?? 0;

    if (decoded.tokenVersion !== dbVersion) {
      res.status(401).json({ message: "TOKEN_REVOKED" });
      return;
    }

    req.posSession = {
      userId:   decoded.userId,
      shopId:   decoded.shopId,
      shopRole: decoded.shopRole,
    };

    next();
  } catch(err) {
    console.error('[requirePosAuth] jwt.verify failed:', err);
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
        WHERE su.shop_id   = $1
          AND su.user_id   = $2
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
        res.status(403).json({ message: "FORBIDDEN" });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}