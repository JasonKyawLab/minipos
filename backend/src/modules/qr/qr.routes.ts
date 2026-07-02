//
// Flow D additions:
//   GET  /:token/table/session       — load active table session
//   POST /:token/table/request-bill  — customer requests bill

import { Router }             from "express";
import { QrController }       from "./qr.controller.js";
import { resolveQrToken }     from "./qr.middleware.js";
import { validate }           from "../../middlewares/validate.middleware.js";
import { placeQrOrderSchema } from "./qr.schema.js";
import rateLimit              from "express-rate-limit";
import { env }                from "../../config/validation.js";

const router = Router();

const qrLimiter = env.NODE_ENV === "production"
  ? rateLimit({ windowMs: 60_000, max: 60, message: { message: "TOO_MANY_REQUESTS" }, standardHeaders: true, legacyHeaders: false })
  : (_req: any, _res: any, next: any) => next();

const qrOrderLimiter = env.NODE_ENV === "production"
  ? rateLimit({ windowMs: 60_000, max: 10, message: { message: "TOO_MANY_ORDERS" }, standardHeaders: true, legacyHeaders: false })
  : (_req: any, _res: any, next: any) => next();

// All QR routes resolve the token first
router.use("/:token", resolveQrToken);

// GET  /api/qr/:token/menu
router.get("/:token/menu", qrLimiter, QrController.getMenu);

// GET  /api/qr/:token/table/session
router.get("/:token/table/session", qrLimiter, QrController.getTableSession);

// POST /api/qr/:token/table/request-bill
router.post("/:token/table/request-bill", qrLimiter, QrController.requestBill);

// POST /api/qr/:token/orders
router.post("/:token/orders", qrOrderLimiter, validate(placeQrOrderSchema), QrController.placeOrder);

// GET  /api/qr/:token/orders/:orderId
router.get("/:token/orders/:orderId", qrLimiter, QrController.getOrderStatus);

export default router;