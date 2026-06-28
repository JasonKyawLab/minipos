// =========================================================
// app/(kitchen)/layout.tsx
//
// Kitchen route group layout.
// Full-screen, dark theme — no platform sidebar.
// Mirrors the (pos) group structure exactly.
//
// Why a separate route group?
//   - Kitchen staff log in with a DIFFERENT cookie (kitchen_token)
//     than POS staff (pos_token) or platform users (access_token).
//   - Keeping them in separate route groups means:
//       1. The proxy.ts middleware can protect them independently.
//       2. The layout can be tailored for a kitchen display
//          (larger text, dark bg, landscape-optimised).
//       3. No accidental mixing of POS context with kitchen context.
// =========================================================

import React from "react";
import { ScreenSizeGate } from "@/components/mode/ScreenSizeGate";

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <ScreenSizeGate minWidth={640} minHeight={420}>
        {children}
      </ScreenSizeGate>
    </div>
  );
}