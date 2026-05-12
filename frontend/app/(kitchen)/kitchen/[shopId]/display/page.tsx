"use client";

// =========================================================
// app/(kitchen)/kitchen/[shopId]/display/page.tsx
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter }        from "next/navigation";
import kitchenApi                      from "@/lib/kitchenApi";
import { ModeGate }                    from "@/components/mode/ModeGate";
import { getSocket }                   from "@/lib/socket"; // Added for real-time logout

const SHIFT_START_KEY      = "minipos_kitchen_shift_start";
const KITCHEN_FORCE_LOGOUT = "kitchen:force_logout"; // Matches server-side event name

export default function KitchenDisplayPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router     = useRouter();

  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // ── Socket Logic: Force Logout ───────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    socket.on("connect", () => {
      console.log("[Kitchen Display] Connected to socket room");
    });

    // Listen for the remote "Force Logout" command
    socket.on(KITCHEN_FORCE_LOGOUT, () => {
      console.log("[Kitchen Display] Force logout received — invalidating session");

      // 1. Best-effort API call to clear cookies on server
      kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`).catch(() => {});

      // 2. Clear local shift tracking
      sessionStorage.removeItem(SHIFT_START_KEY);

      // 3. Hard navigate to the Kitchen PIN screen
      // window.location.href ensures the entire app state resets
      window.location.href = `/kitchen/${shopId}`;
    });

    // Initialize shift start time if not present
    if (!sessionStorage.getItem(SHIFT_START_KEY)) {
      sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
    }

    return () => {
      socket.off("connect");
      socket.off(KITCHEN_FORCE_LOGOUT);
      socket.disconnect();
    };
  }, [shopId]);

  // ── Helper Functions ─────────────────────────────────────
  function getShiftDuration(): string {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (!startStr) return "Unknown";

    const diffMs  = Date.now() - new Date(startStr).getTime();
    const hours   = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try {
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch {
      // Non-fatal
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      router.push(`/kitchen/${shopId}`);
    }
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try {
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch {
      // Non-fatal
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/shops/${shopId}/dashboard`;
    }
  }

  function handleEndShiftClick() {
    setShiftDuration(getShiftDuration());
    setShowShiftSummary(true);
  }

  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
          <div>
            <p className="text-white/30 text-[11px] uppercase tracking-widest">
              Kitchen Display System
            </p>
            <p className="text-white text-[15px] font-medium">Live Tickets</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleEndShiftClick}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/50 border border-white/10 rounded-lg hover:bg-white/8 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending shift…" : "End shift"}
            </button>

            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/25 border border-white/5 rounded-lg hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
            >
              {exitingMode ? "Exiting…" : "Exit Mode →"}
            </button>
          </div>
        </header>

        {/* Kitchen Area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-[#0D7A5F]/10 border border-[#0D7A5F]/20 flex items-center justify-center mx-auto mb-5">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M8 10h24l-3 20H11L8 10z" stroke="#0D7A5F" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M5 10h30" stroke="#0D7A5F" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M15 10V8a5 5 0 0110 0v2" stroke="#0D7A5F" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-white text-[20px] font-medium mb-2">Kitchen Display Ready</p>
            <p className="text-white/30 text-[14px] max-w-xs mx-auto leading-relaxed">
              Live order tickets will appear here when orders are confirmed.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[{ label: "Queued", colour: "bg-white/10" }, { label: "Preparing", colour: "bg-[#BA7517]/30" }, { label: "Ready", colour: "bg-[#0D7A5F]/30" }].map(({ label, colour }) => (
                <div key={label} className={`${colour} rounded-lg px-3 py-2`}>
                  <p className="text-white/50 text-[11px] font-medium">{label}</p>
                  <p className="text-white/20 text-[22px] font-semibold">0</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in overflow-hidden">
            <div className="bg-[#0A0A0A] px-6 py-5">
              <p className="text-white/40 text-[11px] uppercase tracking-widest mb-1">Shift complete</p>
              <p className="text-white text-[20px] font-semibold">Great work today!</p>
            </div>
            <div className="px-6 py-5">
              <div className="bg-[#F1EFE8] rounded-xl p-4 mb-5">
                <p className="text-[12px] text-[#5F5E5A] mb-0.5">Shift duration</p>
                <p className="text-[28px] font-semibold text-[#0F2B4C] leading-tight">{shiftDuration}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowShiftSummary(false)} className="flex-1 h-10 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-xl hover:bg-[#F1EFE8] transition">Stay logged in</button>
                <button onClick={handleShiftConfirmed} className="flex-1 h-10 text-[13px] font-medium text-white bg-[#0A0A0A] rounded-xl hover:bg-[#1A1A1A] transition">End shift →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExitGate && (
        <ModeGate
          shopId={shopId}
          shopName=""
          mode="KITCHEN"
          action="exit"
          allowCancel={true}
          onSuccess={handleExitConfirmed}
          onCancel={() => setShowExitGate(false)}
        />
      )}
    </>
  );
}