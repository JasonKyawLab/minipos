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

    // Only redirect on 401 for platform routes
    // Terminal routes handle their own 401s in posApi/kitchenApi
    const isTerminalPath =
      path.startsWith("/pos/") || path.startsWith("/kitchen/");

    if (status === 401 && !isTerminalPath && typeof window !== "undefined") {
      if (path !== "/login") {
        window.location.href = `/login`;
      }
    }

    return Promise.reject(error);
  }
);

export default api;