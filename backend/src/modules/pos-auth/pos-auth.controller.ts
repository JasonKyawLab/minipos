// =========================================================
// pos-auth.controller.ts
// Path: backend/src/modules/pos-auth/pos-auth.controller.ts
// =========================================================

import { Request, Response }  from "express";
import { PosAuthService }     from "./pos-auth.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { env }                from "../../config/validation.js";
import { pool }               from "../../db/pool.js";

import { QrRepository }       from "../qr/qr.repository.js";
import { OrderService }       from "../order/order.service.js";
import { TableRepository }    from "../table/table.repository.js";


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

  // ── GET /api/shops/:shopId/pos-auth/tables ────────────────
  //
  // Returns all active tables for this shop.
  // Used by the POS terminal table picker modal.
  // Bypasses platform auth — uses pos_token + terminal_id only.
  static async getPosTableList(req: Request, res: Response) {
    try {
      const shopId = req.posSession!.shopId;
      const tables = await TableRepository.findAllTables(shopId);
      return res.json(tables);
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
  //
  //   This means:
  //   - Session data never transits through client storage
  //   - XSS cannot steal session payload — it was never stored
  //   - Revoked tokens are caught immediately on next page load
  //   - Backend is always the single source of truth
  //
  // Identity comes entirely from req.posSession (validated by
  // requirePosAuth middleware) — the URL :shopId is not trusted.
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
        // pos_token is valid but the membership no longer exists —
        // the staff member was removed from the shop mid-shift.
        return res.status(401).json({ message: "SESSION_INVALID" });
      }

      return res.json({
        userId:   session.userId,
        userName: rows[0].user_name,
        shopRole: session.shopRole,    // from pos_token JWT — not the URL
        shopId:   session.shopId,
        shopName: rows[0].shop_name,
        shopType: rows[0].shop_type,
      });
    } catch (err) {
      return handleError(res, err);
    }
  }

}