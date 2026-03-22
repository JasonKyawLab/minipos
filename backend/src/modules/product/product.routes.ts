// =========================================================
// product.routes.ts
// Path: backend/src/modules/product/product.routes.ts
// =========================================================
// All routes are nested under /api/shops/:shopId/products
// so shopId is always available in req.params.
//
// Route-level auth:  requireAuth  (valid JWT cookie)
//                    requireRole  (platform role = ADMIN|USER)
//
// Shop-level auth:   enforced inside ProductService
//                    (OWNER / MANAGER / CASHIER check)
// =========================================================

import { Router } from "express";
import { ProductController } from "./product.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  createModelSchema,
  updateModelSchema,
  createItemSchema,
  updateItemSchema,
  setItemActiveSchema,
  recordInventorySchema,
  linkModifierGroupSchema,
} from "./product.schema.js";

const router = Router({ mergeParams: true });
// mergeParams: true  ← makes :shopId from the parent router
//                       available inside these routes

// Apply auth to all product routes
router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));

// ==========================================================
// PRODUCT MODELS
// ==========================================================

// POST   /api/shops/:shopId/products/models
router.post(
  "/models",
  validate(createModelSchema),
  ProductController.createModel
);

// GET    /api/shops/:shopId/products/models
router.get(
  "/models",
  ProductController.getModels
);

// GET    /api/shops/:shopId/products/models/:modelId
router.get(
  "/models/:modelId",
  ProductController.getModelById
);

// PATCH  /api/shops/:shopId/products/models/:modelId
router.patch(
  "/models/:modelId",
  validate(updateModelSchema),
  ProductController.updateModel
);

// DELETE /api/shops/:shopId/products/models/:modelId
router.delete(
  "/models/:modelId",
  ProductController.deleteModel
);

// PATCH  /api/shops/:shopId/products/models/:modelId/restore
router.patch(
  "/models/:modelId/restore",
  ProductController.restoreModel
);

// ==========================================================
// MODIFIER LINKING (product model ↔ modifier group)
// ==========================================================

// POST   /api/shops/:shopId/products/models/:modelId/modifier-groups
router.post(
  "/models/:modelId/modifier-groups",
  validate(linkModifierGroupSchema),
  ProductController.linkModifierGroup
);

// GET    /api/shops/:shopId/products/models/:modelId/modifier-groups
router.get(
  "/models/:modelId/modifier-groups",
  ProductController.getLinkedModifierGroups
);

// DELETE /api/shops/:shopId/products/models/:modelId/modifier-groups/:groupId
router.delete(
  "/models/:modelId/modifier-groups/:groupId",
  ProductController.unlinkModifierGroup
);

// ==========================================================
// PRODUCT ITEMS
// ==========================================================

// POST   /api/shops/:shopId/products/models/:modelId/items
router.post(
  "/models/:modelId/items",
  validate(createItemSchema),
  ProductController.createItem
);

// GET    /api/shops/:shopId/products/models/:modelId/items
router.get(
  "/models/:modelId/items",
  ProductController.getItems
);

// GET    /api/shops/:shopId/products/items/:itemId
router.get(
  "/items/:itemId",
  ProductController.getItemById
);

// PATCH  /api/shops/:shopId/products/items/:itemId
router.patch(
  "/items/:itemId",
  validate(updateItemSchema),
  ProductController.updateItem
);

// DELETE /api/shops/:shopId/products/items/:itemId
router.delete(
  "/items/:itemId",
  ProductController.deleteItem
);

// PATCH  /api/shops/:shopId/products/items/:itemId/active
router.patch(
  "/items/:itemId/active",
  validate(setItemActiveSchema),
  ProductController.setItemActive
);

// ==========================================================
// INVENTORY MOVEMENTS
// ==========================================================

// POST   /api/shops/:shopId/products/items/:itemId/inventory
router.post(
  "/items/:itemId/inventory",
  validate(recordInventorySchema),
  ProductController.recordInventory
);

// GET    /api/shops/:shopId/products/items/:itemId/inventory
router.get(
  "/items/:itemId/inventory",
  ProductController.getInventory
);

export default router;