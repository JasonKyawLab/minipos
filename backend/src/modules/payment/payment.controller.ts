import { Request, Response }  from "express";
import { PaymentService }     from "./payment.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";

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