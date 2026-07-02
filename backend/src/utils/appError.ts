import { ErrorCode } from "../constants/errorCodes.constants.js";

export class appError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly meta?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    status: number,
    meta?: Record<string, unknown>
  ) {
    super(code as string);
    this.name    = "appError";
    this.code    = code;
    this.status  = status;
    this.meta    = meta;

    Object.setPrototypeOf(this, appError.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, appError);
    }
  }
}