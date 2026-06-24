// =========================================================
// order.routes.ts
// Path: backend/src/modules/order/order.routes.ts
// =========================================================
// All routes nested under /api/shops/:shopId/orders
// mergeParams: true makes :shopId available in req.params
//
// Auth layers:
//   requireAuth      → valid JWT cookie (platform auth)
//   requireRole      → platform role check (ADMIN or USER)
//   shop membership  → enforced inside OrderService
// =========================================================

import { Router }          from "express";
import { OrderController } from "./order.controller.js";
import { requireAuth }     from "../auth/auth.middleware.js";
import { requireRole }     from "../auth/role.middleware.js";
import { requireShopRole } from "../pos-auth/pos-auth.middleware.js";
import { validate }        from "../../middlewares/validate.middleware.js";
import {
  createOrderSchema,
  addOrderItemSchema,
  updateOrderItemSchema,
  updateOrderStatusSchema,
} from "./order.schema.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));
router.use(requireShopRole("OWNER", "MANAGER"));
// ==========================================================
// ORDERS
// ==========================================================

// POST   /api/shops/:shopId/orders
router.post(
  "/",
  validate(createOrderSchema),
  OrderController.createOrder
);

// GET    /api/shops/:shopId/orders
// Query params: status, order_type, from, to, limit, offset
router.get(
  "/",
  OrderController.getOrders
);

// GET    /api/shops/:shopId/orders/:orderId
router.get(
  "/:orderId",
  OrderController.getOrderById
);

// PATCH  /api/shops/:shopId/orders/:orderId/status
// Used for: CONFIRMED, CANCELLED
// PAID is set automatically by the payment module
router.patch(
  "/:orderId/status",
  validate(updateOrderStatusSchema),
  OrderController.updateOrderStatus
);

// ==========================================================
// ORDER ITEMS
// ==========================================================

// POST   /api/shops/:shopId/orders/:orderId/items
router.post(
  "/:orderId/items",
  validate(addOrderItemSchema),
  OrderController.addOrderItem
);

// PATCH  /api/shops/:shopId/orders/:orderId/items/:itemId
router.patch(
  "/:orderId/items/:itemId",
  validate(updateOrderItemSchema),
  OrderController.updateOrderItem
);

// DELETE /api/shops/:shopId/orders/:orderId/items/:itemId
router.delete(
  "/:orderId/items/:itemId",
  OrderController.removeOrderItem
);

export default router;