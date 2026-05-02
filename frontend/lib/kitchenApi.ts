// lib/kitchenApi.ts
// =========================================================
// Kitchen API client — used exclusively in (kitchen) routes.
//
// Two responsibilities:
//   1. Inject x-device-key header (same as posApi)
//   2. On 401 → redirect to kitchen staff selection,
//      NOT to POS login (the previous broken behaviour).
//
// Why separate from posApi?
//   posApi sends pos_token cookie context.
//   kitchenApi sends kitchen_token cookie context.
//   They must never be confused — mixing them would allow
//   a cashier token to accidentally auth a kitchen request.
// =========================================================

import axios from "axios";

const kitchenApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request interceptor — inject device key ───────────────
// Same device identification pattern as posApi.
// The backend uses this to record which physical tablet
// made the request (staff session tracking).
kitchenApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const deviceKey = localStorage.getItem("minipos_device_key");
    if (deviceKey) {
      config.headers["x-device-key"] = deviceKey;
    }
  }
  return config;
});

// ── Response interceptor — 401 → kitchen staff selection ──
// When the kitchen_token is missing or expired, send the
// user back to the kitchen staff selection screen so they
// can re-authenticate with their PIN.
//
// NEVER redirect to /pos/... — that was the original bug.
// Kitchen and POS are separate auth flows with separate cookies.
kitchenApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Extract shopId from current path: /kitchen/:shopId/display
      const parts = window.location.pathname.split("/");
      // parts = ["", "kitchen", ":shopId", "display"]
      const shopId = parts[2];

      if (shopId && !window.location.pathname.endsWith(`/kitchen/${shopId}`)) {
        // Only redirect if not already on the staff selection page
        // to prevent an infinite redirect loop.
        window.location.href = `/kitchen/${shopId}`;
      }
    }
    return Promise.reject(error);
  }
);

export function getOrCreateDeviceKey(): string {
  const stored = localStorage.getItem("minipos_device_key");
  if (stored) return stored;

  const newKey = crypto.randomUUID();
  localStorage.setItem("minipos_device_key", newKey);
  return newKey;
}

export default kitchenApi;