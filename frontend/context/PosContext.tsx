"use client";
// context/PosContext.tsx
//
// Holds the POS session state after a cashier logs in with their PIN.
// Mounted in the POS layout — available to the main POS page only.
//
// Why separate from AuthContext?
//   AuthContext holds the platform (owner/admin) JWT.
//   PosContext holds the tablet session after PIN login.
//   They can coexist: an owner can be logged in on the platform AND
//   have a POS session active on the same browser tab.

import React, {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from "react";
import type { ShopRole } from "@/types";

interface PosSessionData {
  userId:    string;
  userName:  string;
  shopRole:  ShopRole;
  shopId:    string;
  shopName:  string;
}

interface PosContextValue {
  session:    PosSessionData | null;
  isLoggedIn: boolean;
  setSession: (data: PosSessionData | null) => void;
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