"use client";
// =========================================================
// app/(kitchen)/kitchen/[shopId]/display/page.tsx
//
// Kitchen Display System (KDS) — main working screen.
// Kitchen staff land here after PIN login.
//
// This is a placeholder. The real KDS will:
//   - Connect to Socket.IO shop room for live ticket updates
//   - Fetch GET /api/shops/:shopId/kitchen/tickets
//   - Allow staff to bump items: PENDING → PREPARING → READY
//
// Protected by kitchen_token cookie (set on login).
// The proxy.ts middleware redirects to /kitchen/[shopId]
// if the cookie is missing.
// =========================================================

import React from "react";
import { useParams, useRouter } from "next/navigation";
import posApi from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";

export default function KitchenDisplayPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();

  async function handleLogout() {
    try {
      await posApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch {
      // Always redirect even if the request fails
    } finally {
      router.push(`/kitchen/${shopId}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div>
          <p className="text-white/40 text-[11px] uppercase tracking-widest">Kitchen Display</p>
          <p className="text-white text-[16px] font-medium">Live Orders</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 h-8 text-[12px] text-white/50 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition"
        >
          Exit kitchen →
        </button>
      </header>

      {/* Placeholder content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0D7A5F]/20 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M6 8h20l-2 16H8L6 8zM4 8h24M12 8V6a4 4 0 018 0v2"
                stroke="#0D7A5F"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-white text-[18px] font-medium mb-2">Kitchen Display</p>
          <p className="text-white/40 text-[14px] max-w-xs">
            Ticket display coming soon. This screen will show live orders from the kitchen queue.
          </p>
        </div>
      </div>
    </div>
  );
}