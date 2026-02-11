import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { UserController } from "./user.controller.js";

const router = Router();

router.use(authMiddleware);

router.patch("/me", UserController.updateMe);
router.delete("/me", UserController.deleteMe);
router.get("/me/shops", UserController.myShops);

export default router;