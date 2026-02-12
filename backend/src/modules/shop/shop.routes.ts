import { Router } from "express";
import { ShopController } from "./shop.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { requireBody } from "../../middlewares/validate.middleware.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("USER"));
/**
 * Create a new shop
 * Any authenticated user can create a shop
 */
router.post(
  "/",
  requireBody(["name", "shopType", "currency"]),
  ShopController.createShop
);

/**
 * Update shop info (OWNER only — enforced in service)
 */
router.put(
  "/:shopId",
  requireBody(["name", "currency"]),
  ShopController.updateShop
);

/**
 * Delete shop (OWNER only — enforced in service)
 */
router.delete(
  "/:shopId",
  ShopController.deleteShop
);

/**
 * Add staff (OWNER / MANAGER — enforced in service)
 */
router.post(
  "/:shopId/staff",
  requireBody(["userId", "role"]),
  ShopController.addStaff
);

/**
 * Get shop staff (OWNER / MANAGER — enforced in service)
 */
router.get(
  "/:shopId/staff",
  ShopController.getStaff
);

/**
 * Remove staff (OWNER / MANAGER — enforced in service)
 */
router.delete(
  "/:shopId/staff/:userId",
  ShopController.removeStaff
);

export default router;