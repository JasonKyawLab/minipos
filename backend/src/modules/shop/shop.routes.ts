// =========================================================
// shop.routes.ts
// Path: backend/src/modules/shop/shop.routes.ts
// =========================================================
// INTENTIONAL DESIGN: requireRole("USER") is correct here.
// ADMINs manage the platform — they do not own shops.
// If an ADMIN needs to manage a shop they must create a
// USER account first. This is by design.
//
// FIX: replaced requireBody() with Zod validate() on
// createShop and updateShop so invalid enum values
// (e.g. currency:"DOGECOIN") return a clean 400 instead
// of a raw PostgreSQL enum constraint error.
// =========================================================

import { Router } from "express";
import { ShopController } from "./shop.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  createShopSchema,
  updateShopSchema,
  addStaffSchema,
} from "./shop.schema.js";

const router = Router();

router.use(requireAuth);

// INTENTIONAL: only USER role can own/create shops.
// ADMINs are platform administrators, not shop owners.
router.use(requireRole("USER"));

router.post(
  "/",
  validate(createShopSchema),
  ShopController.createShop
);

router.patch(
  "/:shopId",
  validate(updateShopSchema),
  ShopController.updateShop
);

router.delete(
  "/:shopId",
  ShopController.deleteShop
);

router.post(
  "/:shopId/staff",
  validate(addStaffSchema),
  ShopController.addStaff
);

router.get(
  "/:shopId/staff",
  ShopController.getStaff
);

router.delete(
  "/:shopId/staff/:userId",
  ShopController.removeStaff
);

export default router;