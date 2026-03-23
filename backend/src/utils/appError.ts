// =========================================================
// appError.ts
// Path: backend/src/utils/appError.ts
// =========================================================
// Custom error class used throughout the application.
//
// Why not plain Error()?
//   - Error("CODE") forces controllers to maintain string→status
//     maps and do fragile string matching for composite errors.
//   - AppError carries the HTTP status WITH the error, so the
//     controller just reads err.status — no maps, no parsing.
//
// Usage:
//   throw new AppError("ORDER_NOT_FOUND", 404);
//   throw new AppError("ORDER_ITEM_ALREADY_REFUNDED", 400, { itemId });
//
// In controllers:
//   } catch (err) { return handleError(res, err); }
//
// handleError() checks instanceof AppError first, then falls
// back to 500 for unexpected errors.
// =========================================================

export class appError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly meta?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    meta?: Record<string, unknown>
  ) {
    super(code);
    this.name    = "appError";
    this.code    = code;
    this.status  = status;
    this.meta    = meta;

    // Maintains proper stack trace in V8 (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, appError);
    }
  }
}