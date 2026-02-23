import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes.js";
import shopRoutes from "./modules/shop/shop.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import cookieParser from "cookie-parser";

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

export default app;