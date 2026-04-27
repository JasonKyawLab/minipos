"use client";
// =========================================================
// context/AuthContext.tsx
// Path: frontend/context/AuthContext.tsx
// =========================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import api from "@/lib/api";
import { User } from "@/types";

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Backend returns: { user: { id, name, email, role, status } }
      const { data } = await api.get<{ user: User }>("/api/auth/me");

      if (data?.user?.id) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      // 401 = no valid session. Normal on first visit.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Backend clears the httpOnly cookie server-side.
      // We can't clear httpOnly cookies from JavaScript.
      await api.post("/api/auth/logout");
    } catch {
      // Always clear local state even if network fails.
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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