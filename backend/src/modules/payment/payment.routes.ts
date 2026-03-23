// =========================================================
// payment.routes.ts
// Path: backend/src/modules/payment/payment.routes.ts
// =========================================================
// Nested under /api/shops/:shopId/orders/:orderId/payments
// mergeParams: true makes :shopId and :orderId available
// =========================================================

import { Router }             from "express";
import { PaymentController }  from "./payment.controller.js";
import { requireAuth }        from "../auth/auth.middleware.js";
import { requireRole }        from "../auth/role.middleware.js";
import { validate }           from "../../middlewares/validate.middleware.js";
import { processPaymentSchema } from "./payment.schema.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));

// POST   /api/shops/:shopId/orders/:orderId/payments
router.post(
  "/",
  validate(processPaymentSchema),
  PaymentController.processPayment
);

// GET    /api/shops/:shopId/orders/:orderId/payments
router.get(
  "/",
  PaymentController.getPayments
);

export default router;