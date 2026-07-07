//
// NEW: PATCH /:shopId/staff/:userId/role — change staff role

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
  changeStaffRoleSchema,
} from "./shop.schema.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("USER", "ADMIN"));

router.get("/:shopId",   ShopController.getShop);
router.post("/",         validate(createShopSchema), ShopController.createShop);
router.patch("/:shopId", validate(updateShopSchema), ShopController.updateShop);
router.delete("/:shopId",                            ShopController.deleteShop);

router.post("/:shopId/staff",         validate(addStaffSchema), ShopController.addStaff);
router.get("/:shopId/staff",                                     ShopController.getStaff);
router.delete("/:shopId/staff/:userId",                          ShopController.removeStaff);

// NEW: Change a staff member's role within this shop.
// OWNER can change any non-OWNER role.
// MANAGER can change CASHIER ↔ CHEF only (cannot grant MANAGER).
// Side effects: clears stale PINs when role changes mode eligibility.
router.patch(
  "/:shopId/staff/:userId/role",
  validate(changeStaffRoleSchema),
  ShopController.changeStaffRole
);

// Mode password gate
router.post(
  "/:shopId/verify-password",
  validate(verifyPasswordSchema),
  ShopController.verifyPassword
);

// Staff invitation by email
router.post(
  "/:shopId/staff/invite",
  validate(inviteStaffSchema),
  ShopController.inviteStaff
);

export default router;