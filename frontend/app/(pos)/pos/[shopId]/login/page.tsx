"use client";
// =========================================================
// app/(pos)/pos/[shopId]/login/page.tsx
//
// Tablet-facing PIN login. Fetches staff list → shows names →
// staff taps name → enters 4-6 digit PIN → session starts.
// Device key is sent via x-device-key header (posApi).
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import posApi, { getOrCreateDeviceKey } from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
import type { PosStaffItem } from "@/types";

type Screen = "SELECT_STAFF" | "ENTER_PIN";

export default function PosLoginPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();

  const [screen, setScreen]       = useState<Screen>("SELECT_STAFF");
  const [staff, setStaff]         = useState<PosStaffItem[]>([]);
  const [selected, setSelected]   = useState<PosStaffItem | null>(null);
  const [pin, setPin]             = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shopName, setShopName]   = useState("");
  const [shake, setShake]         = useState(false);

  // Ensure device key exists
  useEffect(() => { getOrCreateDeviceKey(); }, []);

  // Fetch staff list
  useEffect(() => {
    async function fetchStaff() {
      try {
        const { data } = await posApi.get<{ staff: PosStaffItem[]; shop_name: string }>(
          `/api/pos/${shopId}/staff`
        );
        setStaff(data.staff);
        setShopName(data.shop_name);
      } catch (err: any) {
        setError(getErrorMessage(err.response?.data?.message));
      } finally { setLoading(false); }
    }
    fetchStaff();
  }, [shopId]);

  function handleSelectStaff(member: PosStaffItem) {
    if (member.is_locked) {
      setError("Account locked. Contact a manager.");
      return;
    }
    if (!member.has_pin) {
      setError("No PIN set. Ask a manager to set your PIN.");
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
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length >= 4) {
      // Auto-submit at 4 digits for 4-digit PINs, or wait for submit button
    }
  }

  function handlePinDelete() {
    setPin(p => p.slice(0, -1));
    setError("");
  }

  async function handlePinSubmit() {
    if (!selected || pin.length < 4) return;
    setSubmitting(true);
    try {
      await posApi.post(`/api/pos/${shopId}/login`, {
        user_id: selected.user_id,
        pin,
      });
      router.push(`/pos/${shopId}`);
    } catch (err: any) {
      const msg = getErrorMessage(err.response?.data?.message);
      setError(msg);
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally { setSubmitting(false); }
  }

  function getInitials(name: string) {
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  }

  // ── Full-screen PIN pad ───────────────────────────────────────────
  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center">
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

        {/* PIN dots */}
        <div className={`flex gap-3 mb-6 ${shake ? "animate-shake" : ""}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                i < pin.length
                  ? "bg-[#0D7A5F] scale-110"
                  : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-[#FF6B6B] text-[13px] mb-4 text-center max-w-[200px]">{error}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-[240px]">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePinKey(d)}
              className="h-16 rounded-xl text-white text-[22px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <div /> {/* empty cell */}
          <button
            onClick={() => handlePinKey("0")}
            className="h-16 rounded-xl text-white text-[22px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 transition"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="h-16 rounded-xl text-white/60 text-[18px] bg-white/10 hover:bg-white/20 active:scale-95 transition flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        {/* Enter button (for 4-6 digit PINs) */}
        {pin.length >= 4 && (
          <button
            onClick={handlePinSubmit}
            disabled={submitting}
            className="mt-5 w-[240px] h-12 rounded-xl text-[15px] font-medium text-white bg-[#0D7A5F] hover:bg-opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in →"}
          </button>
        )}
      </div>
    );
  }

  // ── Staff selection screen ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <p className="text-white/50 text-[13px] uppercase tracking-widest mb-1">Point of Sale</p>
        <h1 className="text-white text-[26px] font-medium">{shopName || "Loading…"}</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-[#A32D2D]/20 border border-[#A32D2D]/40 rounded-lg">
          <p className="text-[#FF6B6B] text-[13px]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="w-28 h-32 rounded-xl bg-white/10 animate-pulse" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <p className="text-white/50 text-[14px]">No staff configured. Add staff in the dashboard.</p>
      ) : (
        <div className="flex flex-wrap gap-3 justify-center max-w-lg">
          {staff.map((member) => (
            <button
              key={member.user_id}
              onClick={() => handleSelectStaff(member)}
              disabled={member.is_locked || !member.has_pin}
              className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 transition active:scale-95 ${
                member.is_locked || !member.has_pin
                  ? "bg-white/5 opacity-40 cursor-not-allowed"
                  : "bg-white/10 hover:bg-white/20 cursor-pointer"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-[#0D7A5F] flex items-center justify-center text-white text-[16px] font-medium">
                {getInitials(member.name)}
              </div>
              <div className="text-center">
                <p className="text-white text-[13px] font-medium leading-tight">{member.name.split(" ")[0]}</p>
                <p className="text-white/40 text-[11px]">{member.role}</p>
              </div>
              {member.is_locked && <p className="text-[#FF6B6B] text-[10px]">Locked</p>}
              {!member.has_pin && !member.is_locked && <p className="text-white/40 text-[10px]">No PIN</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}