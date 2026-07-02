import { Request, Response } from "express";
import { RefundService }     from "./refund.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { asyncHandler }      from "../../utils/asyncHandler.js";

export class RefundController {

  static processRefund = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,  "shopId");
    const orderId     = getParamAsString(req.params.orderId, "orderId");
    const requesterId = req.user!.id;

    const { type, restock, items, reason, idempotency_key } = req.body;

    const result = await RefundService.processRefund({
      orderId,
      shopId,
      requesterId,
      type,
      restock,
      items,
      reason,
      idempotency_key,
    });

    res.status(201).json(result);
  });

  static getRefunds = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,  "shopId");
    const orderId     = getParamAsString(req.params.orderId, "orderId");
    const requesterId = req.user!.id;

    const limit  = req.query.limit  ? parseInt(req.query.limit  as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

    const refunds = await RefundService.getRefundsByOrder({
      orderId,
      shopId,
      requesterId,
      limit,
      offset,
    });

    res.json(refunds);
  });
}