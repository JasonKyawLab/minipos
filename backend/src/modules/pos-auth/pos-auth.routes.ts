// =========================================================
// pos-auth.routes.ts
// Path: backend/src/modules/pos-auth/pos-auth.routes.ts
//
// CHANGE: Added /orders/:orderId/kitchen-ticket route.
// See pos-auth.controller.ts notifyKitchenAddon() for why.
// =========================================================

import { Router }             from "express";
import { PosAuthController }  from "./pos-auth.controller.js";
import { requireAuth }        from "../auth/auth.middleware.js";
import { requireRole }        from "../auth/role.middleware.js";
import { requirePosAuth, requireShopRole } from "./pos-auth.middleware.js";
import { validate }           from "../../middlewares/validate.middleware.js";
import { requireVerifiedDevice } from "../../middlewares/device.verification.middleware.js";
import {
  setPinSchema,
  pinLoginSchema,
  updatePinMaxAttemptsSchema,
} from "./pos-auth.schema.js";

const router = Router({ mergeParams: true });

// ==========================================================
// PUBLIC ROUTES — no platform auth required
// ==========================================================

// GET /api/shops/:shopId/pos-auth/staff-list
// Returns the list of staff members for PIN selection.
// Public — device must be verified but no cashier session needed.
router.get(
  "/staff-list",
  requireVerifiedDevice,
  PosAuthController.getStaffList,
);

// POST /api/shops/:shopId/pos-auth/login
// Validates PIN, issues pos_token HttpOnly cookie.
router.post(
  "/login",
  validate(pinLoginSchema),
  requireVerifiedDevice,
  PosAuthController.login,
);

// POST /api/shops/:shopId/pos-auth/logout
// Clears pos_token cookie. No auth required — clearing a
// cookie is always safe to allow.
router.post("/logout", PosAuthController.logout);

// ==========================================================
// POS SESSION ROUTES — require pos_token cookie
//
// These routes are available to any cashier who has completed
// PIN login on an approved terminal. They do NOT require the
// platform access_token — cashiers on tablets don't have one.
//
// requireVerifiedDevice is included so that if a device is
// revoked mid-session, the next request returns 403 and the
// posApi interceptor redirects back to PIN login.
// ==========================================================

// GET /api/shops/:shopId/pos-auth/me
//
// Returns the current cashier's session data from pos_token.
// Called by terminal/page.tsx on mount to hydrate PosContext
// without any client-side data handoff (burn the ships).
//
// MUST be before router.use(requireAuth) — cashiers have no
// platform access_token and would receive 401 otherwise.
router.get(
  "/me",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.getMe,
);

// GET /api/shops/:shopId/pos-auth/menu
// Fetches all active products + modifiers for this shop.
router.get(
  "/menu",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.getMenu,
);

// GET /api/shops/:shopId/pos-auth/tables
//
// Returns active tables for the table picker modal (simple list,
// no order context). MUST be before router.use(requireAuth).
router.get(
  "/tables",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.getPosTableList,
);

// GET /api/shops/:shopId/pos-auth/tables/status
//
// Returns all active tables joined with their live order status.
// Used by the POS Table Status panel (floor view).
//
// IMPORTANT: This route MUST be declared before /orders/:orderId
// and any other parameterised routes, and before requireAuth,
// because the cashier has no platform access_token.
router.get(
  "/tables/status",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.getTableStatus,
);

// POST /api/shops/:shopId/pos-auth/orders
// Creates a new POS order shell (no items).
// Cashier identity set server-side from req.posSession.
router.post(
  "/orders",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.createPosOrder,
);

// POST /api/shops/:shopId/pos-auth/orders/:orderId/items
// Adds a product item to an existing POS order.
router.post(
  "/orders/:orderId/items",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.addPosOrderItem,
);

// POST /api/shops/:shopId/pos-auth/orders/:orderId/kitchen-ticket
//
// Creates an add-on kitchen ticket for an already-CONFIRMED
// DINE_IN order (second round of ordering at the same table).
//
// WHY this is separate from PATCH /status:
//   A PATCH CONFIRMED on an already-CONFIRMED order is rejected
//   by ALLOWED_TRANSITIONS. This endpoint creates the kitchen
//   ticket directly, bypassing the status state machine.
//   Called by the frontend when targetOrderId already exists.
router.post(
  "/orders/:orderId/kitchen-ticket",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.notifyKitchenAddon,
);

// GET /api/shops/:shopId/pos-auth/orders/:orderId
// Fetches a single order with server-calculated totals.
// Called after placeOrder() to get the final total_amount.
router.get(
  "/orders/:orderId",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.getPosOrder,
);

// PATCH /api/shops/:shopId/pos-auth/orders/:orderId/status
// Confirms order → triggers KitchenService.createTicket().
router.patch(
  "/orders/:orderId/status",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.updatePosOrderStatus,
);

// POST /api/shops/:shopId/pos-auth/orders/:orderId/payments
// Processes payment for a POS order → marks order as PAID.
// payment.service.ts now creates the kitchen ticket internally
// for TAKEAWAY/RETAIL orders — no second PATCH /status needed.
router.post(
  "/orders/:orderId/payments",
  requireVerifiedDevice,
  requirePosAuth,
  PosAuthController.processPosPayment,
);

// ==========================================================
// PLATFORM AUTH ROUTES — require platform access_token
//
// These routes are for dashboard/management operations
// performed by authenticated platform users (owners/managers).
// Cashiers on POS tablets cannot reach these routes.
// ==========================================================

router.use(requireAuth);
router.use(requireRole("USER"));

// POST /api/shops/:shopId/pos-auth/pin
// Sets the caller's own POS PIN.
router.post("/pin", validate(setPinSchema), PosAuthController.setPin);

// DELETE /api/shops/:shopId/pos-auth/pin
// Removes the caller's own POS PIN.
router.delete("/pin", PosAuthController.removePin);

// POST /api/shops/:shopId/pos-auth/staff/:userId/pin
// Owner/Manager sets PIN for a specific staff member.
router.post(
  "/staff/:userId/pin",
  requireShopRole("OWNER", "MANAGER"),
  validate(setPinSchema),
  PosAuthController.setStaffPin,
);

// DELETE /api/shops/:shopId/pos-auth/staff/:userId/pin
// Owner/Manager removes PIN for a specific staff member.
router.delete(
  "/staff/:userId/pin",
  requireShopRole("OWNER", "MANAGER"),
  PosAuthController.removeStaffPin,
);

// POST /api/shops/:shopId/pos-auth/force-logout/:userId
// Owner/Manager force-logs out a cashier mid-shift.
router.post(
  "/force-logout/:userId",
  requireShopRole("OWNER", "MANAGER"),
  PosAuthController.forceLogout,
);

// PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId
// Owner/Manager unlocks a locked cashier account.
router.patch(
  "/reset-lock/:userId",
  requireShopRole("OWNER", "MANAGER"),
  PosAuthController.resetStaffLock,
);

// PATCH /api/shops/:shopId/pos-auth/settings
// Owner/Manager updates PIN attempt limits.
router.patch(
  "/settings",
  requireShopRole("OWNER", "MANAGER"),
  validate(updatePinMaxAttemptsSchema),
  PosAuthController.updateSettings,
);

export default router;