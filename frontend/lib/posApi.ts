// =========================================================
// lib/posApi.ts — POS API client (tablet Client Components)
//
// Used by POS pages to call backend routes that require
// the pos_token HttpOnly cookie (set by the server after
// a successful PIN login).
//
// ── 401 handling ─────────────────────────────────────────
// pos_token is missing or expired → redirect to PIN login.
//
// ── 403 handling (NEW) ───────────────────────────────────
// Two distinct 403 cases need different treatment:
//
//   DEVICE_NOT_VERIFIED  — terminal_id cookie is missing or
//     the geofence check failed. The device has never been
//     activated (or was recently revoked/re-registered but
//     not yet re-activated). We redirect to the POS login
//     screen with ?error=DEVICE_NOT_VERIFIED so the page
//     can show a persistent banner explaining what to do.
//
//   DEVICE_NOT_APPROVED — the device exists in shop_devices
//     but its status is PENDING. Redirect with the specific
//     code so the page shows "waiting for approval" instead
//     of "not verified".
//
// WHY query param and not sessionStorage?
//   Query params survive a full page reload (which the
//   redirect causes). sessionStorage would be fine too, but
//   URL params are simpler, framework-agnostic, and easy to
//   test by pasting the URL.
//
// WHY redirect instead of letting the component handle it?
//   The 403 can fire from ANY posApi call anywhere in the
//   terminal flow — not just the PIN submit. Centralising
//   the redirect here means every page is automatically
//   protected without each one needing its own 403 handler.
// =========================================================

import axios from "axios";

// Device-verification error codes returned by the backend
// requireVerifiedDevice middleware.
const DEVICE_ERRORS = new Set([
  "DEVICE_NOT_VERIFIED",
  "DEVICE_NOT_APPROVED",
  "DEVICE_VERIFICATION_UNAVAILABLE",
]);

const posApi = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true, // Always send the pos_token HttpOnly cookie
  timeout:         10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor ──────────────────────────────────

posApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status  = error.response?.status;
    const code    = error.response?.data?.message as string | undefined;

    // Extract shopId from the current URL: /pos/:shopId/...
    const parts  = window.location.pathname.split("/");
    const shopId = parts[2]; // ["", "pos", ":shopId", ...]

    if (!shopId) return Promise.reject(error);

    const loginBase = `/pos/${shopId}`;

    // ── 403: device verification failure ─────────────────
    // These codes come from requireVerifiedDevice middleware
    // and mean the tablet itself is not trusted, regardless
    // of which cashier is trying to log in.
    if (status === 403 && code && DEVICE_ERRORS.has(code)) {
      const alreadyOnLoginWithError = window.location.pathname === loginBase
        && window.location.search.includes("error=");

      if (!alreadyOnLoginWithError) {
        window.location.href = `${loginBase}?error=${encodeURIComponent(code)}`;
      }
      return Promise.reject(error);
    }

    // ── 401: session expired ──────────────────────────────
    // pos_token is missing or the server rejected it.
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

export default posApi;