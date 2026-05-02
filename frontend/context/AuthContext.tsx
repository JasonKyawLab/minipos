"use client";
// =========================================================
// context/AuthContext.tsx
//
// Multi-tab session handling:
//
// PROBLEM 1 — Cross-tab logout:
//   When Tab A logs out, Tab B must also redirect cleanly.
//   Fix: BroadcastChannel sends LOGOUT → other tabs redirect.
//
// PROBLEM 2 — Stale user after another tab logs into a
//   different account:
//   When Tab B logs in as User2, Tab A still shows User1.
//   Fix: BroadcastChannel sends LOGIN → other tabs re-fetch
//   their user so they detect the session changed.
//
// PROBLEM 3 — Tab returns from background with stale data:
//   User leaves tab for a while, comes back, data may be stale.
//   Fix: visibilitychange event triggers a lightweight refresh.
//
// IMPORTANT ARCHITECTURAL NOTE:
//   Browsers share ONE httpOnly cookie per domain/path.
//   You cannot have two different accounts active in two
//   tabs of the same browser at the same time — the last
//   login cookie always overwrites the previous one.
//   This is how every major platform works (Gmail, GitHub, etc.).
//   The correct UX pattern is: one account per browser session.
// =========================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import api from "@/lib/api";
import { User } from "@/types";

// ── BroadcastChannel event types ──────────────────────────
type TabMessage =
  | { type: "LOGOUT" }
  | { type: "LOGIN"; userId: string };

const CHANNEL_NAME = "minipos_auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef                = useRef<BroadcastChannel | null>(null);

  // ── Refresh: load current user from the httpOnly cookie ─
  // We always call /auth/me — we cannot read httpOnly cookies in JS.
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ user: User }>("/api/auth/me");
      if (data?.user?.id) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      // 401 = no valid session. Normal on first visit or after logout.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Always clear state even if the network call fails.
    } finally {
      setUser(null);
      // Tell other tabs to redirect to login cleanly.
      channelRef.current?.postMessage({ type: "LOGOUT" } satisfies TabMessage);
    }
  }, []);

  // ── BroadcastChannel: communicate with other tabs ──────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<TabMessage>) => {
      if (event.data.type === "LOGOUT") {
        // Another tab logged out — the shared cookie is gone.
        // Clear state and redirect without triggering a 401.
        setUser(null);
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }

      if (event.data.type === "LOGIN") {
        // Another tab logged in as a (possibly different) user.
        // Re-fetch our own user so we reflect the current cookie.
        // Why: the httpOnly cookie is shared — a login in Tab B
        // replaces the Tab A cookie. Refreshing here keeps Tab A
        // in sync instead of showing stale data.
        refresh();
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [refresh]);

  // ── Tab visibility: refresh when user returns to tab ───
  // This handles the case where the user was gone for a long
  // time and the session may have expired, or they logged in
  // from another tab while this one was hidden.
  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Only do a lightweight check — if the user hasn't
        // changed we do nothing (setUser is stable, no flicker).
        refresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  // ── Initial load ───────────────────────────────────────
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── broadcastLogin: called after a successful login ────
  // Exported so the login form can call it after setting the cookie.
  const broadcastLogin = useCallback((userId: string) => {
    channelRef.current?.postMessage({ type: "LOGIN", userId } satisfies TabMessage);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        setUser,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}