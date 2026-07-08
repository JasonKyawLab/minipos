"use client";
// =========================================================
// context/PosContext.tsx
// Path: frontend/context/PosContext.tsx
// =========================================================

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ShopRole, ShopType, Currency } from "@/types";

interface PosSessionData {
  userId:   string;
  userName: string;
  shopRole: ShopRole;
  shopId:   string;
  shopName: string;
  shopType: ShopType;
  currency: Currency;
  taxRate:  number;
}

interface PosContextValue {
  session:      PosSessionData | null;
  isLoggedIn:   boolean;
  setSession:   (data: PosSessionData | null) => void;
  clearSession: () => void;
}

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<PosSessionData | null>(null);

  const setSession = useCallback((data: PosSessionData | null) => {
    setSessionState(data);
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
  }, []);

  return (
    <PosContext.Provider
      value={{
        session,
        isLoggedIn: session !== null,
        setSession,
        clearSession,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePosSession(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePosSession must be used inside <PosProvider>");
  return ctx;
}