// =========================================================
// qr.routes.ts
// Path: backend/src/modules/qr/qr.routes.ts
// =========================================================
// All routes are PUBLIC (no requireAuth).
// Security is provided by:
//   1. resolveQrToken middleware — validates the UUID token
//      and confirms the table is active.
//   2. A dedicated rate limiter — prevents menu scraping and
//      order spam from a single IP.
//
// Route overview:
//   GET  /api/qr/:token/menu              → browse the menu
//   POST /api/qr/:token/orders            → place an order
//   GET  /api/qr/:token/orders/:orderId   → track your order
// =========================================================

import { Router }         from "express";
import { QrController }   from "./qr.controller.js";
import { resolveQrToken } from "./qr.middleware.js";
import { validate }       from "../../middlewares/validate.middleware.js";
import { placeQrOrderSchema } from "./qr.schema.js";
import rateLimit from "express-rate-limit";
import { env } from "../../config/validation.js";

const router = Router();

// ── QR-specific rate limiter ─────────────────────────────
// More permissive than the login limiter (customers browse
// menus repeatedly) but stricter than the general API limiter.
// Disabled in dev/test just like the other limiters.
const qrLimiter = env.NODE_ENV === "production"
  ? rateLimit({
      windowMs: 60 * 1000,         // 1 minute
      max:      60,                // 60 requests per minute per IP
      message:  { message: "TOO_MANY_REQUESTS" },
      standardHeaders: true,
      legacyHeaders:   false,
    })
  : (_req: any, _res: any, next: any) => next();

const qrOrderLimiter = env.NODE_ENV === "production"
  ? rateLimit({
      windowMs: 60 * 1000,         // 1 minute
      max:      5,                 // 5 orders per minute per IP (prevent spam)
      message:  { message: "TOO_MANY_ORDERS" },
      standardHeaders: true,
      legacyHeaders:   false,
    })
  : (_req: any, _res: any, next: any) => next();

// All QR routes resolve the token first
router.use("/:token/menu",           resolveQrToken);
router.use("/:token/orders",         resolveQrToken);

// GET /api/qr/:token/menu
router.get(
  "/:token/menu",
  qrLimiter,
  QrController.getMenu
);

// POST /api/qr/:token/orders
router.post(
  "/:token/orders",
  qrOrderLimiter,
  validate(placeQrOrderSchema),
  QrController.placeOrder
);

// GET /api/qr/:token/orders/:orderId
router.get(
  "/:token/orders/:orderId",
  qrLimiter,
  QrController.getOrderStatus
);

export default router;