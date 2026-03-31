// =========================================================
// qr.middleware.ts
// Path: backend/src/modules/qr/qr.middleware.ts
// =========================================================
// Resolves a QR token from the route param into a validated
// shop + table context and attaches it to req.qr.
//
// Why a middleware and not inline in each controller?
//   The token resolution logic would be duplicated across
//   getMenu, placeOrder, and getOrderStatus. One middleware
//   keeps it DRY and ensures every QR endpoint gets the
//   same validation for free.
//
// Failure modes:
//   - Token not a valid UUID → 400
//   - Token not found or table inactive → 404
// =========================================================

import { Request, Response, NextFunction } from "express";
import { TableRepository } from "../table/table.repository.js";
import { QrContext } from "./qr.types.js";
import { get } from "node:http";
import { getParamAsString } from "../../utils/converter.js";

// Extend Express Request to carry qr context
declare global {
  namespace Express {
    interface Request {
      qr?: QrContext;
    }
  }
}

export async function resolveQrToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getParamAsString(req.params.token, "token");

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !uuidRegex.test(token)) {
    res.status(400).json({ message: "INVALID_QR_TOKEN" });
    return;
  }

  try {
    const table = await TableRepository.findTableByQrToken(token);

    if (!table || !table.is_active) {
      res.status(404).json({ message: "TABLE_NOT_FOUND" });
      return;
    }

    req.qr = {
      shopId:      table.shop_id,
      tableId:     table.id,
      tableNumber: table.table_number,
    };

    next();
  } catch (err) {
    next(err);
  }
}