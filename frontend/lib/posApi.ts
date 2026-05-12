// =========================================================
// lib/posApi.ts — POS API client (tablet Client Components)
//
// Used by POS pages to call backend routes that require
// the pos_token HttpOnly cookie (set by the server after
// a successful PIN login).
//
// ── What changed from the old version ────────────────────
// The old version injected an x-device-key header from
// localStorage on every request. This was the "device-bound"
// security model that we are replacing with a pure server-
// side session model (terminal_sessions table + HttpOnly
// cookie). The x-device-key header is no longer needed here:
//
//   • Terminal session creation does not require a device_id.
//   • device_id in terminal_sessions is nullable (optional).
//   • The server trusts only the HttpOnly cookie, not any
//     client-controlled header value.
//
// The device registration flow (shop_devices table) still
// uses x-device-key in the attachDevice middleware, but that
// is a separate concern for device management in the dashboard,
// not for POS session auth.
//
// ── 401 handling ─────────────────────────────────────────
// When pos_token is missing or expired, redirect to the PIN
// login screen for this shop so the cashier can re-auth.
// =========================================================

import axios from "axios";

const posApi = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true, // Always send the pos_token HttpOnly cookie
  timeout:         10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor — 401 → POS login ───────────────
// pos_token is missing or the server rejected it.
// Navigate to PIN selection so the cashier can log back in.
posApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Extract shopId from the current path: /pos/:shopId/terminal
      const parts  = window.location.pathname.split("/");
      const shopId = parts[2]; // ["", "pos", ":shopId", ...]

      if (shopId && !window.location.pathname.endsWith(`/pos/${shopId}`)) {
        // Only redirect if not already on the PIN selection page,
        // to prevent an infinite redirect loop.
        window.location.href = `/pos/${shopId}`;
      }
    }
    return Promise.reject(error);
  }
);

export default posApi;