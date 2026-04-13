// =========================================================
// handleError.ts
// Path: backend/src/utils/handleError.ts
// =========================================================
// Shared controller error handler.
// All controllers import this instead of defining their own.
//
// Flow:
//   1. appError → use err.status + err.code directly
//   2. Plain Error → status 500, log it
// =========================================================

import { Response } from "express";
import { appError } from "./appError.js";

const KNOWN_ERRORS: Record<string, number> = {
  BARCODE_ALREADY_EXISTS:     409,
  SKU_ALREADY_EXISTS:         409,
  DUPLICATE_ENTRY:            409,
  INSUFFICIENT_STOCK:         409,
  ITEM_NOT_FOUND:             404,
  ORDER_ITEM_NOT_FOUND:       404,
  KITCHEN_TICKET_NOT_FOUND:   404,
  ORDER_ITEM_ALREADY_REFUNDED: 400,
  REFUND_QTY_EXCEEDS_ORIGINAL: 400,
};

export function handleError(res: Response, err: unknown): void {
  if (err instanceof appError) {
    res.status(err.status).json({ message: err.code });
    return;
  }

  if (err instanceof Error && KNOWN_ERRORS[err.message]) {
    res.status(KNOWN_ERRORS[err.message]).json({ message: err.message });
    return;
  }

  console.error("[UnhandledError]", err);
  res.status(500).json({ message: "Internal server error" });
}