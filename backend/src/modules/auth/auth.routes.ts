/**
  Map URL → controller
 */
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { requireRole } from "./role.middleware.js";
import { requireBody } from "../../middlewares/validate.middleware.js";

const router = Router();

router.get(
  "/me",
  requireAuth,
  requireRole("ADMIN", "USER"),
  (req, res) => {
    res.json({ message: "JWT work!!!", user: req.user });
  }
);
router.post(
  "/login",
  requireBody(["email", "password"]),
  AuthController.login
);

router.post(
  "/register",
  requireBody(["name", "email", "password"]),
  AuthController.register
);

export default router;