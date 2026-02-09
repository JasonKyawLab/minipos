import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes.js";
import shopRoutes from "./modules/shop/shop.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/test", (_req, res) => {
  res.json({ status: "OK", message: "MiniPOS is running" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/shops", shopRoutes);

export default app;