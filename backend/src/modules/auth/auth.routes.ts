import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { requireRole } from "./role.middleware.js";
import { requireBody } from "../../middlewares/validate.middleware.js";
import { UserRepository } from "../user/user.repository.js";
import { handleError } from "../../utils/handleError.js";
import { appError } from "../../utils/appError.js";

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