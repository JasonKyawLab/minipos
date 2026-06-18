// =========================================================
// pos-auth.controller.ts
// Path: backend/src/modules/pos-auth/pos-auth.controller.ts
//
// CHANGES IN THIS VERSION:
//   1. Added notifyKitchenAddon() method.
//
//   WHY:
//     When a cashier adds a second round of items to an
//     already-CONFIRMED DINE_IN table order, the order
//     status is already CONFIRMED. Patching it to CONFIRMED
//     again is rejected by ALLOWED_TRANSITIONS — the state
//     machine does not allow CONFIRMED → CONFIRMED.
//
//     Without this endpoint, add-on items were saved to the
//     DB but the kitchen never received a ticket for them.
//     The chef had no idea new items were ordered.
//
//     This endpoint creates a new kitchen ticket for the
//     add-on round without touching the order status at all.
//     The frontend calls it after adding items to an
//     existing (targetOrderId != null) CONFIRMED order.
//
//   2. Added KitchenService + KitchenRepository imports.
// =========================================================

import { Request, Response }  from "express";
import { PosAuthService }     from "./pos-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { env }                from "../../config/validation.js";
import { pool }               from "../../db/pool.js";

import { QrRepository }      from "../qr/qr.repository.js";
import { OrderService }      from "../order/order.service.js";
import { OrderRepository }   from "../order/order.repository.js";
import { TableRepository }   from "../table/table.repository.js";
import { PaymentService }    from "../payment/payment.service.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";

export class PosAuthController {

