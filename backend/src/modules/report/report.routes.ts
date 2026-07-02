// All routes nested under /api/shops/:shopId/reports
// mergeParams: true makes :shopId available in req.params
//
// Auth layers:
//   requireAuth  → valid JWT cookie
//   requireRole  → platform role (ADMIN or USER)
//   shop role    → OWNER / MANAGER enforced in ReportService
//
// All endpoints accept optional query params:
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Defaults to last 30 days when omitted.

import { Router }           from "express";
import { ReportController } from "./report.controller.js";
import { requireAuth }      from "../auth/auth.middleware.js";
import { requireRole }      from "../auth/role.middleware.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER"));

// GET /api/shops/:shopId/reports/sales-summary
// Top-level KPIs: revenue, order count, tax, discounts
router.get("/sales-summary",      ReportController.getSalesSummary);

// GET /api/shops/:shopId/reports/sales-by-product
// Best-sellers ranked by qty sold
// Optional: ?limit=20 (default 20, max 100)
router.get("/sales-by-product",   ReportController.getSalesByProduct);

// GET /api/shops/:shopId/reports/sales-by-order-type
// Revenue breakdown by RETAIL / DINE_IN / QR / DELIVERY etc.
router.get("/sales-by-order-type", ReportController.getSalesByOrderType);

// GET /api/shops/:shopId/reports/inventory
// Current stock snapshot + period movement totals
router.get("/inventory",          ReportController.getInventorySummary);

// GET /api/shops/:shopId/reports/refunds
// Refund rate, total refunded, top refunded items
router.get("/refunds",            ReportController.getRefundSummary);

// GET /api/shops/:shopId/reports/peak-hours
// Order count per hour of day in the shop's local timezone
// Optional: ?timezone=Asia/Bangkok (defaults to UTC)
router.get("/peak-hours",         ReportController.getPeakHours);

export default router;