// =========================================================
// app/(pos)/layout.tsx
// POS layout: full-screen, no nav sidebar.
// Only mounts PosContext and CartContext providers.
// =========================================================

import React from "react";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F2B4C]">
      {children}
    </div>
  );
}