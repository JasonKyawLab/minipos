// =========================================================
// src/modules/shop/shop.routes.ts
// =========================================================
// Added: POST /:shopId/verify-password
//   Verifies the requesting user's platform password.
//   Used by the frontend mode gate before entering POS/Kitchen.
//   Only OWNER or MANAGER of the shop can call this.
//   Returns { valid: true } or 401 — never leaks password data.
// =========================================================

import { Router }          from "express";
import { ShopController }  from "./shop.controller.js";
import { requireAuth }     from "../auth/auth.middleware.js";
import { requireRole }     from "../auth/role.middleware.js";
import { validate }        from "../../middlewares/validate.middleware.js";
import {
  createShopSchema,
  updateShopSchema,
  addStaffSchema,
  verifyPasswordSchema,
  inviteStaffSchema,
} from "./shop.schema.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("USER", "ADMINß"));

router.post("/",         validate(createShopSchema), ShopController.createShop);
router.patch("/:shopId", validate(updateShopSchema), ShopController.updateShop);
router.delete("/:shopId",                            ShopController.deleteShop);

router.post("/:shopId/staff",         validate(addStaffSchema), ShopController.addStaff);
router.get("/:shopId/staff",                                     ShopController.getStaff);
router.delete("/:shopId/staff/:userId",                          ShopController.removeStaff);

// ── Mode password gate ────────────────────────────────────
// Called by the frontend before showing the POS/Kitchen PIN screen.
// Verifies the user's own platform password.
// OWNER or MANAGER of this shop can call this.
router.post(
  "/:shopId/verify-password",
  validate(verifyPasswordSchema),
  ShopController.verifyPassword
);

router.post(
  "/:shopId/staff/invite",
  validate(inviteStaffSchema),
  ShopController.inviteStaff
);

export default router;