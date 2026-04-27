"use client";
// =========================================================
// app/(pos)/pos/[shopId]/terminal/page.tsx
//
// Main POS interface — cashier lands here after PIN login.
// Protected: proxy.ts redirects to /pos/[shopId] if
// pos_token cookie is missing.
//
// This is currently a placeholder shell.
// Full POS UI (product grid, cart, payment) comes next.
// =========================================================

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import posApi from "@/lib/posApi";

export default function PosTerminalPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // POST /api/shops/:shopId/pos-auth/logout
      // Backend clears the pos_token cookie
      await posApi.post(`/api/shops/${shopId}/pos-auth/logout`);
    } catch {
      // Always redirect even if the network call fails
    } finally {
      router.push(`/pos/${shopId}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F2B4C] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div>
          <p className="text-white/40 text-[11px] uppercase tracking-widest">Point of Sale</p>
          <p className="text-white text-[16px] font-medium">POS Terminal</p>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="px-4 h-8 text-[12px] text-white/50 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition disabled:opacity-40"
        >
          {loggingOut ? "Signing out…" : "Exit POS →"}
        </button>
      </header>

      {/* Placeholder body */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0D7A5F]/20 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M4 6h24v16H4V6zM10 28h12M16 22v6"
                stroke="#0D7A5F"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-white text-[18px] font-medium mb-2">POS Ready</p>
          <p className="text-white/40 text-[14px] max-w-xs">
            Full product grid and cart coming next. You are logged in successfully.
          </p>
        </div>
      </div>
    </div>
  );
}