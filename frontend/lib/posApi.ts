// =========================================================
// lib/posApi.ts — POS API client (tablet Client Components)
//
// Identical to api.ts but injects x-device-key from
// localStorage on every request. This is how the backend
// identifies which physical device is making the request.
//
// device_key is generated once on first tablet boot and
// stored permanently in localStorage. It never changes.
// =========================================================

import axios from "axios";

const posApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request interceptor — inject device key ───────────────
posApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const deviceKey = localStorage.getItem("minipos_device_key");
    if (deviceKey) {
      config.headers["x-device-key"] = deviceKey;
    }
  }
  return config;
});

// ── Response interceptor — 401 → POS login ───────────────
posApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const shopId = window.location.pathname.split("/")[2];
      if (shopId) {
        window.location.href = `/pos/${shopId}/login`;
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Returns the stored device key, or generates a new UUID
 * and stores it if this is the first time running on this device.
 */
export function getOrCreateDeviceKey(): string {
  const stored = localStorage.getItem("minipos_device_key");
  if (stored) return stored;

  const newKey = crypto.randomUUID();
  localStorage.setItem("minipos_device_key", newKey);
  return newKey;
}

export default posApi;