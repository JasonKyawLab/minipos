// =========================================================
// rateLimit.middleware.ts
// Path: backend/src/middlewares/rateLimit.middleware.ts
// =========================================================
// Rate limiters are DISABLED (unlimited) in development and
// test environments so they never interfere with local
// development
//
// In production all limits are enforced as configured.
//
// How it works:
//   - In dev/test: a pass-through middleware is returned
//     instead of the real rateLimit() instance.
//   - In production: the real rateLimit() instance is used.
//
// This means you never need to comment out or change any
// rate limit import or usage — the environment decides.
// =========================================================

import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/validation.js";

// ── Pass-through middleware used in non-production envs ──
// Identical signature to a real rate limiter so it can be
// dropped in anywhere without changing the call site.
const unlimited = (
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next();
};

// ── Helper: return pass-through in dev/test, real limiter in prod ──
function makeLimiter(
  options: Parameters<typeof rateLimit>[0]
): RateLimitRequestHandler | typeof unlimited {
  if (env.NODE_ENV !== "production") {
    return unlimited as unknown as RateLimitRequestHandler;
  }
  return rateLimit(options);
}

// ── General API limiter ───────────────────────────────────
// Applied to all /api/* routes as a baseline guard.
export const apiLimiter = makeLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max:      env.RATE_LIMIT_MAX_REQUESTS,
  message:  { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Strict limiter for sensitive endpoints ────────────────
// Use on endpoints that should rarely be hit in rapid
// succession (e.g. password reset, email verification).
export const strictLimiter = makeLimiter({
  windowMs: env.STRICT_LIMIT_WINDOW_MS,
  max:      env.STRICT_LIMIT_MAX_REQUESTS,
  message:  { message: "Too many requests, slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Login limiter ─────────────────────────────────────────
// Only counts failed attempts (skipSuccessfulRequests: true)
// so legitimate users are never locked out by normal usage.
export const loginLimiter = makeLimiter({
  windowMs:              env.LOGIN_LIMIT_WINDOW_MS,
  max:                   env.LOGIN_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true,
  message:               { message: "Too many login attempts, please try again later." },
  standardHeaders:       true,
  legacyHeaders:         false,
});

// ── Refund limiter ────────────────────────────────────────
// Stricter window for financial operations to limit damage
// from a compromised account or a runaway client bug.
export const refundLimiter = makeLimiter({
  windowMs: env.REFUND_LIMIT_WINDOW_MS,
  max:      env.REFUND_LIMIT_MAX_REQUESTS,
  message:  { message: "Too many refund attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});