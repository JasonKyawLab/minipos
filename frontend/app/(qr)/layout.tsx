// =========================================================
// app/(qr)/layout.tsx
// Public QR menu layout — mobile-first, no auth required.
// =========================================================

import React from "react";

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  );
}