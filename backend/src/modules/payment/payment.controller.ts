// =========================================================
// payment.controller.ts
// Path: backend/src/modules/payment/payment.controller.ts
// =========================================================

import { Request, Response }  from "express";
import { PaymentService }     from "./payment.service.js";
import { getParamAsString }   from "../../utils/converter.js";

export class PaymentController {

  static async processPayment(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;

      const { method, amount, received_amount, note } = req.body;

      const result = await PaymentService.processPayment({
        orderId,
        shopId,
        requesterId,
        cashierId:      requesterId,
        method,
        amount,
        receivedAmount: received_amount,
        note,
      });

      return res.status(201).json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getPayments(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const orderId     = getParamAsString(req.params.orderId, "orderId");
      const requesterId = req.user!.id;

      const payments = await PaymentService.getPaymentsByOrder({
        orderId,
        shopId,
        requesterId,
      });

      return res.json(payments);
    } catch (err: any) { return handleError(res, err); }
  }
}

function handleError(res: Response, err: any) {
  const map: Record<string, number> = {
    FORBIDDEN:           403,
    ORDER_NOT_FOUND:     404,
    ORDER_ALREADY_PAID:  400,
    ORDER_CANCELLED:     400,
    ORDER_HAS_NO_ITEMS:  400,
    AMOUNT_MISMATCH:     400,
    INSUFFICIENT_STOCK:  409,
  };

  const status = map[err.message] ?? 500;
  if (status === 500) console.error("[PaymentController]", err);
  return res.status(status).json({ message: err.message });
}