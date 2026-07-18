import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes        from "./modules/auth/auth.routes.js";
import shopRoutes        from "./modules/shop/shop.routes.js";
import userRoutes        from "./modules/user/user.routes.js";
import adminRoutes       from "./modules/admin/admin.routes.js";
import modifierRoutes    from "./modules/modifier/modifier.routes.js";
import productRoutes     from "./modules/product/product.routes.js";
import orderRoutes       from "./modules/order/order.routes.js";
import paymentRoutes     from "./modules/payment/payment.routes.js";
import refundRoutes      from "./modules/refund/refund.routes.js";
import tableRoutes       from "./modules/table/table.routes.js";
import qrRoutes          from "./modules/qr/qr.routes.js";
import reportRoutes      from "./modules/report/report.routes.js";
import posAuthRoutes     from "./modules/pos-auth/pos-auth.routes.js";
import kitchenRoutes     from "./modules/kitchen/kitchen.routes.js";
import kitchenAuthRoutes from "./modules/kitchen-auth/kitchen-auth.routes.js";
import deviceModeRoutes  from "./modules/device-mode/device-mode.routes.js";
import deviceRoutes      from "./modules/device/device.routes.js";
import shiftRoutes       from "./modules/shift/shift.routes.js";
import terminalRoutes    from "./modules/terminal/terminal.routes.js";
import chatRoutes        from "./modules/chat/chat.routes.js";
import { ShopController } from "./modules/shop/shop.controller.js";
import { requireAuth }    from "./modules/auth/auth.middleware.js";
import { validate }       from "./middlewares/validate.middleware.js";
import { verifyPasswordSchema } from "./modules/shop/shop.schema.js";

import { attachDevice }          from "./middlewares/device.middleware.js";
import { requestIdMiddleware }   from "./middlewares/requestId.middleware.js";
import {
  attachTerminalSession,
  blockTerminalOnPlatformRoutes,
} from "./middlewares/modeGuard.middleware.js";
import {
  apiLimiter,
  runawayLimiter,
  loginLimiter,
  refundLimiter,
} from "./middlewares/rateLimit.middleware.js";

import { TableController } from "./modules/table/table.controller.js";
import { handleError }     from "./utils/handleError.js";
import { pool }            from "./db/pool.js";
import { env }             from "./config/validation.js";
import { getSocketStatus } from "./modules/socket/socket.js";

const app = express();

// Trust exactly one reverse proxy in front of this server.
// Required for req.ip to return the real client IP when deployed
// behind Oracle Cloud LB, Vercel, or Cloudflare.
// Change to 2 if you have two proxy hops (e.g. CDN + load balancer).
app.set('trust proxy', 1);

// ── Core middleware ──────────────────────────────────────
app.use(cookieParser());
app.use(requestIdMiddleware);
const allowedOrigins = env.CLIENT_ORIGIN.split(',').map(o => o.trim());
app.use(cors({
  origin:      (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(attachDevice);
app.use(attachTerminalSession);

// ── Rate limiting ────────────────────────────────────────
app.use("/api/", runawayLimiter); // hard ceiling — catches runaway devices before tiered check
app.use("/api/", apiLimiter);     // tiered: 100/15min (IP) or 2000/15min (per token)
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

app.get("/health/socket", (_req, res) => {
  const status = getSocketStatus();
  res.json({
    status:            status.initialized ? "healthy" : "unhealthy",
    connected_clients: status.connectedClients,
  });
});

// ── Auth routes ──────────────────────────────────────────
// Public: login, register, logout, /me, /session-type.
// No mode block — terminal devices must reach /session-type.
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);

// ── Platform-only routes ─────────────────────────────────
app.use("/api/users",  blockTerminalOnPlatformRoutes, userRoutes);
app.use("/api/admin",  blockTerminalOnPlatformRoutes, adminRoutes);

// ── Shop sub-routes (specific paths BEFORE broad /api/shops) ─
//
// ORDERING RULE: Express matches routes by registration order.
// Every /api/shops/:shopId/specific-path MUST be registered
// before app.use("/api/shops", ...) because the broad prefix
// match would otherwise intercept them first.
//
// Terminal-accessible routes (no blockTerminalOnPlatformRoutes):
app.use("/api/shops/:shopId/pos-auth",      posAuthRoutes);
app.use("/api/shops/:shopId/kitchen-auth",  kitchenAuthRoutes);
app.use("/api/shops/:shopId/kitchen",       kitchenRoutes);

// Platform-only shop sub-routes:
app.use("/api/shops/:shopId/devices/:deviceId/mode", blockTerminalOnPlatformRoutes, deviceModeRoutes);
app.use("/api/shops/:shopId/devices",   blockTerminalOnPlatformRoutes, deviceRoutes);
app.use("/api/shops/:shopId/products",  blockTerminalOnPlatformRoutes, productRoutes);
app.use("/api/shops/:shopId/modifiers", blockTerminalOnPlatformRoutes, modifierRoutes);
app.use("/api/shops/:shopId/orders/:orderId/payments", blockTerminalOnPlatformRoutes, paymentRoutes);
app.use("/api/shops/:shopId/orders/:orderId/refunds",  blockTerminalOnPlatformRoutes, refundRoutes);
app.use("/api/shops/:shopId/orders",    blockTerminalOnPlatformRoutes, orderRoutes);
app.use("/api/shops/:shopId/reports",   blockTerminalOnPlatformRoutes, reportRoutes);
app.use("/api/shops/:shopId/shifts",    blockTerminalOnPlatformRoutes, shiftRoutes);
app.use("/api/shops/:shopId/tables",    blockTerminalOnPlatformRoutes, tableRoutes);

// Terminal session management:
// - /exit is called FROM the terminal (no access_token), so it bypasses the block
// - /activate/manager-pin and /activate/emergency are also terminal-facing
// - Everything else requires a platform session (handled inside terminalRoutes)
app.use(
  "/api/shops/:shopId/terminal",
  (req, _res, next) => {
    if (req.path === "/exit" && req.method === "POST") return next();
    if (req.path === "/activate/manager-pin" && req.method === "POST") return next();
    if (req.path === "/activate/emergency"   && req.method === "POST") return next();
    return blockTerminalOnPlatformRoutes(req, _res, next);
  },
  terminalRoutes
);

// Shop password verification (dashboard use, requires access_token):
app.post(
  "/api/shops/:shopId/verify-password",
  validate(verifyPasswordSchema),
  requireAuth,
  ShopController.verifyPassword
);

// ── Broad shop CRUD — MUST be last among /api/shops routes ──
// This matches ANY /api/shops/... path not caught above.
// blockTerminalOnPlatformRoutes blocks terminal devices here.
app.use("/api/shops", blockTerminalOnPlatformRoutes, shopRoutes);

// ── Public QR routes ──────────────────────────────────────
app.get("/api/tables/qr/:token", TableController.getByQrToken);
app.use("/api/qr", qrRoutes);

// ── Global error handler ─────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  handleError(res, err);
});

export default app;