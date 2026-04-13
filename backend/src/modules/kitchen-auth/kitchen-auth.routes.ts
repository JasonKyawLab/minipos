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

router.get("/staff-list", KitchenAuthController.getStaffList);

router.post("/login", validate(kitchenLoginSchema), KitchenAuthController.login);

router.post("/logout", KitchenAuthController.logout);

// ==========================================================
// PROTECTED ROUTES – require platform authentication
// ==========================================================

router.use(requireAuth);
router.use(requireRole("USER"));

router.post("/pin", validate(kitchenSetPinSchema), KitchenAuthController.setPin);
router.delete("/pin", KitchenAuthController.removePin);

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

router.post(
  "/exit",
  validate(exitKitchenSchema),
  KitchenAuthController.exitKitchenMode
);

export default router;