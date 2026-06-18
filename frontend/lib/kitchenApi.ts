// =========================================================
// lib/kitchenApi.ts — Kitchen API client
//
// Used by Kitchen Display pages to call backend routes that
// require the kitchen_token HttpOnly cookie (set by the
// server after a successful kitchen PIN login).
//
// ── 401 handling ─────────────────────────────────────────
// kitchen_token is missing or expired → redirect to staff
// selection screen for this shop.
//
// ── 403 handling (NEW) ───────────────────────────────────
// Mirrors posApi.ts exactly. Device-verification errors
// (DEVICE_NOT_VERIFIED, DEVICE_NOT_APPROVED) redirect to
// /kitchen/:shopId?error=<CODE> so the staff selection page
// can render a persistent "device not activated" banner
// instead of an invisible or confusing error state.
//
// See posApi.ts for the full rationale on why we centralise
// this in the API client rather than each page component.
// =========================================================

import axios from "axios";

// Device-verification error codes returned by the backend
// requireVerifiedDevice middleware.
const DEVICE_ERRORS = new Set([
  "DEVICE_NOT_VERIFIED",
  "DEVICE_NOT_APPROVED",
  "DEVICE_VERIFICATION_UNAVAILABLE",
]);

const kitchenApi = axios.create({
  baseURL:         "",
  withCredentials: true, // Always send the kitchen_token HttpOnly cookie
  timeout:         10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor ──────────────────────────────────

kitchenApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status = error.response?.status;
    const code   = error.response?.data?.message as string | undefined;

    // Extract shopId from current path: /kitchen/:shopId/display
    const parts  = window.location.pathname.split("/");
    const shopId = parts[2]; // ["", "kitchen", ":shopId", ...]

    if (!shopId) return Promise.reject(error);

    const loginBase = `/kitchen/${shopId}`;

    // ── 403: device verification failure ─────────────────
    if (status === 403 && code && DEVICE_ERRORS.has(code)) {
      const alreadyOnLoginWithError = window.location.pathname === loginBase
        && window.location.search.includes("error=");

      if (!alreadyOnLoginWithError) {
        window.location.href = `${loginBase}?error=${encodeURIComponent(code)}`;
      }
      return Promise.reject(error);
    }

    // ── 401: session expired ──────────────────────────────
    if (status === 401) {
      const alreadyOnLogin = window.location.pathname === loginBase;
      if (!alreadyOnLogin) {
        window.location.href = loginBase;
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default kitchenApi;