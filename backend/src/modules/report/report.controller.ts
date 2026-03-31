// =========================================================
// report.controller.ts
// Path: backend/src/modules/report/report.controller.ts
// =========================================================
// HTTP layer only. Reads query params, calls service,
// returns JSON. No business logic here.
// =========================================================

import { Request, Response } from "express";
import { ReportService }     from "./report.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";

export class ReportController {

  // GET /api/shops/:shopId/reports/sales-summary
  static async getSalesSummary(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await ReportService.getSalesSummary(
        {
          shopId,
          from: req.query.from as string | undefined,
          to:   req.query.to   as string | undefined,
        },
        requesterId
      );

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/reports/sales-by-product
  static async getSalesByProduct(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const limit       = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const result = await ReportService.getSalesByProduct(
        {
          shopId,
          from:  req.query.from as string | undefined,
          to:    req.query.to   as string | undefined,
          limit,
        },
        requesterId
      );

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/reports/sales-by-order-type
  static async getSalesByOrderType(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await ReportService.getSalesByOrderType(
        {
          shopId,
          from: req.query.from as string | undefined,
          to:   req.query.to   as string | undefined,
        },
        requesterId
      );

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/reports/inventory
  static async getInventorySummary(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await ReportService.getInventorySummary(
        {
          shopId,
          from: req.query.from as string | undefined,
          to:   req.query.to   as string | undefined,
        },
        requesterId
      );

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/reports/refunds
  static async getRefundSummary(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const result = await ReportService.getRefundSummary(
        {
          shopId,
          from: req.query.from as string | undefined,
          to:   req.query.to   as string | undefined,
        },
        requesterId
      );

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }
}