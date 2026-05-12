"use client";
// =========================================================
// app/(kitchen)/kitchen/[shopId]/page.tsx
//
// FIX: Staff appear but are invisible/disabled when no
// Kitchen PINs are set. Added a "no eligible staff" state
// that explains what to do instead of showing ghost cards.
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
    async function fetchStaff() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE}/api/shops/${shopId}/kitchen-auth/staff-list`,
          { credentials: "include" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "FETCH_FAILED");
        }
        const data: KitchenStaffItem[] = await res.json();
        setStaff(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setError(getErrorMessage(err.message));
      } finally {
        setLoading(false);
      }
    }
    fetchStaff();
  }, [shopId]);

  function handleSelectStaff(member: KitchenStaffItem) {
    if (member.is_locked) {
      setError(`${member.name} is locked. Contact a manager to unlock.`);
      return;
    }
    if (!member.has_pin) {
      setError(`${member.name} has no Kitchen PIN. Set it in Dashboard → Staff.`);
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
      const res = await fetch(
        `${API_BASE}/api/shops/${shopId}/kitchen-auth/login`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: selected.user_id,
            pin,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "LOGIN_FAILED");
      }

      router.push(`/kitchen/${shopId}/display`);
    } catch (err: any) {
      setError(getErrorMessage(err.message));
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }

  function handleExitConfirmed() {
    setShowExitGate(false);
  }

  function getInitials(name: string) {
    return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }

  function getRoleColour(role: KitchenRole) {
    const colours: Record<KitchenRole, string> = {
      OWNER:   "bg-[#534AB7]",
      MANAGER: "bg-[#BA7517]",
      CHEF:    "bg-[#0D7A5F]",
    };
    return colours[role] ?? "bg-[#5F5E5A]";
  }

  // ── Derived state ─────────────────────────────────────────
  // Staff who can actually log in (have a PIN and are not locked)
  const readyStaff    = staff.filter(m => m.has_pin && !m.is_locked);
  const lockedStaff   = staff.filter(m => m.is_locked);
  const noPinStaff    = staff.filter(m => !m.has_pin && !m.is_locked);
  const allUnavailable = staff.length > 0 && readyStaff.length === 0;

  // ── PIN entry screen ───────────────────────────────────────
  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative px-6">

        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setError(""); }}
          className="absolute top-6 left-6 text-[13px] text-white/40 hover:text-white/70 transition"
        >
          ← Back
        </button>

        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full ${getRoleColour(selected.role)} flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3`}>
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/40 text-[13px]">{selected.role}</p>
        </div>

        <div className={`w-[240px] mb-6 ${shake ? "animate-shake" : ""}`}>
          <input
            type="password"
            readOnly
            value={pin}
            placeholder="ENTER KITCHEN PIN"
            className="w-full h-16 bg-white/5 border-2 border-white/10 rounded-2xl text-center text-2xl tracking-[0.5em] text-white placeholder:text-white/10 placeholder:text-[12px] placeholder:tracking-normal focus:outline-none focus:border-[#0D7A5F] transition-all"
          />
          {error && (
            <p className="text-[#FF6B6B] text-[12px] mt-3 text-center">{error}</p>
          )}
        </div>

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

        <button
          onClick={handlePinSubmit}
          disabled={submitting || pin.length < 4}
          className="mt-6 w-[240px] h-14 rounded-2xl text-[15px] font-bold uppercase text-white bg-[#0D7A5F] hover:bg-opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
        >
          {submitting ? "Verifying…" : "Sign In"}
        </button>
      </div>
    );
  }

  // ── Staff selection screen ─────────────────────────────────
  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 relative">

        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/25 hover:text-white/60 transition px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
        >
          Exit Mode
        </button>

        <div className="mb-8 text-center">
          <p className="text-white/30 text-[11px] uppercase tracking-[0.2em] mb-1">
            Kitchen Display
          </p>
          <h1 className="text-white text-[26px] font-medium">Who&apos;s cooking?</h1>
          <p className="text-white/20 text-[12px] mt-1">
            Owners, Managers, and Chefs only
          </p>
        </div>

        {/* Fetch error (network failure, shop not found, etc.) */}
        {error && !loading && staff.length === 0 && (
          <div className="mb-4 px-4 py-2 bg-[#A32D2D]/20 border border-[#A32D2D]/40 rounded-lg max-w-xs text-center">
            <p className="text-[#FF6B6B] text-[13px]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-28 h-36 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>

        ) : staff.length === 0 ? (
          // No staff at all in this shop with kitchen-eligible roles
          <NoStaffMessage reason="no_staff" />

        ) : allUnavailable ? (
          // Staff exist but nobody can log in (all locked or no PIN)
          <NoStaffMessage
            reason="no_pins"
            lockedCount={lockedStaff.length}
            noPinCount={noPinStaff.length}
          />

        ) : (
          <>
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
                        ? "bg-white/5 border-white/10 opacity-50 cursor-not-allowed"
                        : "bg-white/8 border-white/10 hover:bg-white/15 hover:border-white/20 cursor-pointer active:scale-95"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-full ${getRoleColour(member.role)} flex items-center justify-center text-white font-medium ${isDisabled ? "opacity-60" : ""}`}>
                      {getInitials(member.name)}
                    </div>
                    <p className="text-white text-[13px] font-medium leading-tight">
                      {member.name.split(" ")[0]}
                    </p>
                    <p className="text-white/30 text-[11px]">{member.role}</p>
                    {member.is_locked && (
                      <p className="text-[#FF6B6B] text-[10px] font-medium">🔒 Locked</p>
                    )}
                    {!member.has_pin && !member.is_locked && (
                      <p className="text-white/40 text-[10px]">No PIN set</p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Inline tap error (e.g. clicked a locked card) */}
            {error && (
              <p className="mt-5 text-[#FF9B9B] text-[13px] text-center max-w-xs leading-relaxed">
                {error}
              </p>
            )}
          </>
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

// ── Helper: No staff / no usable staff messages ───────────
function NoStaffMessage({
  reason,
  lockedCount = 0,
  noPinCount = 0,
}: {
  reason: "no_staff" | "no_pins";
  lockedCount?: number;
  noPinCount?: number;
}) {
  return (
    <div className="max-w-xs text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 14a5 5 0 100-10 5 5 0 000 10zM6 26c0-5.5 4.5-10 10-10s10 4.5 10 10"
            stroke="white"
            strokeWidth="1.5"
            strokeOpacity="0.3"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {reason === "no_staff" ? (
        <>
          <p className="text-white/60 text-[15px] font-medium mb-2">
            No kitchen staff found
          </p>
          <p className="text-white/25 text-[13px] leading-relaxed">
            Kitchen mode requires at least one staff member with the{" "}
            <span className="text-[#0D7A5F]">Chef</span>,{" "}
            <span className="text-[#BA7517]">Manager</span>, or{" "}
            <span className="text-[#534AB7]">Owner</span> role.
          </p>
          <p className="text-white/15 text-[12px] mt-3">
            Go to Dashboard → Staff to assign roles.
          </p>
        </>
      ) : (
        <>
          <p className="text-white/60 text-[15px] font-medium mb-2">
            No one can sign in right now
          </p>
          <div className="text-white/25 text-[13px] leading-relaxed space-y-1.5">
            {noPinCount > 0 && (
              <p>
                <span className="text-white/50">{noPinCount} staff member{noPinCount > 1 ? "s have" : " has"} no Kitchen PIN.</span>
              </p>
            )}
            {lockedCount > 0 && (
              <p>
                <span className="text-[#FF6B6B]/70">{lockedCount} account{lockedCount > 1 ? "s are" : " is"} locked.</span>
              </p>
            )}
          </div>
          <p className="text-white/15 text-[12px] mt-3">
            Go to Dashboard → Staff to set Kitchen PINs or unlock accounts.
          </p>
        </>
      )}
    </div>
  );
}