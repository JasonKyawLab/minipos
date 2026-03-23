// =========================================================
// handleError.ts
// Path: backend/src/utils/handleError.ts
// =========================================================
// Shared controller error handler.
// All controllers import this instead of defining their own.
//
// Flow:
//   1. AppError → use err.status + err.code directly
//   2. Plain Error → status 500, log it
// =========================================================

import { Response } from "express";
import { appError } from "./appError.js";

export function handleError(res: Response, err: unknown): void {
  if (err instanceof appError) {
    res.status(err.status).json({ message: err.code });
    return;
  }

  // Unexpected error — log and return generic 500
  console.error("[UnhandledError]", err);
  res.status(500).json({ message: "Internal server error" });
}