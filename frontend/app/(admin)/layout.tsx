// =========================================================
// app/(admin)/layout.tsx
// Admin section layout. Shares the platform Sidebar.
// The Sidebar already handles admin-only nav items.
// =========================================================

import React from "react";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F1EFE8]">
      <Sidebar />
      <main className="flex-1 ml-[180px] min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}