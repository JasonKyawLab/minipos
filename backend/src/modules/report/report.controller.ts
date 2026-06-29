import { Request, Response } from "express";
import { ReportService }     from "./report.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { asyncHandler }      from "../../utils/asyncHandler.js";

export class ReportController {

  // GET /api/shops/:shopId/reports/sales-summary
  static getSalesSummary = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(result);
  });

  // GET /api/shops/:shopId/reports/sales-by-product
  static getSalesByProduct = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(result);
  });

  // GET /api/shops/:shopId/reports/sales-by-order-type
  static getSalesByOrderType = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(result);
  });

  // GET /api/shops/:shopId/reports/inventory
  static getInventorySummary = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(result);
  });

  // GET /api/shops/:shopId/reports/refunds
  static getRefundSummary = asyncHandler(async (req: Request, res: Response) => {
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

    res.json(result);
  });
}