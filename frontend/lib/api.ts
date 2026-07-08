import axios from "axios";
import toast from "react-hot-toast";
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

    if (status === 429) {
      const retryAfter = error.response?.headers?.["retry-after"];
      let message = "Too many requests — please wait before trying again.";
      if (retryAfter) {
        const secs = parseInt(retryAfter, 10);
        const mins = Math.floor(secs / 60);
        const rem  = secs % 60;
        message = mins > 0
          ? `Too many requests — try again in ${mins}m ${rem}s`
          : `Too many requests — try again in ${rem}s`;
      }
      toast.error(message, { duration: 6000 });
      return Promise.reject(error);
    }

    // Only redirect on 401 for platform routes.
    // Terminal, QR, and public routes handle their own 401s (or don't need auth at all).
    const isTerminalPath =
      path.startsWith("/pos/") || path.startsWith("/kitchen/") || path.startsWith("/qr");
    const isPublicPath =
      path === "/" || path === "" || path === "/landing";

    if (status === 401 && !isTerminalPath && !isPublicPath && typeof window !== "undefined") {
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