  // ── GET /api/shops/:shopId/pos-auth/staff-list ────────────
  // Public — no cookie needed. CHEF excluded at repository level.
  static async getStaffList(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const list   = await PosAuthService.getStaffList(shopId);
      return res.json(list);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/pin ──────────────────
  // Sets the caller's own POS PIN. Requires platform access_token.
  static async setPin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { pin }     = req.body;

      const result = await PosAuthService.setPin({ shopId, requesterId, pin });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/staff/:userId/pin ────
  // Manager/Owner sets the POS PIN for a specific staff member.
  static async setStaffPin(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;
      const { pin }      = req.body;

      const result = await PosAuthService.setStaffPin({
        shopId,
        requesterId,
        targetUserId,
        pin,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── DELETE /api/shops/:shopId/pos-auth/pin ────────────────
  static async removePin(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await PosAuthService.removePin({ shopId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── DELETE /api/shops/:shopId/pos-auth/staff/:userId/pin ──
  static async removeStaffPin(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await PosAuthService.removeStaffPin({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/login ────────────────
  //
  // PIN login — issues pos_token HttpOnly cookie.
  // CHEF is blocked at the service level.
  static async login(req: Request, res: Response) {
    try {
      const shopId   = getParamAsString(req.params.shopId, "shopId");
      const { user_id, pin } = req.body;

      const terminalId = req.cookies.terminal_id as string | undefined;

      const result = await PosAuthService.loginWithPin({
        shopId,
        userId:     user_id,
        pin,
        terminalId,
      });

      res.cookie("pos_token", result.token, {
        httpOnly: true,
        secure:   env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   8 * 60 * 60 * 1000,
      });

      res.clearCookie("access_token");

      return res.json({
        role:      result.role,
        shopType:  result.shopType,
        shopName:  result.shopName,
        userName:  result.userName,
      });
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── POST /api/shops/:shopId/pos-auth/logout ───────────────
  static async logout(_req: Request, res: Response) {
    try {
      res.clearCookie("pos_token");
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/force-logout/:userId ─
  static async forceLogout(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await PosAuthService.forceLogoutStaff({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId ──
  static async resetStaffLock(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const targetUserId = getParamAsString(req.params.userId, "userId");
      const requesterId  = req.user!.id;

      const result = await PosAuthService.resetStaffLock({
        shopId,
        requesterId,
        targetUserId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── PATCH /api/shops/:shopId/pos-auth/settings ────────────
  static async updateSettings(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, "shopId");
      const requesterId  = req.user!.id;
      const { pin_max_attempts } = req.body;

      const result = await PosAuthService.updatePinMaxAttempts({
        shopId,
        requesterId,
        maxAttempts: pin_max_attempts,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── GET /api/shops/:shopId/pos-auth/menu ──────────────────
  //
  // Returns the full active product menu for the POS terminal.
  // Authenticated by requirePosAuth (pos_token cookie).
  // shopId comes from req.posSession — cannot be spoofed.
  static async getMenu(req: Request, res: Response) {
    try {
      const shopId = req.posSession!.shopId;
      const menu   = await QrRepository.getPublicMenu(shopId);
      return res.json(menu);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/orders ───────────────
  //
  // Creates a new POS order.
  // Cashier identity comes from req.posSession (pos_token) —
  // never from the request body.
  static async createPosOrder(req: Request, res: Response) {
    try {
      const shopId    = req.posSession!.shopId;
      const cashierId = req.posSession!.userId;

      const { order_type, table_id, notes } = req.body;

      const order = await OrderService.createOrder({
        shopId,
        requesterId: cashierId,
        cashierId,
        orderType:   order_type,
        tableId:     table_id ?? undefined,
        notes:       notes    ?? undefined,
      });

      return res.status(201).json(order);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/orders/:orderId/items ─
  //
  // Adds a product item (variant + modifiers) to a POS order.
  static async addPosOrderItem(req: Request, res: Response) {
    try {
      const shopId    = req.posSession!.shopId;
      const cashierId = req.posSession!.userId;
      const orderId   = getParamAsString(req.params.orderId, "orderId");

      const { product_item_id, qty, modifiers, item_note } = req.body;

      const item = await OrderService.addOrderItem({
        shopId,
        requesterId:   cashierId,
        orderId,
        productItemId: product_item_id,
        qty,
        modifiers:     modifiers ?? [],
        itemNote:      item_note,
      });

      return res.status(201).json(item);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/orders/:orderId/kitchen-ticket
  //
  // Creates an add-on kitchen ticket for a DINE_IN order that is
  // already CONFIRMED (second round of ordering at the same table).
  //
  // WHY this exists:
  //   When a cashier adds more items to an occupied table, the
  //   order is already CONFIRMED. A PATCH /status CONFIRMED would
  //   be rejected — CONFIRMED → CONFIRMED is not a valid transition
  //   in ALLOWED_TRANSITIONS.
  //
  //   Without this endpoint, add-on items were saved to the DB
  //   but the kitchen never received a ticket for them.
  //
  //   This endpoint creates a new kitchen ticket for the new round
  //   without touching the order status. The frontend calls it
  //   after adding items when targetOrderId already exists (i.e.
  //   the cashier is adding to a table that already has an order).
  static async notifyKitchenAddon(req: Request, res: Response) {
    try {
      const shopId  = req.posSession!.shopId;
      const orderId = getParamAsString(req.params.orderId, "orderId");

      const order = await OrderRepository.findOrderById(orderId, shopId);
      if (!order) return res.status(404).json({ message: "ORDER_NOT_FOUND" });

      if (order.status !== "CONFIRMED") {
        return res.status(400).json({ message: "ORDER_NOT_CONFIRMED" });
      }

      // Resolve table number for the kitchen ticket header
      let tableNumber: string | null = null;
      if (order.table_id) {
        const tableResult = await pool.query(
          `SELECT table_number FROM restaurant_tables WHERE id = $1`,
          [order.table_id]
        );
        tableNumber = tableResult.rows[0]?.table_number ?? null;
      }

      const existingRounds = await KitchenRepository.getTicketRoundCount(orderId);
      const round          = existingRounds + 1;

      const ticket = await KitchenService.createTicket({
        shopId,
        orderId,
        orderNo:      order.order_no,
        orderType:    order.order_type,
        tableNumber,
        customerName: order.customer_name ?? null,
        notes:        order.notes         ?? null,
        round,
        is_addon:     true,
      });

      return res.status(201).json({ ticketId: ticket?.id, round });
    } catch (err) { return handleError(res, err); }
  }

  // ── GET /api/shops/:shopId/pos-auth/tables ────────────────
  //
  // Returns all active tables for this shop.
  // Used by the POS terminal table picker modal.
  static async getPosTableList(req: Request, res: Response) {
    try {
      const shopId = req.posSession!.shopId;
      const tables = await TableRepository.findAllTables(shopId);
      return res.json(tables);
    } catch (err) { return handleError(res, err); }
  }

  // ── GET /api/shops/:shopId/pos-auth/tables/status ─────────
  //
  // Returns all active tables joined with their current live
  // order status. Used by the POS Table Status panel so the
  // cashier can see at a glance which tables are occupied,
  // ordering, or have requested the bill.
  //
  // WHY a separate endpoint from /tables:
  //   /tables returns the table list for the picker modal —
  //   simple rows with no order context.
  //   /tables/status joins orders and is only needed by the
  //   floor-view panel. Keeping them separate means the picker
  //   modal doesn't pay the JOIN cost on every open.
  //
  // "Active" order = any status except PAID / CANCELLED / REFUNDED.
  // A table can only have one active order at a time (enforced
  // at order creation in OrderService).
  static async getTableStatus(req: Request, res: Response) {
    try {
      const shopId = req.posSession!.shopId;
      const result = await PosAuthService.getTableStatus(shopId);
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // ── GET /api/shops/:shopId/pos-auth/me ────────────────────
  //
  // Returns the current cashier's session data.
  //
  // WHY this exists — "burn the ships" security model:
  //   The terminal page navigates from login via window.location.href
  //   (full page reload). All React in-memory state is wiped.
  //   Rather than passing session data through sessionStorage
  //   (readable by any JS on the page — XSS risk), the terminal
  //   page calls this endpoint on mount. The backend reads the
  //   pos_token HttpOnly cookie, validates the JWT, queries the
  //   DB, and returns the session payload.
  static async getMe(req: Request, res: Response) {
    try {
      const session = req.posSession!;

      const { rows } = await pool.query(
        `SELECT s.name      AS shop_name,
                s.shop_type,
                u.name      AS user_name
         FROM   shops      s
         JOIN   shop_users su ON su.shop_id  = s.id
         JOIN   users      u  ON u.id        = su.user_id
         WHERE  s.id          = $1
           AND  su.user_id    = $2
           AND  s.is_deleted  = false
           AND  su.is_active  = true`,
        [session.shopId, session.userId]
      );

      if (rows.length === 0) {
        return res.status(401).json({ message: "SESSION_INVALID" });
      }

      return res.json({
        userId:   session.userId,
        userName: rows[0].user_name,
        shopRole: session.shopRole,
        shopId:   session.shopId,
        shopName: rows[0].shop_name,
        shopType: rows[0].shop_type,
      });
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── GET /api/shops/:shopId/pos-auth/orders/:orderId ───────
  //
  // Returns a single order WITH its active line items.
  // Used both to confirm total_amount after placeOrder(), and
  // to hydrate the two-zone cart when a cashier opens an
  // occupied table (already-ordered section).
  static async getPosOrder(req: Request, res: Response) {
    try {
      const shopId  = req.posSession!.shopId;
      const orderId = getParamAsString(req.params.orderId, "orderId");

      const order = await OrderRepository.findOrderWithItems(orderId, shopId);
      if (!order) {
        return res.status(404).json({ message: "ORDER_NOT_FOUND" });
      }

      return res.json(order);
    } catch (err) { return handleError(res, err); }
  }

  // ── PATCH /api/shops/:shopId/pos-auth/orders/:orderId/status
  static async updatePosOrderStatus(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const cashierId   = req.posSession!.userId;
      const { status }  = req.body;

      if (status !== "CONFIRMED" && status !== "CANCELLED") {
        return res.status(400).json({ message: "INVALID_STATUS_TRANSITION" });
      }

      const updated = await OrderService.updateOrderStatusFromPOS({
        orderId,
        shopId,
        requesterId: cashierId,
        newStatus:   status,
      });

      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  // ── POST /api/shops/:shopId/pos-auth/orders/:orderId/payments
  static async processPosPayment(req: Request, res: Response) {
    try {
      const shopId    = req.posSession!.shopId;
      const cashierId = req.posSession!.userId;
      const orderId   = getParamAsString(req.params.orderId, "orderId");

      const { method, amount, received_amount, note } = req.body;

      const result = await PaymentService.processPayment({
        orderId,
        shopId,
        requesterId:    cashierId,
        cashierId,
        method,
        amount,
        receivedAmount: received_amount,
        note,
      });

      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  }

}