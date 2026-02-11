import { Router } from "express";
import { ShopController } from "./shop.controller.js";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requireBody } from "../../middlewares/validate.middleware.js";

const router = Router();

/**
 * Create a new shop
 * Any authenticated user can create a shop
 */
router.post(
  "/",
  authMiddleware,
  requireBody(["name", "shopType", "currency"]),
  ShopController.createShop
);

/**
 * Update shop info (OWNER only — enforced in service)
 */
router.put(
  "/:shopId",
  authMiddleware,
  requireBody(["name", "currency"]),
  ShopController.updateShop
);

/**
 * Delete shop (OWNER only — enforced in service)
 */
router.delete(
  "/:shopId",
  authMiddleware,
  ShopController.deleteShop
);

/**
 * Add staff (OWNER / MANAGER — enforced in service)
 */
router.post(
  "/:shopId/staff",
  authMiddleware,
  requireBody(["userId", "role"]),
  ShopController.addStaff
);

/**
 * Get shop staff (OWNER / MANAGER — enforced in service)
 */
router.get(
  "/:shopId/staff",
  authMiddleware,
  ShopController.getStaff
);

/**
 * Remove staff (OWNER / MANAGER — enforced in service)
 */
router.delete(
  "/:shopId/staff/:userId",
  authMiddleware,
  ShopController.removeStaff
);

export default router;