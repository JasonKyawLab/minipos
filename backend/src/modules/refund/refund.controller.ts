// =========================================================
// refund.controller.ts
// Path: backend/src/modules/refund/refund.controller.ts
// =========================================================
// HTTP layer only.
// Reads request, calls service, returns response.
// =========================================================

import { Request, Response } from "express";
import { RefundService }     from "./refund.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";

export class RefundController {

  static async processRefund(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;

      const { type, restock, items, reason } = req.body;

      const result = await RefundService.processRefund({
        orderId,
        shopId,
        requesterId,
        type,
        restock,
        items,
        reason,
      });

      return res.status(201).json(result);
    } catch (err: any) { return handleError(res, err); }
  }

static async getRefunds(req: Request, res: Response) {
  try {
    const shopId      = getParamAsString(req.params.shopId,  "shopId");
    const orderId     = getParamAsString(req.params.orderId, "orderId");
    const requesterId = req.user!.id;

    // #5 — parse pagination from query string
    const limit  = req.query.limit  ? parseInt(req.query.limit  as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

    const refunds = await RefundService.getRefundsByOrder({
      orderId,
      shopId,
      requesterId,
      limit,
      offset,
    });

    return res.json(refunds);
  } catch (err: any) { return handleError(res, err); }
}
}

