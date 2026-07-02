// src/modules/shift/shift.routes.ts
//
// Nested under /api/shops/:shopId/shifts
//
// All routes require platform auth (access_token cookie).
// Shop-role enforcement happens inside ShiftService.

import { Router }           from "express";
import { ShiftController }  from "./shift.controller.js";
import { requireAuth }      from "../auth/auth.middleware.js";
import { requireRole }      from "../auth/role.middleware.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole("USER", "ADMIN"));

// GET /api/shops/:shopId/shifts/staff
// Must be BEFORE /:... routes to avoid being caught as an ID
router.get("/staff", ShiftController.getStaffList);

// GET /api/shops/:shopId/shifts/stats
router.get("/stats", ShiftController.getStats);

// GET /api/shops/:shopId/shifts
router.get("/", ShiftController.listShifts);

export default router;