import { Request, Response }  from "express";
import { PosAuthService }     from "./pos-auth.service.js";
import { PosAuthRepository }  from "./pos-auth.repository.js";
import { getParamAsString }   from "../../utils/converter.js";
import { asyncHandler }       from "../../utils/asyncHandler.js";
import { env }                from "../../config/validation.js";

import { QrRepository }      from "../qr/qr.repository.js";
import { OrderService }      from "../order/order.service.js";
import { OrderRepository }   from "../order/order.repository.js";
import { TableRepository }   from "../table/table.repository.js";
import { PaymentService }    from "../payment/payment.service.js";
import { KitchenService }    from "../kitchen/kitchen.service.js";
import { KitchenRepository } from "../kitchen/kitchen.repository.js";

export class PosAuthController {

  // ── GET /api/shops/:shopId/pos-auth/staff-list ────────────
  static getStaffList = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const list   = await PosAuthService.getStaffList(shopId);
    res.json(list);
  });

  // ── POST /api/shops/:shopId/pos-auth/pin ──────────────────
  static setPin = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const { pin }     = req.body;

    const result = await PosAuthService.setPin({ shopId, requesterId, pin });
    res.json(result);
  });

  // ── POST /api/shops/:shopId/pos-auth/staff/:userId/pin ────
  static setStaffPin = asyncHandler(async (req: Request, res: Response) => {
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
    res.json(result);
  });

  // ── DELETE /api/shops/:shopId/pos-auth/pin ────────────────
  static removePin = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const result = await PosAuthService.removePin({ shopId, requesterId });
    res.json(result);
  });

  // ── DELETE /api/shops/:shopId/pos-auth/staff/:userId/pin ──
  static removeStaffPin = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;

    const result = await PosAuthService.removeStaffPin({
      shopId,
      requesterId,
      targetUserId,
    });
    res.json(result);
  });

  // ── POST /api/shops/:shopId/pos-auth/login ────────────────
  static login = asyncHandler(async (req: Request, res: Response) => {
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

    res.json({
      role:      result.role,
      shopType:  result.shopType,
      shopName:  result.shopName,
      userName:  result.userName,
    });
  });

  // ── POST /api/shops/:shopId/pos-auth/logout ───────────────
  static logout = asyncHandler(async (_req: Request, res: Response) => {
    res.clearCookie("pos_token");
    res.json({ success: true });
  });

  // ── POST /api/shops/:shopId/pos-auth/force-logout/:userId ─
  static forceLogout = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;

    const result = await PosAuthService.forceLogoutStaff({
      shopId,
      requesterId,
      targetUserId,
    });
    res.json(result);
  });

  // ── PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId ──
  static resetStaffLock = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const targetUserId = getParamAsString(req.params.userId, "userId");
    const requesterId  = req.user!.id;

    const result = await PosAuthService.resetStaffLock({
      shopId,
      requesterId,
      targetUserId,
    });
    res.json(result);
  });

  // ── PATCH /api/shops/:shopId/pos-auth/settings ────────────
  static updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, "shopId");
    const requesterId  = req.user!.id;
    const { pin_max_attempts } = req.body;

    const result = await PosAuthService.updatePinMaxAttempts({
      shopId,
      requesterId,
      maxAttempts: pin_max_attempts,
    });
    res.json(result);
  });

  // ── GET /api/shops/:shopId/pos-auth/menu ──────────────────
  static getMenu = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.posSession!.shopId;
    const menu   = await QrRepository.getPublicMenu(shopId);
    res.json(menu);
  });

  // ── POST /api/shops/:shopId/pos-auth/orders ───────────────
  static createPosOrder = asyncHandler(async (req: Request, res: Response) => {
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

    res.status(201).json(order);
  });

  // ── POST /api/shops/:shopId/pos-auth/orders/:orderId/items ─
  static addPosOrderItem = asyncHandler(async (req: Request, res: Response) => {
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

    res.status(201).json(item);
  });

  // ── POST /api/shops/:shopId/pos-auth/orders/:orderId/kitchen-ticket
  static notifyKitchenAddon = asyncHandler(async (req: Request, res: Response) => {
    const shopId  = req.posSession!.shopId;
    const orderId = getParamAsString(req.params.orderId, "orderId");

    const order = await OrderRepository.findOrderById(orderId, shopId);
    if (!order) return res.status(404).json({ message: "ORDER_NOT_FOUND" });

    if (order.status !== "CONFIRMED") {
      return res.status(400).json({ message: "ORDER_NOT_CONFIRMED" });
    }

    let tableNumber: string | null = null;
    if (order.table_id) {
      const table = await TableRepository.findTableById(order.table_id, shopId);
      tableNumber = table?.table_number ?? null;
    }

    const existingRounds = await KitchenRepository.getTicketRoundCount(orderId);
    const round = existingRounds + 1;

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

    res.status(201).json({ ticketId: ticket?.id, round });
  });

  // ── GET /api/shops/:shopId/pos-auth/tables ────────────────
  static getPosTableList = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.posSession!.shopId;
    const tables = await TableRepository.findAllTables(shopId);
    res.json(tables);
  });

  // ── GET /api/shops/:shopId/pos-auth/tables/status ─────────
  static getTableStatus = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.posSession!.shopId;
    const result = await PosAuthService.getTableStatus(shopId);
    res.json(result);
  });

  // ── GET /api/shops/:shopId/pos-auth/me ────────────────────
  static getMe = asyncHandler(async (req: Request, res: Response) => {
    const session = req.posSession!;

    const ctx = await PosAuthRepository.getSessionContext(session.shopId, session.userId);

    if (!ctx) {
      return res.status(401).json({ message: "SESSION_INVALID" });
    }

    res.json({
      userId:   session.userId,
      userName: ctx.user_name,
      shopRole: session.shopRole,
      shopId:   session.shopId,
      shopName: ctx.shop_name,
      shopType: ctx.shop_type,
    });
  });

  // ── GET /api/shops/:shopId/pos-auth/orders/:orderId ───────
  static getPosOrder = asyncHandler(async (req: Request, res: Response) => {
    const shopId  = req.posSession!.shopId;
    const orderId = getParamAsString(req.params.orderId, "orderId");

    const order = await OrderRepository.findOrderWithItems(orderId, shopId);
    if (!order) {
      return res.status(404).json({ message: "ORDER_NOT_FOUND" });
    }

    res.json(order);
  });

  // ── PATCH /api/shops/:shopId/pos-auth/orders/:orderId/status
  static updatePosOrderStatus = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(updated);
  });

  // ── POST /api/shops/:shopId/pos-auth/orders/:orderId/payments
  static processPosPayment = asyncHandler(async (req: Request, res: Response) => {
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

    res.status(201).json(result);
  });
}