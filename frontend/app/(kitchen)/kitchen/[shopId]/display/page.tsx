"use client";
// =========================================================
// app/(kitchen)/kitchen/[shopId]/display/page.tsx
//
// Kitchen working screen (KDS). Two exit paths:
//
//   1. "End Shift" — this cook is done.
//      Shows a shift summary modal → logs out → returns to
//      the staff selection screen so the next cook can log in
//      WITHOUT requiring the owner password again.
//
//   2. "Exit Mode" — owner wants to shut down kitchen mode.
//      Requires owner password via ModeGate → navigates back
//      to the main shop dashboard.
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter }        from "next/navigation";
import kitchenApi                      from "@/lib/kitchenApi";
import { ModeGate }                    from "@/components/mode/ModeGate";

// sessionStorage key — tracks when this cook's shift started.
// sessionStorage is per-tab and clears when the browser closes,
// which is exactly the lifetime we want for a shift.
const SHIFT_START_KEY = "minipos_kitchen_shift_start";

export default function KitchenDisplayPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router     = useRouter();

  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // Record the moment this cook's session started.
  // Only write it once — if the cook navigates away and back,
  // we don't reset the clock.
  useEffect(() => {
    if (!sessionStorage.getItem(SHIFT_START_KEY)) {
      sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
    }
  }, []);

  // ── Compute shift duration ────────────────────────────────
  // Called when "End shift" is clicked, not on a timer,
  // so there's no need to re-render every second.
  function getShiftDuration(): string {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (!startStr) return "Unknown";

    const diffMs  = Date.now() - new Date(startStr).getTime();
    const hours   = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // ── Step 1: "End shift" clicked ───────────────────────────
  // Calculate duration and show the summary modal.
  // We don't log out yet — the cook can cancel and stay in.
  function handleEndShiftClick() {
    setShiftDuration(getShiftDuration());
    setShowShiftSummary(true);
  }

  // ── Step 2: Cook confirms in the summary modal ────────────
  // Now we log out and return to the staff selection screen.
  // Kitchen mode stays active — the next cook can sign in.
  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try {
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch {
      // Always navigate even if the logout API call fails.
      // The cookie will expire naturally.
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      router.push(`/kitchen/${shopId}`);
    }
  }

  // ── Exit mode (after owner password confirmed) ────────────
  // Shuts down kitchen mode entirely and returns to the
  // management dashboard.
  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try {
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch {
      //
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      router.push(`/shops/${shopId}/dashboard`);
    }
  }

  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col">

        {/* ── Header ──────────────────────────────────────── */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
          <div>
            <p className="text-white/30 text-[11px] uppercase tracking-widest">
              Kitchen Display System
            </p>
            <p className="text-white text-[15px] font-medium">Live Tickets</p>
          </div>

          <div className="flex items-center gap-2">
            {/* End Shift — any cook can use this to log themselves out.
                Kitchen mode stays running for the next person. */}
            <button
              onClick={handleEndShiftClick}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/50 border border-white/10 rounded-lg hover:bg-white/8 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending shift…" : "End shift"}
            </button>

            {/* Exit Mode — shuts down kitchen mode entirely.
                Intentionally styled subtly — only the owner needs this.
                Requires owner password via ModeGate. */}
            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/25 border border-white/5 rounded-lg hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
            >
              {exitingMode ? "Exiting…" : "Exit Mode →"}
            </button>
          </div>
        </header>

        {/* ── Kitchen working area ─────────────────────────── */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-[#0D7A5F]/10 border border-[#0D7A5F]/20 flex items-center justify-center mx-auto mb-5">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path
                  d="M8 10h24l-3 20H11L8 10z"
                  stroke="#0D7A5F"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 10h30"
                  stroke="#0D7A5F"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M15 10V8a5 5 0 0110 0v2"
                  stroke="#0D7A5F"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-white text-[20px] font-medium mb-2">
              Kitchen Display Ready
            </p>
            <p className="text-white/30 text-[14px] max-w-xs mx-auto leading-relaxed">
              Live order tickets will appear here when orders are confirmed.
            </p>

            {/* Status counters — placeholders for live ticket data */}
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[
                { label: "Queued",    colour: "bg-white/10" },
                { label: "Preparing", colour: "bg-[#BA7517]/30" },
                { label: "Ready",     colour: "bg-[#0D7A5F]/30" },
              ].map(({ label, colour }) => (
                <div key={label} className={`${colour} rounded-lg px-3 py-2`}>
                  <p className="text-white/50 text-[11px] font-medium">{label}</p>
                  <p className="text-white/20 text-[22px] font-semibold">0</p>
                </div>
              ))}
            </div>

            {/* Hint text — explains the two exit options */}
            <div className="mt-8 flex flex-col gap-2 text-[12px] text-white/15 max-w-xs mx-auto text-left">
              <p>
                <span className="text-white/30 font-medium">End shift</span>{" "}
                — logs you out and returns to staff selection. Kitchen mode stays
                active for the next cook.
              </p>
              <p>
                <span className="text-white/30 font-medium">Exit Mode</span>{" "}
                — shuts down kitchen mode entirely. Requires the owner password.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Shift summary modal ──────────────────────────────
          Shown when "End shift" is clicked.
          Cook sees their shift duration before being logged out.
          They can cancel and stay logged in if they change their mind.
      ─────────────────────────────────────────────────────── */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in overflow-hidden">

            {/* Summary header — dark to match kitchen theme */}
            <div className="bg-[#0A0A0A] px-6 py-5">
              <div className="w-12 h-12 rounded-xl bg-[#0D7A5F]/20 border border-[#0D7A5F]/30 flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="#0D7A5F" strokeWidth="1.5" />
                  <path
                    d="M12 7v5l3 3"
                    stroke="#0D7A5F"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="text-white/40 text-[11px] uppercase tracking-widest mb-1">
                Shift complete
              </p>
              <p className="text-white text-[20px] font-semibold">
                Great work today!
              </p>
            </div>

            {/* Summary body */}
            <div className="px-6 py-5">

              {/* Duration card */}
              <div className="bg-[#F1EFE8] rounded-xl p-4 mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-[#5F5E5A] mb-0.5">Shift duration</p>
                  <p className="text-[28px] font-semibold text-[#0F2B4C] leading-tight">
                    {shiftDuration}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#0D7A5F]/10 flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="9" stroke="#0D7A5F" strokeWidth="1.5" />
                    <path
                      d="M11 6v5l3.5 3.5"
                      stroke="#0D7A5F"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              <p className="text-[13px] text-[#5F5E5A] mb-5 leading-relaxed">
                You will be logged out and returned to the staff selection screen.
                Kitchen mode stays active for the next cook.
              </p>

              <div className="flex gap-2">
                {/* Cancel — cook can stay logged in */}
                <button
                  onClick={() => setShowShiftSummary(false)}
                  className="flex-1 h-10 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-xl hover:bg-[#F1EFE8] transition"
                >
                  Stay logged in
                </button>

                {/* Confirm — log out and go to staff selection */}
                <button
                  onClick={handleShiftConfirmed}
                  className="flex-1 h-10 text-[13px] font-medium text-white bg-[#0A0A0A] rounded-xl hover:bg-[#1A1A1A] transition"
                >
                  End shift →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit Mode gate ───────────────────────────────────
          Full-screen password prompt.
          Cannot be dismissed without the correct password or Cancel.
          Cancel keeps the cook in the kitchen display.
      ─────────────────────────────────────────────────────── */}
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