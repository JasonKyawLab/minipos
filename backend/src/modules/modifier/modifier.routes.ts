// =========================================================
// modifier.routes.ts
// Path: backend/src/modules/modifier/modifier.routes.ts
// =========================================================
// Nested under /api/shops/:shopId/modifiers
// mergeParams: true makes :shopId available in req.params
// =========================================================

import { Router } from "express";
import { ModifierController } from "./modifier.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  createGroupSchema,
  updateGroupSchema,
  createOptionSchema,
  updateOptionSchema,
} from "./modifier.schema.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));

// ==========================================================
// MODIFIER GROUPS
// ==========================================================

// POST   /api/shops/:shopId/modifiers/groups
router.post(
  "/groups",
  validate(createGroupSchema),
  ModifierController.createGroup
);

// GET    /api/shops/:shopId/modifiers/groups
router.get(
  "/groups",
  ModifierController.getGroups
);

// PATCH  /api/shops/:shopId/modifiers/groups/:groupId
router.patch(
  "/groups/:groupId",
  validate(updateGroupSchema),
  ModifierController.updateGroup
);

// DELETE /api/shops/:shopId/modifiers/groups/:groupId
router.delete(
  "/groups/:groupId",
  ModifierController.deleteGroup
);

// PATCH  /api/shops/:shopId/modifiers/groups/:groupId/restore
router.patch(
  "/groups/:groupId/restore",
  ModifierController.restoreGroup
);

// ==========================================================
// MODIFIER OPTIONS
// ==========================================================

// POST   /api/shops/:shopId/modifiers/groups/:groupId/options
router.post(
  "/groups/:groupId/options",
  validate(createOptionSchema),
  ModifierController.createOption
);

// GET    /api/shops/:shopId/modifiers/groups/:groupId/options
router.get(
  "/groups/:groupId/options",
  ModifierController.getOptions
);

// PATCH  /api/shops/:shopId/modifiers/options/:optionId
router.patch(
  "/options/:optionId",
  validate(updateOptionSchema),
  ModifierController.updateOption
);

// DELETE /api/shops/:shopId/modifiers/options/:optionId
router.delete(
  "/options/:optionId",
  ModifierController.deleteOption
);

export default router;