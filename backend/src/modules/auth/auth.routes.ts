/**
  Map URL → controller
 */
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authMiddleware } from "./auth.middleware.js";
import { requireRole } from "./role.middleware.js";

const router = Router();

router.get(
  "/me",
  authMiddleware,
  requireRole(["OWNER", "STAFF"]),
  (req, res) => {
    res.json({ message: "JWT work!!!", user: req.user });
  }
);
router.post("/login", AuthController.login);
router.post("/register", AuthController.register);

export default router;