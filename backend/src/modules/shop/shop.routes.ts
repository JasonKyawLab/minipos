import { Router } from "express";
import { ShopController } from "./shop.controller.js";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { requireBody } from "../../middlewares/validate.middleware.js";

const router = Router();

/**
 * Create a new shop
 * OWNER only
 */
router.post(
  "/",
  authMiddleware,
  requireRole(["OWNER"]),
  ShopController.createShop
);

/**
 * Get shops owned by current user
 * OWNER only
 */
router.get(
  "/my",
  authMiddleware,
  requireRole(["OWNER"]),
  ShopController.getMyShops
);

/**
 * Add staff to shop
 */
router.post(
  "/:shopId/staff",
  authMiddleware,
  ShopController.addStaff
);

/**
 * Get staff of a shop
 */
router.get(
  "/:shopId/staff",
  authMiddleware,
  ShopController.getStaff
);

/** Update shop info
 * OWNER only
 */
router.put(
  "/:shopId",
  authMiddleware,
  requireRole(["OWNER"]),
  requireBody(["name", "currency"]),
  ShopController.updateShop
);

/** Delete a shop
 * OWNER only
 */
router.delete(
  "/:shopId",
  authMiddleware,
  ShopController.deleteShop
);

/** Remove staff from shop
 * OWNER
 * 
 * */
router.delete(
  "/:shopId/staff/:userId",
  authMiddleware,
  ShopController.removeStaff
);

export default router;