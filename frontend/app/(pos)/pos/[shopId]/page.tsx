"use client";
// =========================================================
// app/(pos)/pos/[shopId]/page.tsx
//
// POS PIN login screen — shown AFTER the owner password gate
// has activated POS mode (terminal_session cookie is set).
//
// Flow:
//   ShopSidebar → ModeGate (owner password) → HERE (staff PIN)
//   → /pos/:shopId/terminal
//
// "End shift" in terminal → back HERE (no password needed)
// "Exit Mode" button HERE → ModeGate (owner password) → dashboard
//
// ── What changed ──────────────────────────────────────────
// The old version read minipos_device_key from localStorage
// and sent it as device_id in the PIN login POST body.
// This has been removed. The backend's pos-auth/login route
// accepts device_id as optional, and we deliberately omit it:
//
//   • The terminal_session cookie already identifies the
//     session context server-side.
//   • Sending a client-generated UUID as device_id would
//     not add security — any value could be fabricated.
//   • staff_mode_sessions records are created by the server
//     based on the authenticated PIN login, not client input.
//
// Backend routes:
//   GET  /api/shops/:shopId/pos-auth/staff-list  → staff grid
//   POST /api/shops/:shopId/pos-auth/login        → PIN submit
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import posApi from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
import { ModeGate } from "@/components/mode/ModeGate";
import type { PosStaffItem } from "@/types";

type Screen = "SELECT_STAFF" | "ENTER_PIN";

