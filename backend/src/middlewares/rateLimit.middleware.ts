// =========================================================
// rateLimit.middleware.ts (Simple version - no Redis)
// =========================================================

import rateLimit from "express-rate-limit";
import { env } from "../config/validation.js";

// ── General API limiter ───────────────────────────────────
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS, 
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Strict limiter for sensitive endpoints ───────────────
export const strictLimiter = rateLimit({
  windowMs: env.STRICT_LIMIT_WINDOW_MS, 
  max: env.STRICT_LIMIT_MAX_REQUESTS,
  message: { message: "Too many requests, slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Login limiter (strict for failed attempts) ───────────
export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_LIMIT_WINDOW_MS,
  max: env.LOGIN_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true, // Don't count successful logins
  message: { message: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Refund limiter (stricter for financial operations) ───
export const refundLimiter = rateLimit({
  windowMs: env.REFUND_LIMIT_WINDOW_MS,
  max: env.REFUND_LIMIT_MAX_REQUESTS,
  message: { message: "Too many refund attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});