// =========================================================
// app/(admin)/layout.tsx
// Path: frontend/app/(admin)/layout.tsx
//
// Admin section layout. Uses a dedicated AdminSidebar — NOT the
// platform Sidebar. The platform Sidebar is owner/shop-scoped
// (shop list, settings, etc.) and has no relevance to the ADMIN
// role, which only manages platform users and shops.
// =========================================================

import React from "react";
import { AdminSidebar } from "@/components/layout/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F1EFE8]">
      <AdminSidebar />
      <main className="flex-1 ml-[180px] min-h-screen min-w-0">
       <div className="p-6 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}