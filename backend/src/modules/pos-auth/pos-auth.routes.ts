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

router.get("/staff-list", PosAuthController.getStaffList);

router.post("/login", validate(pinLoginSchema), PosAuthController.login);

router.post("/logout", PosAuthController.logout);

// ==========================================================
// PROTECTED ROUTES – require platform authentication
// ==========================================================

router.use(requireAuth);
router.use(requireRole("USER"));

router.post("/pin", validate(setPinSchema), PosAuthController.setPin);
router.delete("/pin", PosAuthController.removePin);

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

router.patch(
  "/settings",
  requireShopRole("OWNER", "MANAGER"),
  validate(updatePinMaxAttemptsSchema),
  PosAuthController.updateSettings
);

export default router;