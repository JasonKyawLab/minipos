"use client";
// =========================================================
// context/ShopContext.tsx
// Holds the current shop's data. Populated by the shop
// layout Server Component and passed down as props.
// =========================================================

import React, { createContext, useContext, type ReactNode } from "react";
import { ShopType, Currency, ShopRole } from "@/types";

interface ShopContextValue {
  shopId: string;
  shopName: string;
  shopType: ShopType;
  currency: Currency;
  taxRate: number;
  userRole: ShopRole;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ShopContextValue;
}) {
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}