export default function PosLoginPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();

  const [screen, setScreen]         = useState<Screen>("SELECT_STAFF");
  const [staff, setStaff]           = useState<PosStaffItem[]>([]);
  const [selected, setSelected]     = useState<PosStaffItem | null>(null);
  const [pin, setPin]               = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake]           = useState(false);

  // "Exit Mode" gate — shown when owner wants to leave POS entirely
  const [showExitGate, setShowExitGate] = useState(false);

  useEffect(() => {
    async function fetchStaff() {
      setLoading(true);
      try {
        const { data } = await posApi.get<PosStaffItem[]>(
          `/api/shops/${shopId}/pos-auth/staff-list`
        );
        setStaff(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setError(getErrorMessage(err.response?.data?.message));
      } finally {
        setLoading(false);
      }
    }
    fetchStaff();
  }, [shopId]);

  function handleSelectStaff(member: PosStaffItem) {
    if (member.is_locked) {
      setError("Account locked. Contact a manager to reset.");
      return;
    }
    if (!member.has_pin) {
      setError("No PIN set. Ask a manager to set your PIN first.");
      return;
    }
    setSelected(member);
    setPin("");
    setError("");
    setScreen("ENTER_PIN");
  }

  function handlePinKey(digit: string) {
    if (pin.length >= 6) return;
    setError("");
    setPin((p) => p + digit);
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
    setError("");
  }

  async function submitPin(currentPin: string) {
    if (!selected || currentPin.length < 4) return;
    setSubmitting(true);
    try {
      // ── No device_id sent ────────────────────────────────
      // The server identifies the session via the terminal_session
      // HttpOnly cookie that was set during mode activation.
      // device_id is optional on the backend and intentionally
      // omitted here — we do not read from localStorage.
      await posApi.post(`/api/shops/${shopId}/pos-auth/login`, {
        user_id: selected.user_id,
        pin:     currentPin,
      });
      // Logged in — go to working terminal
      router.push(`/pos/${shopId}/terminal`);
    } catch (err: any) {
      const msg = getErrorMessage(err.response?.data?.message);
      setError(msg);
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }

  // Called when owner passes the exit password gate
  function handleExitConfirmed() {
    setShowExitGate(false);
    // ModeGate already hard-navigated to the dashboard.
    // onSuccess is called just to close the gate overlay.
  }

  function getInitials(name: string) {
    return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }

  // ── PIN entry screen ──────────────────────────────────────

  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center relative px-6">

        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setError(""); }}
          className="absolute top-6 left-6 text-[13px] text-white/60 hover:text-white/90 transition"
        >
          ← Back
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#0D7A5F] flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3">
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/50 text-[13px]">{selected.role}</p>
        </div>

        {/* Text input for PIN */}
        <div className={`w-[240px] mb-6 ${shake ? "animate-shake" : ""}`}>
          <input
            type="password"
            readOnly
            value={pin}
            placeholder="ENTER PIN"
            className="w-full h-16 bg-white/5 border-2 border-white/10 rounded-2xl text-center text-2xl tracking-[0.5em] text-white placeholder:text-white/10 placeholder:tracking-normal focus:outline-none focus:border-[#0D7A5F] transition-all"
          />
          {error && (
            <p className="text-[#FF6B6B] text-[12px] mt-3 text-center">
              {error}
            </p>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-[240px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePinKey(d)}
              className="h-16 rounded-2xl text-white text-[22px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin("")}
            className="h-16 rounded-2xl text-white/40 text-[12px] font-bold bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
          >
            CLEAR
          </button>
          <button
            onClick={() => handlePinKey("0")}
            className="h-16 rounded-2xl text-white text-[22px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="h-16 rounded-2xl text-white/60 bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-[20px]"
          >
            ⌫
          </button>
        </div>

        <button
          onClick={() => submitPin(pin)}
          disabled={submitting || pin.length < 4}
          className="mt-6 w-[240px] h-14 rounded-2xl text-[15px] font-bold uppercase tracking-wider text-white bg-[#0D7A5F] hover:bg-opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          {submitting ? "Verifying…" : "Sign In"}
        </button>
      </div>
    );
  }

  // ── Staff selection screen ────────────────────────────────

  return (
    <>
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center p-6 relative">

        {/*
          Exit Mode button — top-right corner.
          Only the owner/manager would know to click this.
          Requires password gate to prevent staff from exiting.
        */}
        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/30 hover:text-white/70 transition px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30"
        >
          Exit Mode
        </button>

        <div className="mb-8 text-center">
          <p className="text-white/50 text-[13px] uppercase tracking-widest mb-1">
            Point of Sale
          </p>
          <h1 className="text-white text-[26px] font-medium">Who are you?</h1>
          <p className="text-white/30 text-[13px] mt-1">
            Select your profile and enter your PIN
          </p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 bg-[#A32D2D]/20 border border-[#A32D2D]/40 rounded-lg">
            <p className="text-[#FF6B6B] text-[13px]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-28 h-36 rounded-xl bg-white/10 animate-pulse" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <p className="text-white/50 text-[14px]">
            No staff configured. Add staff in the dashboard and set their POS PIN.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center max-w-lg">
            {staff.map((member) => {
              const isDisabled = member.is_locked || !member.has_pin;
              return (
                <button
                  key={member.user_id}
                  onClick={() => handleSelectStaff(member)}
                  disabled={isDisabled}
                  className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 transition active:scale-95 ${
                    isDisabled
                      ? "bg-white/5 opacity-40 cursor-not-allowed"
                      : "bg-white/10 hover:bg-white/20 cursor-pointer"
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-[#0D7A5F] flex items-center justify-center text-white text-[16px] font-medium">
                    {getInitials(member.name)}
                  </div>
                  <div className="text-center">
                    <p className="text-white text-[13px] font-medium leading-tight">
                      {member.name.split(" ")[0]}
                    </p>
                    <p className="text-white/40 text-[11px]">{member.role}</p>
                  </div>
                  {member.is_locked && (
                    <p className="text-[#FF6B6B] text-[10px]">Locked</p>
                  )}
                  {!member.has_pin && !member.is_locked && (
                    <p className="text-white/40 text-[10px]">No PIN</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/*
        Exit Mode gate — requires owner/manager password.
        ModeGate handles navigation internally (hard redirect).
        onSuccess here just closes the gate overlay on the parent.
      */}
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