import { Router }                from "express";
import { KitchenAuthController } from "./kitchen-auth.controller.js";
import { requireAuth }           from "../auth/auth.middleware.js";
import { requireRole }           from "../auth/role.middleware.js";
import { validate }              from "../../middlewares/validate.middleware.js";
import { kitchenSetPinSchema, kitchenLoginSchema, exitKitchenSchema } from "./kitchen-auth.schema.js";

const router = Router({ mergeParams: true });

// ── PUBLIC — no platform auth needed ─────────────────────
router.get("/staff-list", KitchenAuthController.getStaffList);
router.post("/login",  validate(kitchenLoginSchema),  KitchenAuthController.login);
router.post("/logout", KitchenAuthController.logout);

// ── PROTECTED — platform access_token required ────────────
router.use(requireAuth);
router.use(requireRole("USER"));

router.post("/pin",          validate(kitchenSetPinSchema), KitchenAuthController.setPin);
router.delete("/pin",        KitchenAuthController.removePin);
router.patch("/reset-lock/:userId", KitchenAuthController.resetStaffLock);
router.post("/exit", requireAuth, validate(exitKitchenSchema), KitchenAuthController.exitKitchenMode);
router.post("/force-logout/:userId", requireAuth,  requireRole("USER"), KitchenAuthController.forceLogout);

export default router;