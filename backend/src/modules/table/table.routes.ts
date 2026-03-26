// =========================================================
// table.routes.ts
// Path: backend/src/modules/table/table.routes.ts
// =========================================================
// Nested under /api/shops/:shopId/tables
// One public route for QR scan: /api/tables/qr/:token
// =========================================================

import { Router }          from "express";
import { TableController } from "./table.controller.js";
import { requireAuth }     from "../auth/auth.middleware.js";
import { requireRole }     from "../auth/role.middleware.js";
import { validate }        from "../../middlewares/validate.middleware.js";
import { createTableSchema, updateTableSchema } from "./table.schema.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));

router.post(
  "/",
  validate(createTableSchema),
  TableController.createTable
);

router.get("/", TableController.getTables);

router.get("/:tableId", TableController.getTableById);

router.patch(
  "/:tableId",
  validate(updateTableSchema),
  TableController.updateTable
);

router.patch("/:tableId/rotate-qr", TableController.rotateQrToken);

export default router;