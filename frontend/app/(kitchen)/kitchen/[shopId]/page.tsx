"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import kitchenApi, { getOrCreateDeviceKey } from "@/lib/kitchenApi";
import { getErrorMessage } from "@/utils/errorMessages";
import { ModeGate } from "@/components/mode/ModeGate";

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
  const [showExitGate, setShowExitGate] = useState(false);

  useEffect(() => {
    getOrCreateDeviceKey();
  }, []);

  useEffect(() => {
    async function fetchStaff() {
      setLoading(true);
      try {
        const { data } = await kitchenApi.get<KitchenStaffItem[]>(
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
      const deviceKey = localStorage.getItem("minipos_device_key");
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/login`, {
        user_id:   selected.user_id,
        pin:       pin,
        device_id: deviceKey ?? undefined,
      });
      router.push(`/kitchen/${shopId}/display`);
    } catch (err: any) {
      setError(getErrorMessage(err.response?.data?.message));
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }

  function handleExitConfirmed() {
    setShowExitGate(false);
    router.push(`/shops/${shopId}/dashboard`);
  }

  function getInitials(name: string) {
    return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }

  function getRoleColour(role: KitchenRole) {
    switch (role) {
      case "OWNER":   return "bg-[#534AB7]";
      case "MANAGER": return "bg-[#BA7517]";
      case "CHEF":    return "bg-[#0D7A5F]";
      default:        return "bg-[#5F5E5A]";
    }
  }

  // ── PIN entry screen ───────────────────────────────────────
  // bg-[#0A0A0A] — matches the kitchen display background
  // so there is no colour jump between the login and working screens.
  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative px-6">

        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setError(""); }}
          className="absolute top-6 left-6 text-[13px] text-white/40 hover:text-white/70 transition"
        >
          ← Back
        </button>

        {/* Staff avatar + name */}
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full ${getRoleColour(selected.role)} flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3`}>
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/40 text-[13px]">{selected.role}</p>
        </div>

        {/* PIN input display */}
        <div className={`w-[240px] mb-6 ${shake ? "animate-shake" : ""}`}>
          <input
            type="password"
            readOnly
            value={pin}
            placeholder="ENTER PIN"
            className="w-full h-16 bg-white/5 border-2 border-white/10 rounded-2xl text-center text-2xl tracking-[0.5em] text-white placeholder:text-white/10 placeholder:tracking-normal focus:outline-none focus:border-[#0D7A5F] transition-all"
          />
          {error && (
            <p className="text-[#FF6B6B] text-[12px] mt-3 text-center">{error}</p>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-[240px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handlePinKey(d)}
              className="h-16 rounded-2xl text-white text-[22px] font-medium bg-white/8 hover:bg-white/15 active:scale-95 transition-all"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin("")}
            className="h-16 rounded-2xl text-white/30 text-[12px] font-bold bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
          >
            CLEAR
          </button>
          <button
            onClick={() => handlePinKey("0")}
            className="h-16 rounded-2xl text-white text-[22px] font-medium bg-white/8 hover:bg-white/15 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="h-16 rounded-2xl text-white/50 bg-white/8 hover:bg-white/15 active:scale-95 transition-all flex items-center justify-center text-[20px]"
          >
            ⌫
          </button>
        </div>

        {/* Submit */}
        <button
          onClick={handlePinSubmit}
          disabled={submitting || pin.length < 4}
          className="mt-6 w-[240px] h-14 rounded-2xl text-[15px] font-bold uppercase text-white bg-[#0D7A5F] hover:bg-opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
        >
          {submitting ? "Verifying..." : "Sign In"}
        </button>
      </div>
    );
  }

  // ── Staff selection screen ─────────────────────────────────
  // bg-[#0A0A0A] — same dark base as kitchen display.
  // The "Who's cooking?" heading reinforces kitchen context
  // and the dark background signals night/kitchen environment.
  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 relative">

        {/* Exit Mode — subtle, top right */}
        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/25 hover:text-white/60 transition px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
        >
          Exit Mode
        </button>

        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-white/30 text-[11px] uppercase tracking-[0.2em] mb-1">
            Kitchen Display
          </p>
          <h1 className="text-white text-[26px] font-medium">Who&apos;s cooking?</h1>
        </div>

        {/* Staff grid */}
        {loading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-28 h-36 rounded-xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <p className="text-white/30 text-[14px]">
            No kitchen staff configured for this shop.
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
                  className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 border transition ${
                    isDisabled
                      ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed"
                      : "bg-white/8 border-white/10 hover:bg-white/15 hover:border-white/20 cursor-pointer active:scale-95"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full ${getRoleColour(member.role)} flex items-center justify-center text-white font-medium`}>
                    {getInitials(member.name)}
                  </div>
                  <p className="text-white text-[13px] font-medium leading-tight">
                    {member.name.split(" ")[0]}
                  </p>
                  <p className="text-white/30 text-[11px]">{member.role}</p>
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

        {/* Error message */}
        {error && (
          <p className="mt-4 text-[#FF6B6B] text-[13px] text-center">{error}</p>
        )}
      </div>

      {showExitGate && (
        <ModeGate
          shopId={shopId as string}
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