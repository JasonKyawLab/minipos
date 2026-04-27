"use client";
// =========================================================
// app/(pos)/pos/[shopId]/page.tsx
//
// Tablet PIN login screen.
//
// Backend routes:
//   GET  /api/shops/:shopId/pos-auth/staff-list  → staff grid
//   POST /api/shops/:shopId/pos-auth/login        → PIN submit
//
// On success: pos_token cookie is set, redirect to /terminal.
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import posApi, { getOrCreateDeviceKey } from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
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

  useEffect(() => {
    getOrCreateDeviceKey();
  }, []);

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
      const deviceKey = localStorage.getItem("minipos_device_key");
      await posApi.post(`/api/shops/${shopId}/pos-auth/login`, {
        user_id:   selected.user_id,
        pin:       currentPin,
        device_id: deviceKey ?? undefined,
      });
      
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

  function getInitials(name: string) {
    return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }

  // ── PIN entry screen ──────────────────────────────────────

  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center relative">
        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setError(""); }}
          className="absolute top-6 left-6 text-[13px] text-white/60 hover:text-white/90 transition"
        >
          ← Back
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#0D7A5F] flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3">
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/50 text-[13px] mt-0.5">{selected.role}</p>
        </div>

        {/* PIN dots — always show 6 slots */}
        <div className={`flex gap-3 mb-6 ${shake ? "animate-shake" : ""}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                i < pin.length ? "bg-[#0D7A5F] scale-110" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-[#FF6B6B] text-[13px] mb-4 text-center max-w-[240px]">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 w-[240px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePinKey(d)}
              className="h-16 rounded-xl text-white text-[22px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePinKey("0")}
            className="h-16 rounded-xl text-white text-[22px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 transition"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="h-16 rounded-xl text-white/60 bg-white/10 hover:bg-white/20 active:scale-95 transition flex items-center justify-center text-[20px]"
          >
            ⌫
          </button>
        </div>

        {/*
          Submit button logic:
          - PIN is 4–6 digits (backend enforces this)
          - We don't know if a staff member set a 4, 5, or 6 digit PIN
          - Show the button once 4 digits are entered (minimum valid length)
          - User can keep typing up to 6 digits before pressing enter
          - This matches how ATMs work — enter your PIN length, then confirm
        */}
        {pin.length >= 4 && (
          <button
            onClick={() => submitPin(pin)}
            disabled={submitting}
            className="mt-5 w-[240px] h-12 rounded-xl text-[15px] font-medium text-white bg-[#0D7A5F] hover:bg-opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            {submitting ? "Signing in…" : `Sign in (${pin.length} digits) →`}
          </button>
        )}
      </div>
    );
  }

  // ── Staff selection screen ────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <p className="text-white/50 text-[13px] uppercase tracking-widest mb-1">
          Point of Sale
        </p>
        <h1 className="text-white text-[26px] font-medium">Who are you?</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-[#A32D2D]/20 border border-[#A32D2D]/40 rounded-lg">
          <p className="text-[#FF6B6B] text-[13px]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-28 h-32 rounded-xl bg-white/10 animate-pulse" />
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
  );
}