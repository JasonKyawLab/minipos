// =========================================================
// src/modules/shift/shift.controller.ts
// =========================================================

import { Request, Response } from "express";
import { ShiftService }      from "./shift.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";

export class ShiftController {

  // GET /api/shops/:shopId/shifts
  // Query params: from, to, userId, mode, limit, offset
  static async listShifts(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const limit  = req.query.limit  ? parseInt(req.query.limit  as string) : 30;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await ShiftService.listShifts({
        shopId,
        requesterId,
        from:   req.query.from   as string | undefined,
        to:     req.query.to     as string | undefined,
        userId: req.query.userId as string | undefined,
        mode:   req.query.mode   as "POS" | "KITCHEN" | undefined,
        limit:  Math.min(limit, 100),   // cap at 100 per page
        offset,
      });

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/shifts/stats
  // Query params: targetUserId, from, to
  static async getStats(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const stats = await ShiftService.getStats({
        shopId,
        requesterId,
        targetUserId: req.query.userId as string | undefined,
        from:         req.query.from   as string | undefined,
        to:           req.query.to     as string | undefined,
      });

      return res.json(stats);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/shifts/staff
  // Manager-only: get list of staff for filter dropdown
  static async getStaffList(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const staff = await ShiftService.getStaffList(shopId, requesterId);
      return res.json(staff);
    } catch (err) { return handleError(res, err); }
  }
}