// Rate limiters are DISABLED (unlimited) in development and
// test environments so they never interfere with local
// development
//
// In production all limits are enforced as configured.
//
// Tiered strategy:
//   Unauthenticated → strict IP-based limit (protects against bots/brute force)
//   Authenticated   → higher token-based limit (each device gets its own bucket)
//   Runaway guard   → hard ceiling per token (catches buggy POS/kitchen devices)

import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/validation.js";

// ── Pass-through middleware used in non-production envs ──
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

// ── Extract auth token from cookies (used as rate limit key) ──
function getAuthToken(req: Request): string | null {
  return req.cookies.access_token || req.cookies.pos_token || req.cookies.kitchen_token || null;
}

// ── General API limiter ───────────────────────────────────
// Unauthenticated: 100 req/15min keyed by IP.
// Authenticated:   2000 req/15min keyed by token (each device its own bucket).
// Runaway guard:   5000 req/15min hard ceiling per token (catches buggy devices).
export const apiLimiter = makeLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  keyGenerator: (req) => {
    const token = getAuthToken(req);
    return token ?? (req.ip ?? "unknown");
  },
  max: (req) => {
    const token = getAuthToken(req);
    if (!token) return env.RATE_LIMIT_MAX_REQUESTS;        // 100 — unauthenticated
    return env.AUTH_RATE_LIMIT_MAX_REQUESTS;               // 2000 — per device
  },
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Runaway circuit breaker ───────────────────────────────
// Hard ceiling per token regardless of normal limits.
// Catches a buggy POS/kitchen device flooding the backend.
export const runawayLimiter = makeLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  keyGenerator: (req) => {
    const token = getAuthToken(req);
    return token ? `runaway:${token}` : `runaway:${req.ip ?? "unknown"}`;
  },
  max: env.AUTH_RATE_LIMIT_RUNAWAY,                        // 5000 — absolute ceiling
  message: { message: "Request limit exceeded. Please contact support if this continues." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Strict limiter for sensitive endpoints ────────────────
export const strictLimiter = makeLimiter({
  windowMs: env.STRICT_LIMIT_WINDOW_MS,
  max:      env.STRICT_LIMIT_MAX_REQUESTS,
  message:  { message: "Too many requests, slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Login limiter ─────────────────────────────────────────
// Only counts failed attempts (skipSuccessfulRequests: true).
export const loginLimiter = makeLimiter({
  windowMs:               env.LOGIN_LIMIT_WINDOW_MS,
  max:                    env.LOGIN_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true,
  message:                { message: "Too many login attempts, please try again later." },
  standardHeaders:        true,
  legacyHeaders:          false,
});

// ── Refund limiter ────────────────────────────────────────
export const refundLimiter = makeLimiter({
  windowMs: env.REFUND_LIMIT_WINDOW_MS,
  max:      env.REFUND_LIMIT_MAX_REQUESTS,
  message:  { message: "Too many refund attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Chat / AI limiter ─────────────────────────────────────
// Protects Gemini quota — 10 messages per 5 min per IP.
export const chatLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max:      10,
  keyGenerator: (req) => req.ip ?? "unknown",
  message:  { message: "Too many messages, please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});
