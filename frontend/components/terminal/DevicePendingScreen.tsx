// Path: frontend/components/terminal/DevicePendingScreen.tsx
//
// Shown when a device has been auto-registered but not yet approved.
// Polls /api/shops/:shopId/devices/status every 5 seconds.
// Calls onApproved() the moment status becomes APPROVED.
//
// ── Exit button — no password required ───────────────────
//
// WHY no password:
//   The pending screen is reached when activation returned 202.
//   The backend only sets a terminal_session cookie on 201 (fully
//   activated). On 202, NO terminal_session cookie is set, which
//   means the owner's access_token was never cleared either.
//
//   The /terminal/exit endpoint requires a terminal_session cookie
//   in step 1. Without it, it returns 400 NO_ACTIVE_MODE_SESSION.
//   Calling that endpoint here would always fail — there is nothing
//   to close on the backend.
//
//   The password gate on a live terminal exit exists because at that
//   point access_token is gone ("burned") and the owner needs to
//   re-authenticate to get it back. None of that applies here:
//   the owner's session is still intact and the mode was never
//   fully activated. Exiting is equivalent to pressing Back.
//
//   Therefore: clicking "Go to Dashboard" navigates directly to
//   /shops/:shopId/dashboard with no API call and no password.
//   The ?device_pending param is cleared by the full-page navigation,
//   which lets SessionGuardContext run a clean session check.

"use client";

import React, { useEffect, useRef } from "react";

type Mode = "POS" | "KITCHEN";

interface DevicePendingScreenProps {
  shopId:     string;
  deviceKey:  string;
  mode:       Mode;
  onApproved: () => void;
}

const POLL_INTERVAL_MS = 5_000;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function DevicePendingScreen({
  shopId,
  deviceKey,
  mode,
  onApproved,
}: DevicePendingScreenProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(
          `${API_BASE}/api/shops/${shopId}/devices/status?device_key=${encodeURIComponent(deviceKey)}`,
          { credentials: "include" }
        );
        if (!res.ok) return;

        const data: { status: string } = await res.json();

        if (data.status === "APPROVED") {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          onApproved();
        }
      } catch {
        // Swallow network errors — retry on next tick
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [shopId, deviceKey, onApproved]);

  // Theme colours match POS (navy) vs Kitchen (near-black)
  const bg     = mode === "POS" ? "bg-[#0F2B4C]" : "bg-[#0A0A0A]";
  const cardBg = mode === "POS" ? "bg-[#1A3A5C]" : "bg-[#1A1A1A]";

  function handleGoToDashboard() {
    // Full-page navigation so:
    //   1. ?device_pending is cleared from the URL
    //   2. SessionGuardContext runs a fresh session check on load
    //   3. The owner lands on the dashboard with their intact access_token
    window.location.href = `/shops/${shopId}/dashboard`;
  }

  return (
    <div className={`min-h-screen ${bg} flex flex-col items-center justify-center p-6 relative`}>

      {/* ── Go to Dashboard button ─────────────────────────
          No password needed — access_token is still active.
          This is not a "mode exit" — mode was never entered.  */}
      <button
        onClick={handleGoToDashboard}
        className="absolute top-6 right-6 text-[12px] text-white/30 hover:text-white/70 transition px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30"
      >
        ← Dashboard
      </button>

      {/* Amber warning card */}
      <div className={`w-full max-w-md ${cardBg} border border-[#BA7517]/40 rounded-2xl overflow-hidden shadow-2xl`}>

        {/* Header */}
        <div className="bg-[#BA7517]/15 border-b border-[#BA7517]/30 px-6 py-5 flex items-start gap-4">
          <div className="relative flex-shrink-0 mt-0.5">
            <div className="absolute inset-0 rounded-full bg-[#BA7517]/20 animate-ping" />
            <div className="relative w-10 h-10 rounded-full bg-[#BA7517]/25 border border-[#BA7517]/50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="#FBBF24" strokeWidth="1.5" />
                <path d="M10 6v4l2.5 2.5" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-[#FBBF24]/60 text-[11px] uppercase tracking-widest font-medium mb-1">
              Approval Required
            </p>
            <h1 className="text-white text-[18px] font-semibold leading-tight">
              Device Pending Activation
            </h1>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          <p className="text-white/60 text-[14px] leading-relaxed">
            This device has been registered and is awaiting your approval
            before {mode === "POS" ? "POS" : "Kitchen"} mode can be activated.
          </p>

          {/* Owner self-approval steps */}
          <div className="bg-[#BA7517]/10 border border-[#BA7517]/25 rounded-xl px-5 py-4 space-y-2">
            <p className="text-[#FBBF24]/80 text-[12px] font-semibold uppercase tracking-wider">
              To approve this device
            </p>
            <ol className="space-y-1.5">
              {[
                <>Click <span className="text-white/70 font-medium">← Dashboard</span> (top right)</>,
                <>Go to <span className="text-white/70 font-medium">Permissions</span> in the sidebar</>,
                <>Find this device and click <span className="text-white/70 font-medium">Approve</span></>,
                <>Come back and activate <span className="text-white/70 font-medium">{mode === "POS" ? "POS" : "Kitchen"} Mode</span> again</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-[13px] text-white/40">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#BA7517]/30 text-[#FBBF24] text-[11px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Device ID */}
          <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3">
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider mb-1.5">
              Device ID to approve
            </p>
            <p className="text-[#FBBF24] font-mono text-[12px] break-all leading-relaxed">
              {deviceKey}
            </p>
          </div>

          {/* Polling indicator */}
          <div className="flex items-center gap-2.5 text-white/30 text-[12px]">
            <svg
              className="animate-spin flex-shrink-0"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
            >
              <circle
                cx="7" cy="7" r="5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="20 10"
                strokeLinecap="round"
              />
            </svg>
            Checking for approval every 5 seconds…
          </div>
        </div>
      </div>

      <p className="mt-6 text-white/20 text-[12px] text-center max-w-xs leading-relaxed">
        Once approved, this screen will automatically transition to the staff
        PIN login screen — no action needed on this device.
      </p>
    </div>
  );
}