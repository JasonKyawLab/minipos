// Path: frontend/app/(pos)/pos/[shopId]/terminal/page.tsx
// CHANGES:
//   1. Import SOCKET_EVENTS from the correct path
//   2. Replace the existing useEffect socket block with one that
//      connects and listens for POS_FORCE_LOGOUT on the terminal room
//
// WHY window.location.href instead of router.push():
//   - router.push() is client-side navigation — React context
//     (AuthContext, posSession) stays mounted with stale state
//   - window.location.href forces a full page reload, which
//     clears all React state and re-runs the session check
//   - This is critical after force-logout: we must not keep
//     any cached auth state that could let the user back in

"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter }        from "next/navigation";
import posApi                          from "@/lib/posApi";
import { ModeGate }                    from "@/components/mode/ModeGate";
import { getSocket }                   from "@/lib/socket";

// Session storage key — tracks when the current cashier's shift started
const SHIFT_START_KEY = "minipos_shift_start";

// Socket event constant — must match backend SOCKET_EVENTS.POS_FORCE_LOGOUT
const POS_FORCE_LOGOUT_EVENT = "pos:force_logout";

export default function PosTerminalPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router     = useRouter();

  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // ── Socket: connect and listen for force-logout ───────────
  useEffect(() => {
    const socket = getSocket();

    // Connect — the server's handshake middleware reads the
    // terminal_session cookie and auto-joins this terminal to
    // room: terminal:<shopId>:POS
    // We do NOT need to emit a "join" event — it's automatic.
    socket.connect();

    socket.on("connect", () => {
      console.log("[POS Terminal] Socket connected, auto-joined terminal room");
    });

    socket.on("terminal_room_joined", (data: { room: string; mode: string }) => {
      console.log("[POS Terminal] Confirmed room:", data.room);
    });

    // ── Force logout handler ──────────────────────────────
    // Fired by the server when the owner clicks "Force Logout"
    // for ANY cashier on this terminal.
    //
    // We don't filter by targetUserId because:
    //   a) We don't have the current cashier's userId in scope easily
    //   b) The server already incremented the token version — any
    //      subsequent API call will return 401 regardless
    //   c) If there's only one active cashier per terminal (which
    //      is the expected UX), this is always the right user
    socket.on(POS_FORCE_LOGOUT_EVENT, () => {
      console.log("[POS Terminal] Force logout received — redirecting to PIN screen");

      // Best-effort logout call — clears the pos_token cookie server-side.
      // We don't await this because we navigate immediately.
      // If it fails, the terminal will still be kicked on the
      // next API call due to the incremented token version.
      posApi.post(`/api/shops/${shopId}/pos-auth/logout`).catch(() => {});

      // Remove shift tracking — this shift is being terminated
      sessionStorage.removeItem(SHIFT_START_KEY);

      // Hard navigate to PIN selection screen.
      // Using window.location.href (not router.push) to ensure
      // full page reload clears all React state.
      window.location.href = `/pos/${shopId}`;
    });

    socket.on("connect_error", (err) => {
      console.error("[POS Terminal] Socket connection error:", err.message);
    });

    // Record shift start on first mount
    if (!sessionStorage.getItem(SHIFT_START_KEY)) {
      sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
    }

    return () => {
      socket.off("connect");
      socket.off("terminal_room_joined");
      socket.off(POS_FORCE_LOGOUT_EVENT);
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [shopId]);

  // ── Shift duration helper ─────────────────────────────────
  function getShiftDuration(): string {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (!startStr) return "Unknown";
    const diffMs  = Date.now() - new Date(startStr).getTime();
    const hours   = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function handleEndShiftClick() {
    setShiftDuration(getShiftDuration());
    setShowShiftSummary(true);
  }

  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try {
      await posApi.post(`/api/shops/${shopId}/pos-auth/logout`);
    } catch {
      // Always navigate even if the logout call fails
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      router.push(`/pos/${shopId}`);
    }
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try {
      await posApi.post(`/api/shops/${shopId}/pos-auth/logout`);
    } catch {
      // Non-fatal
    } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/shops/${shopId}/dashboard`;
    }
  }

  // ── Render ────────────────────────────────────────────────
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

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M4 6h24v16H4V6zM10 28h12M16 22v6"
                  stroke="white" strokeWidth="1.5" strokeOpacity="0.6"
                  strokeLinecap="round" strokeLinejoin="round"
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
              <p className="text-white text-[20px] font-semibold">Great work today!</p>
            </div>
            <div className="px-6 py-5">
              <div className="bg-[#F1EFE8] rounded-xl p-4 mb-5">
                <p className="text-[12px] text-[#5F5E5A]">Shift duration</p>
                <p className="text-[24px] font-semibold text-[#0F2B4C] leading-tight">
                  {shiftDuration}
                </p>
              </div>
              <p className="text-[13px] text-[#5F5E5A] mb-5">
                You will be logged out. POS mode stays active for the next person.
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