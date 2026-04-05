// =========================================================
// pos-auth.routes.ts
// Path: backend/src/modules/pos-auth/pos-auth.routes.ts
// =========================================================
// Route order matters. Public routes MUST be defined before
// requireAuth is applied, otherwise the middleware intercepts
// them and returns 401 before the handler is ever reached.
//
// Public (no cookie needed — tablet calls these before login):
//   GET  /staff-list    → populate PIN grid
//   POST /login         → PIN-based authentication
//   POST /logout        → clear pos_token cookie
//
// Protected (require platform access_token cookie):
//   POST   /pin         → staff sets their own PIN
//   DELETE /pin         → staff removes their own PIN
//   PATCH  /reset-lock/:userId → owner/manager unlocks cashier
//   PATCH  /settings    → owner configures pin_max_attempts
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

// ── PUBLIC ROUTES — no requireAuth above these ────────────
// These must come BEFORE any router.use(requireAuth) call.
// Express middleware is applied in registration order.

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

// ── PROTECTED ROUTES — requireAuth applies from here down ─
// router.use() at this point only affects routes registered
// after it in this file.

router.use(requireAuth);
router.use(requireRole("USER")); // ADMINs are platform-only, not shop members

// POST /api/shops/:shopId/pos-auth/pin
router.post(
  "/pin",
  validate(setPinSchema),
  PosAuthController.setPin
);

// DELETE /api/shops/:shopId/pos-auth/pin
router.delete(
  "/pin",
  PosAuthController.removePin
);

// PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId
router.patch(
  "/reset-lock/:userId",
  PosAuthController.resetStaffLock
);

// PATCH /api/shops/:shopId/pos-auth/settings
router.patch(
  "/settings",
  validate(updatePinMaxAttemptsSchema),
  PosAuthController.updateSettings
);

export default router;