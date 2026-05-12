import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { requireRole } from "./role.middleware.js";
import { requireBody } from "../../middlewares/validate.middleware.js";
import { UserRepository } from "../user/user.repository.js";
import { handleError } from "../../utils/handleError.js";
import { appError } from "../../utils/appError.js";
import { env } from "../../config/index.js";
import { JwtPayload } from "./auth.types.js";
import jwt                  from "jsonwebtoken"; 

const router = Router();

// GET /api/auth/me
// ─────────────────────────────────────────────────────────
// Called by AuthContext on every page load to hydrate the
// user session from the httpOnly cookie.
//
// The JWT only stores { userId, tokenVersion } — minimal data
// to keep tokens small. We fetch the full user from DB here
// so the frontend gets name, email, role, status.
//
// Why not store name/email in the JWT?
//   JWT payload is decoded client-side. Storing PII there
//   means it lives in a cookie forever until expiry.
//   Fetching from DB ensures we always get current data
//   (e.g. if the user updates their name, it reflects immediately).
router.get(
  "/me",
  requireAuth,
  requireRole("ADMIN", "USER"),
  async (req, res) => {
    try {
      const user = await UserRepository.findById(req.user!.id);

      if (!user || user.is_deleted) {
        throw new appError("USER_NOT_FOUND", 404);
      }

      // Return only safe fields — never return password_hash
      res.json({
        user: {
          id:     user.id,
          name:   user.name,
          email:  user.email,
          role:   user.role,
          status: user.status,
        },
      });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get('/session-type', async (req, res) => {
  try {
    // Priority 1: full terminal_session (owner/manager activated device)
    if (req.terminalSession) {
      const { mode, shopId } = req.terminalSession;
      return res.json({
        type:       'TERMINAL',
        mode,
        shopId,
        redirectTo: `/${mode.toLowerCase()}/${shopId}`,
      });
    }

    // Priority 2: staff PIN session (chef/cashier logged into a mode)
    // Decode the token just enough to get the shopId for the redirect.
    const kitchenToken = req.cookies.kitchen_token;
    const posToken     = req.cookies.pos_token;

    if (kitchenToken || posToken) {
      try {
        const token   = kitchenToken ?? posToken;
        const mode    = kitchenToken ? 'KITCHEN' : 'POS';
        const decoded = jwt.verify(token, env.JWT_SECRET) as {
          shopId: string;
          type:   string;
        };

        // Verify the token type claim matches what we expect
        const expectedType = kitchenToken ? 'KITCHEN_SESSION' : 'POS';
        if (decoded.type === expectedType && decoded.shopId) {
          return res.json({
            type:       'TERMINAL',
            mode,
            shopId:     decoded.shopId,
            redirectTo: `/${mode.toLowerCase()}/${decoded.shopId}`,
          });
        }
      } catch {
        // Token is invalid/expired — clear it and fall through
        res.clearCookie('kitchen_token');
        res.clearCookie('pos_token');
      }
    }

    // Priority 3: platform session
    const accessToken = req.cookies.access_token;
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, env.JWT_SECRET!) as JwtPayload;
        const user    = await UserRepository.findById(decoded.userId);

        if (user && !user.is_deleted && user.token_version === decoded.tokenVersion) {
          return res.json({
            type: 'PLATFORM',
            user: {
              id:     user.id,
              name:   user.name,
              email:  user.email,
              role:   user.role,
              status: user.status,
            },
          });
        }
      } catch {
        res.clearCookie('access_token');
      }
    }

    return res.json({ type: 'NONE' });

  } catch {
    return res.json({ type: 'NONE' });
  }
});

router.post(
  "/login",
  requireBody(["email", "password"]),
  AuthController.login
);

router.post(
  "/register",
  requireBody(["name", "email", "password"]),
  AuthController.register
);

router.post("/logout", requireAuth, AuthController.logout);

export default router;