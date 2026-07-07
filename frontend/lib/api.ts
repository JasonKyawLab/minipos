import axios from "axios";
import { getErrorMessage } from "@/utils/errorMessages";

const api = axios.create({
  // FIX: was pointing to 4000 (wrong), backend runs on 3001
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
  withCredentials: true,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error.response?.status;
    const path    = typeof window !== "undefined" ? window.location.pathname : "";

    // Only redirect on 401 for platform routes.
    // Terminal and QR routes handle their own 401s.
    const isTerminalPath =
      path.startsWith("/pos/") || path.startsWith("/kitchen/") || path.startsWith("/qr");

    if (status === 401 && !isTerminalPath && typeof window !== "undefined") {
      if (path !== "/login") {
        // Surface a specific message on the login page for the cases
        // where the session was killed for a known reason (account
        // suspended) rather than just "expired". sessionStorage is
        // fine here — this is a one-time UI message, not sensitive
        // data, and the login page clears it after reading it once.
        const backendMessage = error.response?.data?.message;
        if (backendMessage === "Account suspended") {
          sessionStorage.setItem(
            "login_notice",
            "Your account has been suspended. Please contact support."
          );
        }
        window.location.href = `/login`;
      }
    }

    return Promise.reject(error);
  }
);

export default api;