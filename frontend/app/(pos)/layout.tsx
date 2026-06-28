// =========================================================
// app/(pos)/layout.tsx
// POS layout: full-screen, no nav sidebar.
// Only mounts PosContext and CartContext providers.
// =========================================================

"use client";

import React from "react";
import { PosProvider } from "@/context/PosContext";
import { ScreenSizeGate } from "@/components/mode/ScreenSizeGate";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosProvider>
      <div className="min-h-screen bg-[#0F2B4C]">
        <ScreenSizeGate minWidth={768} minHeight={500}>
          {children}
        </ScreenSizeGate>
      </div>
    </PosProvider>
  );
}