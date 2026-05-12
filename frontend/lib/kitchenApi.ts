// =========================================================
// lib/kitchenApi.ts — Kitchen API client
//
// Used by Kitchen Display pages to call backend routes that
// require the kitchen_token HttpOnly cookie (set by the
// server after a successful kitchen PIN login).
//
// ── What changed from the old version ────────────────────
// The old version injected an x-device-key header from
// localStorage on every request, mirroring posApi. This was
// part of the client-side device binding model that we are
// replacing with a pure server-side session model.
//
// The x-device-key header has been removed because:
//   • Kitchen session creation does not require a device_id.
//   • device_id in terminal_sessions is nullable (optional).
//   • The server trusts only the HttpOnly cookie.
//   • Sending a client-controlled header that influences
//     auth decisions is a security antipattern.
//
// ── Why kitchenApi is separate from posApi ───────────────
// posApi is used in POS context → the browser sends pos_token.
// kitchenApi is used in Kitchen context → sends kitchen_token.
// They must never be mixed. Keeping them separate also means
// their 401 redirect targets differ (pos/ vs kitchen/).
//
// ── 401 handling ─────────────────────────────────────────
// When kitchen_token is missing or expired, redirect to the
// kitchen staff selection screen for this shop.
// =========================================================

import axios from "axios";

const kitchenApi = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true, // Always send the kitchen_token HttpOnly cookie
  timeout:         10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor — 401 → kitchen staff selection ──
// kitchen_token is missing or expired.
// Navigate to staff selection so the cook can re-authenticate.
kitchenApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Extract shopId from current path: /kitchen/:shopId/display
      const parts  = window.location.pathname.split("/");
      const shopId = parts[2]; // ["", "kitchen", ":shopId", ...]

      if (shopId && !window.location.pathname.endsWith(`/kitchen/${shopId}`)) {
        // Only redirect if not already on the staff selection page,
        // to prevent an infinite redirect loop.
        window.location.href = `/kitchen/${shopId}`;
      }
    }
    return Promise.reject(error);
  }
);

export default kitchenApi;