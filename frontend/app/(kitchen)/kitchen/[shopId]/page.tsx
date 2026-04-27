"use client";
// =========================================================
// app/(kitchen)/kitchen/[shopId]/page.tsx
//
// Kitchen staff PIN login screen.
// Mirrors the POS login flow but uses the kitchen auth routes.
//
// Backend routes used:
//   GET  /api/shops/:shopId/kitchen-auth/staff-list  → staff grid
//   POST /api/shops/:shopId/kitchen-auth/login        → PIN submit
//
// On success, the backend sets a kitchen_token httpOnly cookie.
// Redirects to /kitchen/[shopId]/display (the actual KDS).
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import posApi, { getOrCreateDeviceKey } from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";

// Kitchen staff have these roles (no CASHIER — they can't use kitchen)
type KitchenRole = "OWNER" | "MANAGER" | "CHEF";

interface KitchenStaffItem {
  user_id:   string;
  name:      string;
  role:      KitchenRole;
  has_pin:   boolean;
  is_locked: boolean;
}

type Screen = "SELECT_STAFF" | "ENTER_PIN";

export default function KitchenLoginPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();

  const [screen, setScreen]         = useState<Screen>("SELECT_STAFF");
  const [staff, setStaff]           = useState<KitchenStaffItem[]>([]);
  const [selected, setSelected]     = useState<KitchenStaffItem | null>(null);
  const [pin, setPin]               = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake]           = useState(false);

  useEffect(() => {
    getOrCreateDeviceKey();
  }, []);

  // Fetch kitchen-eligible staff list
  useEffect(() => {
    async function fetchStaff() {
      setLoading(true);
      try {
        // GET /api/shops/:shopId/kitchen-auth/staff-list
        // Returns OWNER, MANAGER, CHEF only (CASHIER excluded by backend)
        const { data } = await posApi.get<KitchenStaffItem[]>(
          `/api/shops/${shopId}/kitchen-auth/staff-list`
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

  function handleSelectStaff(member: KitchenStaffItem) {
    if (member.is_locked) {
      setError("Account locked. Contact a manager to reset.");
      return;
    }
    if (!member.has_pin) {
      setError("No kitchen PIN set. Set it in your profile first.");
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

  async function handlePinSubmit() {
    if (!selected || pin.length < 4) return;
    setSubmitting(true);
    try {
      // POST /api/shops/:shopId/kitchen-auth/login
      // Body: { user_id, pin, device_id? }
      // Backend sets kitchen_token httpOnly cookie on success
      const deviceKey = localStorage.getItem("minipos_device_key");
      await posApi.post(`/api/shops/${shopId}/kitchen-auth/login`, {
        user_id:   selected.user_id,
        pin,
        device_id: deviceKey ?? undefined,
      });
      // Redirect to the Kitchen Display System
      router.push(`/kitchen/${shopId}/display`);
    } catch (err: any) {
      const msg = getErrorMessage(err.response?.data?.message);
      setError(msg);
      setPin("");
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  // Role colour — visually distinguish CHEF from OWNER/MANAGER
  function getRoleColour(role: KitchenRole) {
    switch (role) {
      case "OWNER":   return "bg-[#534AB7]"; // purple
      case "MANAGER": return "bg-[#BA7517]"; // amber
      case "CHEF":    return "bg-[#0D7A5F]"; // teal
    }
  }

  // ── PIN entry screen ──────────────────────────────────────

  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative">
        <button
          onClick={() => {
            setScreen("SELECT_STAFF");
            setPin("");
            setError("");
          }}
          className="absolute top-6 left-6 text-[13px] text-white/50 hover:text-white/90 transition"
        >
          ← Back
        </button>

        {/* Staff avatar */}
        <div className="text-center mb-8">
          <div
            className={`w-16 h-16 rounded-full ${getRoleColour(selected.role)} flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3`}
          >
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/40 text-[13px] mt-0.5">{selected.role}</p>
        </div>

        {/* PIN dots */}
        <div className={`flex gap-3 mb-6 ${shake ? "animate-shake" : ""}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                i < pin.length ? "bg-[#0D7A5F] scale-110" : "bg-white/15"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-[#FF6B6B] text-[13px] mb-4 text-center max-w-[240px]">
            {error}
          </p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-[240px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePinKey(d)}
              className="h-16 rounded-xl text-white text-[22px] font-medium bg-white/8 hover:bg-white/15 active:scale-95 transition border border-white/10"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePinKey("0")}
            className="h-16 rounded-xl text-white text-[22px] font-medium bg-white/8 hover:bg-white/15 active:scale-95 transition border border-white/10"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="h-16 rounded-xl text-white/50 bg-white/8 hover:bg-white/15 active:scale-95 transition border border-white/10 flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        {pin.length >= 4 && (
          <button
            onClick={handlePinSubmit}
            disabled={submitting}
            className="mt-5 w-[240px] h-12 rounded-xl text-[15px] font-medium text-white bg-[#0D7A5F] hover:bg-opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Enter kitchen →"}
          </button>
        )}
      </div>
    );
  }

  // ── Staff selection screen ────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <p className="text-white/30 text-[11px] uppercase tracking-[0.2em] mb-1">
          Kitchen Display
        </p>
        <h1 className="text-white text-[26px] font-medium">Who's cooking?</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-[#A32D2D]/20 border border-[#A32D2D]/40 rounded-lg">
          <p className="text-[#FF6B6B] text-[13px]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-28 h-32 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="text-center space-y-2">
          <p className="text-white/40 text-[14px]">No kitchen staff configured.</p>
          <p className="text-white/25 text-[12px]">
            Add OWNER, MANAGER, or CHEF members in the dashboard.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 justify-center max-w-lg">
          {staff.map((member) => {
            const isDisabled = member.is_locked || !member.has_pin;
            return (
              <button
                key={member.user_id}
                onClick={() => handleSelectStaff(member)}
                disabled={isDisabled}
                className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 transition active:scale-95 border ${
                  isDisabled
                    ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed"
                    : "bg-white/8 border-white/10 hover:bg-white/15 cursor-pointer"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full ${getRoleColour(member.role)} flex items-center justify-center text-white text-[16px] font-medium`}
                >
                  {getInitials(member.name)}
                </div>
                <div className="text-center">
                  <p className="text-white text-[13px] font-medium leading-tight">
                    {member.name.split(" ")[0]}
                  </p>
                  <p className="text-white/30 text-[11px]">{member.role}</p>
                </div>
                {member.is_locked && (
                  <p className="text-[#FF6B6B] text-[10px]">Locked</p>
                )}
                {!member.has_pin && !member.is_locked && (
                  <p className="text-white/30 text-[10px]">No PIN</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}