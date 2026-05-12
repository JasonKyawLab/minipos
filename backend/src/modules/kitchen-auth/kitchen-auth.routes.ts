// =========================================================
// kitchen-auth.routes.ts
// Path: backend/src/modules/kitchen-auth/kitchen-auth.routes.ts
//
// NEW routes:
//   POST   /staff/:userId/pin  — manager sets staff kitchen PIN
//   DELETE /staff/:userId/pin  — manager removes staff kitchen PIN
// =========================================================

import { Router }                from "express";
import { KitchenAuthController } from "./kitchen-auth.controller.js";
import { requireAuth }           from "../auth/auth.middleware.js";
import { requireRole }           from "../auth/role.middleware.js";
import { requireShopRole }       from "../pos-auth/pos-auth.middleware.js";
import { validate }              from "../../middlewares/validate.middleware.js";
import {
  kitchenSetPinSchema,
  kitchenLoginSchema,
  exitKitchenSchema,
} from "./kitchen-auth.schema.js";

const router = Router({ mergeParams: true });

// ==========================================================
// PUBLIC ROUTES – no authentication required
// ==========================================================

// Returns kitchen-eligible staff (OWNER, MANAGER, CHEF).
// CASHIER is excluded at the repository query level.
router.get("/staff-list", KitchenAuthController.getStaffList);

router.post("/login", validate(kitchenLoginSchema), KitchenAuthController.login);

router.post("/logout", KitchenAuthController.logout);

// ==========================================================
// PROTECTED ROUTES – require platform authentication
// ==========================================================

router.use(requireAuth);
router.use(requireRole("USER"));

// ── Own PIN management ─────────────────────────────────────
// Staff sets/removes their own kitchen PIN.
router.post("/pin",   validate(kitchenSetPinSchema), KitchenAuthController.setPin);
router.delete("/pin", KitchenAuthController.removePin);

// ── Staff kitchen PIN management (manager sets for others) ──
// OWNER or MANAGER sets/removes kitchen PIN for a specific staff member.
// Used during onboarding — manager enters the PIN on behalf of the Chef.
router.post(
  "/staff/:userId/pin",
  requireShopRole("OWNER", "MANAGER"),
  validate(kitchenSetPinSchema),
  KitchenAuthController.setStaffKitchenPin
);

router.delete(
  "/staff/:userId/pin",
  requireShopRole("OWNER", "MANAGER"),
  KitchenAuthController.removeStaffKitchenPin
);

// ── Lock reset & force logout ──────────────────────────────
router.patch(
  "/reset-lock/:userId",
  requireShopRole("OWNER", "MANAGER"),
  KitchenAuthController.resetStaffLock
);

router.post(
  "/force-logout/:userId",
  requireShopRole("OWNER", "MANAGER"),
  KitchenAuthController.forceLogout
);

// ── Kitchen mode exit ──────────────────────────────────────
router.post(
  "/exit",
  validate(exitKitchenSchema),
  KitchenAuthController.exitKitchenMode
);

export default router;