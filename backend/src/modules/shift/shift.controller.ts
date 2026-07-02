import { Request, Response } from "express";
import { ShiftService }      from "./shift.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { asyncHandler }      from "../../utils/asyncHandler.js";

export class ShiftController {

  // GET /api/shops/:shopId/shifts
  // Query params: from, to, userId, mode, limit, offset
  static listShifts = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(result);
  });

  // GET /api/shops/:shopId/shifts/stats
  // Query params: targetUserId, from, to
  static getStats = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const stats = await ShiftService.getStats({
      shopId,
      requesterId,
      targetUserId: req.query.userId as string | undefined,
      from:         req.query.from   as string | undefined,
      to:           req.query.to     as string | undefined,
    });

    res.json(stats);
  });

  // GET /api/shops/:shopId/shifts/staff
  // Manager-only: get list of staff for filter dropdown
  static getStaffList = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const staff = await ShiftService.getStaffList(shopId, requesterId);
    res.json(staff);
  });
}