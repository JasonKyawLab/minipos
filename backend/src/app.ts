import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes    from "./modules/auth/auth.routes.js";
import shopRoutes    from "./modules/shop/shop.routes.js";
import userRoutes    from "./modules/user/user.routes.js";
import adminRoutes   from "./modules/admin/admin.routes.js";
import modifierRoutes from "./modules/modifier/modifier.routes.js";
import productRoutes from "./modules/product/product.routes.js";
import orderRoutes   from "./modules/order/order.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import refundRoutes  from "./modules/refund/refund.routes.js";
import tableRoutes   from "./modules/table/table.routes.js";
import qrRoutes from "./modules/qr/qr.routes.js";
import reportRoutes from "./modules/report/report.routes.js";

import { TableController } from "./modules/table/table.controller.js";
import { handleError }     from "./utils/handleError.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.js";
import {
  apiLimiter,
  loginLimiter,
  refundLimiter,
} from "./middlewares/rateLimit.middleware.js";
import { pool } from "./db/pool.js";
import { env }  from "./config/validation.js";
import posAuthRoutes from "./modules/pos-auth/pos-auth.routes.js";

const app = express();

// ── Core middleware ──────────────────────────────────────
app.use(cookieParser());
app.use(requestIdMiddleware);
app.use(cors({
  origin:      env.CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json());

// -─ Rate limiting ───────────────────────────────────────
app.use("/api/", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/shops/:shopId/orders/:orderId/refunds", refundLimiter);

// ── Utility endpoints ────────────────────────────────────
app.get("/wakeup", (_req, res) => {
  res.json({ status: "OK", message: "MiniPOS is running" });
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status:    "healthy",
      timestamp: new Date().toISOString(),
      uptime:    process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: "unhealthy", error: "Database connection failed" });
  }
});

// ── Routes ───────────────────────────────────────────────
app.use("/api/auth",   authRoutes);
app.use("/api/shops",  shopRoutes);
app.use("/api/users",  userRoutes);
app.use("/api/admin",  adminRoutes);

app.use("/api/shops/:shopId/products",  productRoutes);
app.use("/api/shops/:shopId/modifiers", modifierRoutes);
app.use("/api/shops/:shopId/orders",    orderRoutes);
app.use("/api/shops/:shopId/orders/:orderId/payments", paymentRoutes);
app.use("/api/shops/:shopId/orders/:orderId/refunds",  refundRoutes);
app.use("/api/shops/:shopId/reports", reportRoutes);
app.use("/api/shops/:shopId/pos-auth",  posAuthRoutes);

// Public QR table lookup — no auth required
app.get("/api/tables/qr/:token", TableController.getByQrToken);
app.use("/api/shops/:shopId/tables", tableRoutes);
app.use("/api/qr", qrRoutes);

// ── Global error handler ─────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  handleError(res, err);
});

export default app;