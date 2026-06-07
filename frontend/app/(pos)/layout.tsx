// =========================================================
// app/(pos)/layout.tsx
// POS layout: full-screen, no nav sidebar.
// Only mounts PosContext and CartContext providers.
// =========================================================

"use client";
 
import React from "react";
import { PosProvider } from "@/context/PosContext";
 
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosProvider>
      <div className="min-h-screen bg-[#0F2B4C]">
        {children}
      </div>
    </PosProvider>
  );
}