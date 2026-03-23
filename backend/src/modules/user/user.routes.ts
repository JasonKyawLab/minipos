import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { UserController } from "./user.controller.js";


const router = Router();

router.use(requireAuth);
router.use(requireRole("ADMIN", "USER")); // To allow both admins and regular users to able to update their own info

router.patch("/me", UserController.updateMe);
router.delete("/me", UserController.deleteMe);
router.get("/me/shops", UserController.myShops);
router.post("/me/change-password", UserController.changePassword);

export default router;