// =========================================================
// lib/api.ts — Platform API client
// Path: frontend/lib/api.ts
//
// Two important rules:
//   1. withCredentials: true  → sends the httpOnly cookie
//      (access_token) on every request. Without this, the
//      browser blocks the cookie and all auth fails.
//
//   2. baseURL must be the backend URL the BROWSER can reach.
//      In development: http://localhost:3001
//      In production:  your deployed backend URL
//      Set via NEXT_PUBLIC_API_URL in .env.local
//
// Never use this in Server Components — use native fetch()
// with the cookie header passed manually instead.
// =========================================================

import axios from "axios";

const api = axios.create({
  // NEXT_PUBLIC_ prefix makes this variable available in browser code.
  // Falls back to localhost for local development.
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Response interceptor ──────────────────────────────────
// Catches 401 globally and redirects to /login.
// Skips the redirect for the /auth/me call itself (that's
// how we check if the user is logged in — a 401 there just
// means "not logged in", not "session expired").
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url ?? "";
    const isAuthCheck = url.includes("/auth/me");

    if (error.response?.status === 401 && !isAuthCheck) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }

    return Promise.reject(error);
  }
);

export default api;