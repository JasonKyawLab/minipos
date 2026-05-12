// =========================================================
// pos-auth.routes.ts
// Path: backend/src/modules/pos-auth/pos-auth.routes.ts
//
// NEW routes:
//   POST   /staff/:userId/pin  — manager sets staff POS PIN
//   DELETE /staff/:userId/pin  — manager removes staff POS PIN
// =========================================================

import { Router }            from "express";
import { PosAuthController } from "./pos-auth.controller.js";
import { requireAuth }       from "../auth/auth.middleware.js";
import { requireRole }       from "../auth/role.middleware.js";
import { requireShopRole }   from "./pos-auth.middleware.js";
import { validate }          from "../../middlewares/validate.middleware.js";
import {
  setPinSchema,
  pinLoginSchema,
  updatePinMaxAttemptsSchema,
} from "./pos-auth.schema.js";

const router = Router({ mergeParams: true });

// ==========================================================
// PUBLIC ROUTES – no authentication required
// ==========================================================

// Returns only POS-eligible staff (OWNER, MANAGER, CASHIER).
// CHEF is filtered out — they don't appear on the POS screen.
router.get("/staff-list", PosAuthController.getStaffList);

router.post("/login", validate(pinLoginSchema), PosAuthController.login);

router.post("/logout", PosAuthController.logout);

// ==========================================================
// PROTECTED ROUTES – require platform authentication
// ==========================================================

router.use(requireAuth);
router.use(requireRole("USER"));

// ── Own PIN management ─────────────────────────────────────
// Staff sets/removes their own POS PIN.
router.post("/pin",   validate(setPinSchema), PosAuthController.setPin);
router.delete("/pin", PosAuthController.removePin);

// ── Staff PIN management (manager sets for others) ─────────
// OWNER or MANAGER sets/removes PIN for a specific staff member.
// This is the correct flow — the manager enters the new PIN
// in the dashboard on behalf of the staff member.
router.post(
  "/staff/:userId/pin",
  requireShopRole("OWNER", "MANAGER"),
  validate(setPinSchema),
  PosAuthController.setStaffPin
);

router.delete(
  "/staff/:userId/pin",
  requireShopRole("OWNER", "MANAGER"),
  PosAuthController.removeStaffPin
);

// ── Force logout & lock reset ──────────────────────────────
router.post(
  "/force-logout/:userId",
  requireShopRole("OWNER", "MANAGER"),
  PosAuthController.forceLogout
);

router.patch(
  "/reset-lock/:userId",
  requireShopRole("OWNER", "MANAGER"),
  PosAuthController.resetStaffLock
);

// ── Shop POS settings ──────────────────────────────────────
router.patch(
  "/settings",
  requireShopRole("OWNER", "MANAGER"),
  validate(updatePinMaxAttemptsSchema),
  PosAuthController.updateSettings
);

export default router;