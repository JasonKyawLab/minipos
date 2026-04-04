// =========================================================
// Nested under /api/shops/:shopId/pos-auth
// mergeParams: true makes :shopId available in req.params
//
// Auth layers per route:
//
//   staff-list   — no auth (tablet reads this before login)
//   login        — no auth (this IS the auth step)
//   logout       — no auth (just clears cookie)
//   pin (set)    — requireAuth (platform token — staff must
//                  be logged into their account to set a PIN)
//   pin (delete) — requireAuth
//   reset-lock   — requireAuth + platform USER role
//   settings     — requireAuth + platform USER role
// =========================================================

import { Router }            from "express";
import { PosAuthController } from "./pos-auth.controller.js";
import { requireAuth }       from "../auth/auth.middleware.js";
import { requireRole }       from "../auth/role.middleware.js";
import { validate }          from "../../middlewares/validate.middleware.js";
import {
  setPinSchema,
  pinLoginSchema,
  updatePinMaxAttemptsSchema,
} from "./pos-auth.schema.js";

const router = Router({ mergeParams: true });

// ── No-auth routes (tablet public) ───────────────────────

// GET /api/shops/:shopId/pos-auth/staff-list
router.get(
  "/staff-list",
  PosAuthController.getStaffList
);

// POST /api/shops/:shopId/pos-auth/login
router.post(
  "/login",
  validate(pinLoginSchema),
  PosAuthController.login
);

// POST /api/shops/:shopId/pos-auth/logout
router.post(
  "/logout",
  PosAuthController.logout
);

// ── Platform-auth routes (staff logged in) ────────────────

router.use(requireAuth);
router.use(requireRole("USER"));   // ADMINs cannot own shops → cannot have PINs

// POST /api/shops/:shopId/pos-auth/pin
// Staff sets their own PIN
router.post(
  "/pin",
  validate(setPinSchema),
  PosAuthController.setPin
);

// DELETE /api/shops/:shopId/pos-auth/pin
// Staff removes their own PIN
router.delete(
  "/pin",
  PosAuthController.removePin
);

// PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId
// OWNER / MANAGER unlocks a locked-out cashier
router.patch(
  "/reset-lock/:userId",
  PosAuthController.resetStaffLock
);

// PATCH /api/shops/:shopId/pos-auth/settings
// OWNER sets pin_max_attempts (1-10)
router.patch(
  "/settings",
  validate(updatePinMaxAttemptsSchema),
  PosAuthController.updateSettings
);

export default router;