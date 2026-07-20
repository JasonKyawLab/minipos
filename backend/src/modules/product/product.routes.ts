//
// CHANGES: Added category CRUD routes.
//          All nested under /api/shops/:shopId/products.

import { Router }             from "express";
import { ProductController }  from "./product.controller.js";
import { requireAuth }        from "../auth/auth.middleware.js";
import { requireRole }        from "../auth/role.middleware.js";
import { requireShopRole }    from "../pos-auth/pos-auth.middleware.js";
import { validate }           from "../../middlewares/validate.middleware.js";
import {
  createCategorySchema,
  updateCategorySchema,
  createModelSchema,
  updateModelSchema,
  createItemSchema,
  updateItemSchema,
  setItemActiveSchema,
  recordInventorySchema,
  linkModifierGroupSchema,
} from "./product.schema.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));
router.use(requireShopRole("OWNER", "MANAGER"));
// ==========================================================
// PRODUCT CATEGORIES
// ==========================================================
// GET    /api/shops/:shopId/products/categories
// POST   /api/shops/:shopId/products/categories
// PATCH  /api/shops/:shopId/products/categories/:categoryId
// DELETE /api/shops/:shopId/products/categories/:categoryId

router.get("/categories",                            ProductController.getCategories);
router.post("/categories", validate(createCategorySchema), ProductController.createCategory);
router.patch("/categories/:categoryId", validate(updateCategorySchema), ProductController.updateCategory);
router.delete("/categories/:categoryId",             ProductController.deleteCategory);

// ==========================================================
// PRODUCT MODELS
// ==========================================================

router.post("/models",   validate(createModelSchema), ProductController.createModel);
router.get("/models/check-name",                       ProductController.checkModelName);
router.get("/models",                                  ProductController.getModels);
router.get("/models/:modelId",                         ProductController.getModelById);
router.patch("/models/:modelId", validate(updateModelSchema), ProductController.updateModel);
router.delete("/models/:modelId",                      ProductController.deleteModel);
router.patch("/models/:modelId/restore",               ProductController.restoreModel);

// ==========================================================
// MODIFIER LINKING
// ==========================================================

router.post("/models/:modelId/modifier-groups",
  validate(linkModifierGroupSchema), ProductController.linkModifierGroup);
router.get("/models/:modelId/modifier-groups",         ProductController.getLinkedModifierGroups);
router.delete("/models/:modelId/modifier-groups/:groupId", ProductController.unlinkModifierGroup);

// ==========================================================
// PRODUCT ITEMS
// ==========================================================

router.post("/models/:modelId/items", validate(createItemSchema), ProductController.createItem);
router.get("/models/:modelId/items",                   ProductController.getItems);
router.get("/items/:itemId",                           ProductController.getItemById);
router.patch("/items/:itemId", validate(updateItemSchema), ProductController.updateItem);
router.delete("/items/:itemId",                        ProductController.deleteItem);
router.patch("/items/:itemId/active", validate(setItemActiveSchema), ProductController.setItemActive);

// ==========================================================
// INVENTORY MOVEMENTS
// ==========================================================

router.post("/items/:itemId/inventory", validate(recordInventorySchema), ProductController.recordInventory);
router.get("/items/:itemId/inventory",                 ProductController.getInventory);

export default router;