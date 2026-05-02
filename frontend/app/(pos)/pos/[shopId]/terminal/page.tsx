"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import posApi from "@/lib/posApi";
import { ModeGate } from "@/components/mode/ModeGate";

// Track when the shift started so we can show duration
const SHIFT_START_KEY = "minipos_shift_start";

export default function PosTerminalPage() {
  const { shopId }  = useParams<{ shopId: string }>();
  const router      = useRouter();

  const [showExitGate, setShowExitGate]     = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]   = useState("");
  const [endingShift, setEndingShift]       = useState(false);
  const [exitingMode, setExitingMode]       = useState(false);

  // Record shift start time when this page first mounts
  // (i.e. when the cashier successfully logs in with their PIN)
  useEffect(() => {
    if (!sessionStorage.getItem(SHIFT_START_KEY)) {
      sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
    }
  }, []);

  function getShiftDuration(): string {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (!startStr) return "Unknown";

    const start    = new Date(startStr).getTime();
    const now      = Date.now();
    const diffMs   = now - start;
    const hours    = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes  = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Step 1: show summary modal
  function handleEndShiftClick() {
    setShiftDuration(getShiftDuration());
    setShowShiftSummary(true);
  }

  // Step 2: user confirms → logout → PIN selection screen
  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try {
      await posApi.post(`/api/shops/${shopId}/pos-auth/logout`);
    } catch {
      // Always navigate even if logout API fails
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      // Return to staff PIN selection — POS mode stays active
      router.push(`/pos/${shopId}`);
    }
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try {
      await posApi.post(`/api/shops/${shopId}/pos-auth/logout`);
    } catch {
      //
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      router.push(`/shops/${shopId}/dashboard`);
    }
  }

  return (
    <>
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col">

        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest">
              Point of Sale
            </p>
            <p className="text-white text-[16px] font-medium">POS Terminal</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleEndShiftClick}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/60 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending shift…" : "End shift"}
            </button>

            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/30 border border-white/5 rounded-lg hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
            >
              {exitingMode ? "Exiting…" : "Exit Mode →"}
            </button>
          </div>
        </header>

        {/* POS working area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M4 6h24v16H4V6zM10 28h12M16 22v6"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-white text-[18px] font-medium mb-2">POS Ready</p>
            <p className="text-white/30 text-[14px] max-w-xs leading-relaxed">
              Product grid and cart will appear here.
            </p>
          </div>
        </div>
      </div>

      {/* Shift summary modal */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in overflow-hidden">

            {/* Summary header */}
            <div className="bg-[#0F2B4C] px-6 py-5">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5" />
                  <path d="M12 7v5l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-white/50 text-[11px] uppercase tracking-widest mb-1">
                Shift complete
              </p>
              <p className="text-white text-[20px] font-semibold">
                Great work today!
              </p>
            </div>

            {/* Summary body */}
            <div className="px-6 py-5">
              <div className="bg-[#F1EFE8] rounded-xl p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] text-[#5F5E5A]">Shift duration</p>
                    <p className="text-[24px] font-semibold text-[#0F2B4C] leading-tight">
                      {shiftDuration}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#0D7A5F]/10 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 5v5l3.5 3.5" stroke="#0D7A5F" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="10" r="8" stroke="#0D7A5F" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>
              </div>

              <p className="text-[13px] text-[#5F5E5A] mb-5">
                You will be logged out and returned to the staff selection screen.
                POS mode will stay active for the next person.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowShiftSummary(false)}
                  className="flex-1 h-10 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-xl hover:bg-[#F1EFE8] transition"
                >
                  Stay logged in
                </button>
                <button
                  onClick={handleShiftConfirmed}
                  className="flex-1 h-10 text-[13px] font-medium text-white bg-[#0F2B4C] rounded-xl hover:bg-[#0F2B4C]/90 transition"
                >
                  End shift →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exit Mode gate */}
      {showExitGate && (
        <ModeGate
          shopId={shopId}
          shopName=""
          mode="POS"
          action="exit"
          allowCancel={true}
          onSuccess={handleExitConfirmed}
          onCancel={() => setShowExitGate(false)}
        />
      )}
    </>
  );
}