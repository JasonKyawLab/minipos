import { Request, Response }  from "express";
import { PaymentService }     from "./payment.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { asyncHandler }       from "../../utils/asyncHandler.js";

export class PaymentController {

  static processPayment = asyncHandler(async (req: Request, res: Response) => {
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

    res.status(201).json(result);
  });

  static getPayments = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,  "shopId");
    const orderId     = getParamAsString(req.params.orderId, "orderId");
    const requesterId = req.user!.id;

    const payments = await PaymentService.getPaymentsByOrder({
      orderId,
      shopId,
      requesterId,
    });

    res.json(payments);
  });
}