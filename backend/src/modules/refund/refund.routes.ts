// Nested under /api/shops/:shopId/orders/:orderId/refunds
// mergeParams: true makes :shopId and :orderId available

import { Router }           from "express";
import { RefundController } from "./refund.controller.js";
import { requireAuth }      from "../auth/auth.middleware.js";
import { requireRole }      from "../auth/role.middleware.js";
import { validate }         from "../../middlewares/validate.middleware.js";
import { processRefundSchema } from "./refund.schema.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));

// POST /api/shops/:shopId/orders/:orderId/refunds
// OWNER / MANAGER only — enforced inside RefundService
router.post(
  "/",
  validate(processRefundSchema),
  RefundController.processRefund
);

// GET /api/shops/:shopId/orders/:orderId/refunds
// OWNER / MANAGER only — enforced inside RefundService
router.get(
  "/",
  RefundController.getRefunds
);

export default router;