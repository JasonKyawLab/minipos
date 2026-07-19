import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { PlanService } from "./plan.service.js";
import { PlanRepository } from "./plan.repository.js";

const router = Router();

// GET /api/plan/usage — current user's usage (optionally with ?shopId=)
router.get("/usage", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const shopId = req.query.shopId as string | undefined;
  const usage = await PlanService.getUserUsage(userId, shopId);
  res.json(usage);
}));

// ── Admin only ───────────────────────────────────────────────
// GET /api/plan/limits — all plan limits
router.get("/limits", requireAuth, requireRole("ADMIN"), asyncHandler(async (_req, res) => {
  const limits = await PlanRepository.getAllLimits();
  res.json({ limits });
}));

// PATCH /api/plan/limits/:plan — edit limits for a plan
router.patch("/limits/:plan", requireAuth, requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const plan = req.params.plan as string;
  const updated = await PlanRepository.updateLimits(plan, req.body);
  res.json(updated);
}));

// PATCH /api/plan/users/:userId — upgrade/downgrade user plan
router.patch("/users/:userId", requireAuth, requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!["free", "pro"].includes(plan)) {
    return res.status(400).json({ message: "Invalid plan." });
  }
  await PlanRepository.setUserPlan(req.params.userId as string, plan);
  res.json({ success: true });
}));

export default router;
