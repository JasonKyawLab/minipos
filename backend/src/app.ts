import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes.js";
import shopRoutes from "./modules/shop/shop.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import cookieParser from "cookie-parser";
import modifierRoutes from "./modules/modifier/modifier.routes.js";
import productRoutes from "./modules/product/product.routes.js";
import orderRoutes from "./modules/order/order.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";

const app = express();

app.use(cookieParser());
app.use(cors({
  origin: "http://localhost:3000", 
  credentials: true,              
}));
app.use(express.json());

// To Wake up the server on platforms like Heroku that may put it to sleep after inactivity
app.get("/wakeup", (_req, res) => {
  res.json({ status: "OK", message: "MiniPOS is running" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/shops/:shopId/products",  productRoutes);
app.use("/api/shops/:shopId/modifiers", modifierRoutes);
app.use("/api/shops/:shopId/orders",    orderRoutes);
app.use("/api/shops/:shopId/orders/:orderId/payments", paymentRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Unhandled Error]", err);
  res.status(500).json({ message: "Internal server error" });
});

export default app;