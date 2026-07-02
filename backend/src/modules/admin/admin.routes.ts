import { Router } from "express";
import { AdminController } from "./admin.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";

const adminRoutes = Router();

adminRoutes.use(requireAuth);
adminRoutes.use(requireRole("ADMIN"));

adminRoutes.get("/users", AdminController.getUsers);
adminRoutes.patch("/users/:userId/promote", AdminController.promote);
adminRoutes.patch("/users/:userId/demote", AdminController.demote);
adminRoutes.delete("/users/:userId", AdminController.deleteUser); 
adminRoutes.patch("/users/:userId/restore", AdminController.restoreUser);

adminRoutes.get("/shops", AdminController.getShops);
adminRoutes.delete("/shops/:shopId", AdminController.deleteShop);
adminRoutes.patch("/shops/:shopId/restore", AdminController.restoreShop);
adminRoutes.patch("/shops/:shopId/suspend", AdminController.suspendShop);
adminRoutes.patch("/shops/:shopId/unsuspend", AdminController.unsuspendShop);
adminRoutes.patch("/users/:userId/suspend", AdminController.suspendUser);
adminRoutes.patch("/users/:userId/reactivate", AdminController.reactivateUser);
adminRoutes.get("/stats", AdminController.getStats);

export default adminRoutes;