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

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Dark background — kitchen displays are typically in bright
    // environments so a near-black background reduces eye strain.
    <div className="min-h-screen bg-[#0A0A0A]">{children}</div>
  );
}