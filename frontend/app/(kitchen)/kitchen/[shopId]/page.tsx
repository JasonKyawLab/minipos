"use client";

// =========================================================
// app/(kitchen)/kitchen/[shopId]/page.tsx
// Path: frontend/app/(kitchen)/kitchen/[shopId]/page.tsx
//
// DESIGN RULE: Layout, structure, and logic are IDENTICAL
// to the POS login page (app/(pos)/pos/[shopId]/page.tsx).
// The ONLY differences are colours:
//
//   Background:       #0A0A0A   (POS: #0F2B4C navy)
//   Submit button:    #D97706   (POS: #0D7A5F teal)
//   Filled PIN dot:   #D97706   (POS: #0D7A5F teal)
//   Avatar bg:        role-based (OWNER purple / MANAGER amber / CHEF teal)
//
// Everything else — card layout, numpad, PIN dots, error
// handling, device flow, exit gate — is pixel-for-pixel
// the same as POS.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams }               from "next/navigation";
import { DevicePendingScreen }                      from "@/components/terminal/DevicePendingScreen";
import { ModeGate }                                 from "@/components/mode/ModeGate";

// ── Types ─────────────────────────────────────────────────

type KitchenRole = "OWNER" | "MANAGER" | "CHEF";

type Screen =
  | "LOADING"
  | "SELECT_STAFF"
  | "ENTER_PIN"
  | "DEVICE_PENDING";

interface KitchenStaffItem {
  user_id:   string;
  name:      string;
  role:      KitchenRole;
  has_pin:   boolean;
  is_locked: boolean;
}

// ── Constants ─────────────────────────────────────────────

// Device-verification error codes from requireVerifiedDevice middleware
const DEVICE_ERROR_CODES = new Set([
  "DEVICE_NOT_VERIFIED",
  "DEVICE_NOT_APPROVED",
  "DEVICE_VERIFICATION_UNAVAILABLE",
]);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Helpers ───────────────────────────────────────────────

// Per-shop device key — prevents cross-shop permission bleed
function getOrCreateDeviceKey(shopId: string): string {
  const storageKey = `minipos_device_key_${shopId}`;
  const existing   = localStorage.getItem(storageKey);
  if (existing) return existing;
  const newKey = crypto.randomUUID();
  localStorage.setItem(storageKey, newKey);
  return newKey;
}

function getErrorMessage(code: string | undefined): string {
  const map: Record<string, string> = {
    DEVICE_NOT_VERIFIED:
      "This device is not activated. Ask the owner to approve it in Dashboard → Permissions.",
    DEVICE_NOT_APPROVED:
      "This device is awaiting approval. Ask the owner to approve it in Dashboard → Permissions.",
    DEVICE_VERIFICATION_UNAVAILABLE:
      "Device check temporarily unavailable. Please try again.",
    INVALID_CREDENTIALS: "Incorrect PIN. Please try again.",
    PIN_NOT_SET:         "No Kitchen PIN set. Ask a manager to set it in Dashboard → Staff.",
    PIN_LOCKED:          "Account locked. Contact a manager to unlock.",
    KITCHEN_NOT_IN_KITCHEN_MODE:
      "This device is not in Kitchen mode. Ask the owner to activate Kitchen mode.",
  };
  return map[code ?? ""] ?? "Something went wrong. Please try again.";
}

// Role-based avatar background — unique visual identity per role
function getRoleColour(role: KitchenRole): string {
  const map: Record<KitchenRole, string> = {
    OWNER:   "bg-[#534AB7]",  // purple
    MANAGER: "bg-[#BA7517]",  // amber
    CHEF:    "bg-[#0D7A5F]",  // teal
  };
  return map[role] ?? "bg-white/20";
}

function getInitials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function isCardDisabled(member: KitchenStaffItem): boolean {
  // Locked accounts and staff with no PIN set cannot log in
  return member.is_locked || (!member.has_pin && member.role !== "OWNER");
}

// ── Component ─────────────────────────────────────────────

export default function KitchenLoginPage() {
  const { shopId }   = useParams<{ shopId: string }>();
  const searchParams = useSearchParams();

  const [screen, setScreen]                     = useState<Screen>("LOADING");
  const [staff, setStaff]                       = useState<KitchenStaffItem[]>([]);
  const [selected, setSelected]                 = useState<KitchenStaffItem | null>(null);
  const [pin, setPin]                           = useState("");
  const [pinError, setPinError]                 = useState("");
  const [shake, setShake]                       = useState(false);
  const [submitting, setSubmitting]             = useState(false);
  const [deviceError, setDeviceError]           = useState<string | null>(null);
  const [pendingDeviceKey, setPendingDeviceKey] = useState<string | null>(null);
  const [showOwnerSetupModal, setShowOwnerSetupModal] = useState(false);
  const [showExitGate, setShowExitGate]         = useState(false);

  // ── Auto-registration ─────────────────────────────────────
  // Called when staff-list fetch returns DEVICE_NOT_VERIFIED/APPROVED.
  // Registers the device as PENDING, then shows DevicePendingScreen
  // which polls every 5s until the owner approves it in Permissions.
  const handleAutoRegister = useCallback(async (triggerCode: string) => {
    const deviceKey = getOrCreateDeviceKey(shopId);
    try {
      await fetch(`${API_BASE}/api/shops/${shopId}/devices/register`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_key:  deviceKey,
          device_name: `Kitchen — ${navigator.userAgent.slice(0, 40)}`,
        }),
      });
      // Store key so DevicePendingScreen can show the Device ID to the owner
      setPendingDeviceKey(deviceKey);
      setScreen("DEVICE_PENDING");
    } catch {
      setDeviceError(getErrorMessage(triggerCode));
      setScreen("SELECT_STAFF");
    }
  }, [shopId]);

  // ── Staff list fetch ──────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    setScreen("LOADING");
    try {
      const res = await fetch(
        `${API_BASE}/api/shops/${shopId}/kitchen-auth/staff-list`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body.message as string | undefined;
        if (code && DEVICE_ERROR_CODES.has(code)) {
          await handleAutoRegister(code);
          return;
        }
        setDeviceError(getErrorMessage(code));
        setScreen("SELECT_STAFF");
        return;
      }
      const data: KitchenStaffItem[] = await res.json();
      setStaff(Array.isArray(data) ? data : []);
      setScreen("SELECT_STAFF");
    } catch {
      setDeviceError("Failed to load staff list. Please check your connection.");
      setScreen("SELECT_STAFF");
    }
  }, [shopId, handleAutoRegister]);

  // ── Mount effect ──────────────────────────────────────────
  // Check ?device_pending param FIRST — set by ModeGate after activation.
  // If present, skip staff fetch and go straight to DevicePendingScreen.
  useEffect(() => {
    const pendingKey = searchParams.get("device_pending");
    if (pendingKey) {
      setPendingDeviceKey(pendingKey);
      setScreen("DEVICE_PENDING");
      return;
    }
    const errorParam = searchParams.get("error");
    if (errorParam && DEVICE_ERROR_CODES.has(errorParam)) {
      setDeviceError(getErrorMessage(errorParam));
    }
    getOrCreateDeviceKey(shopId);
    fetchStaff();
  }, [searchParams, fetchStaff, shopId]);

  // ── Staff card selection ──────────────────────────────────
  function handleSelectStaff(member: KitchenStaffItem) {
    if (member.is_locked) {
      setPinError(`${member.name} is locked. Contact a manager to unlock.`);
      return;
    }
    if (member.role === "OWNER" && !member.has_pin) {
      setShowOwnerSetupModal(true);
      return;
    }
    if (!member.has_pin) {
      setPinError(`${member.name} has no Kitchen PIN. Set it in Dashboard → Staff.`);
      return;
    }
    setSelected(member);
    setPin("");
    setPinError("");
    setScreen("ENTER_PIN");
  }

  // ── PIN keypad ────────────────────────────────────────────
  function handlePinKey(digit: string) {
    if (pin.length >= 6) return;
    setPinError("");
    setPin((p) => p + digit);
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
    setPinError("");
  }

  // ── PIN submission ────────────────────────────────────────
  // POST /kitchen-auth/login sets kitchen_token as HttpOnly cookie.
  // window.location.href (full reload) commits Set-Cookie before
  // Next.js middleware reads it on the new route — same as POS.
  // DO NOT replace with router.push().
  async function handlePinSubmit() {
    if (!selected || pin.length < 4) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/shops/${shopId}/kitchen-auth/login`,
        {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: selected.user_id, pin }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body.message as string | undefined;
        if (code && DEVICE_ERROR_CODES.has(code)) {
          await handleAutoRegister(code);
          setSelected(null);
          setPin("");
        } else {
          setPinError(getErrorMessage(code));
          setPin("");
          setShake(true);
          setTimeout(() => setShake(false), 500);
        }
        return;
      }
      window.location.href = `/kitchen/${shopId}/display`;
    } catch {
      setPinError("Login failed. Please check your connection.");
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  // ── Device Pending ────────────────────────────────────────
  if (screen === "DEVICE_PENDING" && pendingDeviceKey) {
    return (
      <DevicePendingScreen
        shopId={shopId}
        deviceKey={pendingDeviceKey}
        mode="KITCHEN"
        onApproved={() => {
          window.history.replaceState({}, "", `/kitchen/${shopId}`);
          setPendingDeviceKey(null);
          setScreen("LOADING");
          fetchStaff();
        }}
      />
    );
  }

  // ── PIN Entry ─────────────────────────────────────────────
  // Identical layout to POS ENTER_PIN screen.
  // Only difference: submit button and filled dot use #D97706 (amber)
  // instead of #0D7A5F (teal), and page bg is #0A0A0A instead of #0F2B4C.
  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative px-6">

        {/* ← Back — identical to POS */}
        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setPinError(""); }}
          className="absolute top-6 left-6 text-[13px] text-white/60 hover:text-white/90 transition"
        >
          ← Back
        </button>

        {/* Staff avatar + name — identical to POS */}
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full ${getRoleColour(selected.role)} flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3`}>
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/50 text-[13px]">{selected.role}</p>
        </div>

        {/* PIN text input — readOnly, fed by the numpad below.
            Same as POS: password type so digits show as bullets.
            Focus border colour: #D97706 amber  (POS: #0D7A5F teal) */}
        <div className={`w-[240px] mb-6 ${shake ? "animate-shake" : ""}`}>
          <input
            type="password"
            readOnly
            value={pin}
            placeholder="ENTER KITCHEN PIN"
            className="w-full h-16 bg-white/5 border-2 border-white/10 rounded-2xl text-center text-2xl tracking-[0.5em] text-white placeholder:text-white/10 placeholder:text-[12px] placeholder:tracking-normal focus:outline-none focus:border-[#D97706] transition-all"
          />
          {pinError && (
            <p className="text-[#FF6B6B] text-[12px] mt-3 text-center">{pinError}</p>
          )}
        </div>

        {/* Numpad — identical layout to POS: 1-9 grid, then CLEAR / 0 / ⌫ */}
        <div className="grid grid-cols-3 gap-3 w-[240px]">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
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

        {/* Submit button — colour: #D97706 amber  (POS: #0D7A5F teal) */}
        <button
          onClick={handlePinSubmit}
          disabled={pin.length < 4 || submitting}
          className="mt-6 w-[240px] h-14 rounded-2xl text-[15px] font-bold uppercase tracking-wider text-white bg-[#D97706] hover:bg-[#B45309] active:scale-[0.98] transition-all disabled:opacity-30"
        >
          {submitting ? "Verifying…" : "Sign In"}
        </button>
      </div>
    );
  }

  // ── Staff Selection Grid ──────────────────────────────────
  // Identical layout to POS SELECT_STAFF screen.
  // Only difference: page bg is #0A0A0A (POS: #0F2B4C),
  // and the header label reads "Kitchen" (POS: "Point of Sale").
  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 relative">

        {/* Exit Mode button — identical position/style to POS */}
        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/30 hover:text-white/70 transition px-3 py-1.5 rounded-lg border border-white/10"
        >
          Exit Mode
        </button>

        {/* Header — identical to POS, label changed to "Kitchen" */}
        <div className="mb-6 text-center">
          <p className="text-white/50 text-[13px] uppercase tracking-widest mb-1">Kitchen</p>
          <h1 className="text-white text-[26px] font-medium">Who are you?</h1>
        </div>

        {/* Device error banner — identical to POS */}
        {deviceError && (
          <div className="mb-5 w-full max-w-sm px-4 py-3 bg-[#BA7517]/20 border border-[#BA7517]/40 rounded-xl text-center">
            <p className="text-[#FBBF24] text-[13px] font-medium">Device not activated</p>
            <p className="text-[#FBBF24]/70 text-[12px]">{deviceError}</p>
          </div>
        )}

        {/* Loading spinner — identical to POS */}
        {screen === "LOADING" && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <p className="text-white/30 text-[13px]">Loading staff…</p>
          </div>
        )}

        {/* Staff grid — identical layout/card size to POS (flex-wrap, w-28) */}
        {screen === "SELECT_STAFF" && (
          <>
            {staff.length === 0 && !deviceError ? (
              <NoStaffMessage />
            ) : (
              <>
                <div className="flex flex-wrap gap-3 justify-center max-w-lg">
                  {staff.map((member) => {
                    const disabled          = isCardDisabled(member);
                    const isOwnerNeedsSetup = member.role === "OWNER" && !member.has_pin;
                    return (
                      <button
                        key={member.user_id}
                        onClick={() => handleSelectStaff(member)}
                        disabled={disabled}
                        className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 border transition active:scale-95 ${
                          disabled
                            ? "bg-white/5 border-white/10 opacity-40 cursor-not-allowed"
                            : "bg-white/10 border-white/10 hover:bg-white/20 cursor-pointer"
                        }`}
                      >
                        {/* Role-colour avatar — same palette as POS avatars */}
                        <div className={`w-12 h-12 rounded-full ${getRoleColour(member.role)} flex items-center justify-center text-white text-[16px] font-medium`}>
                          {getInitials(member.name)}
                        </div>
                        <div className="text-center">
                          <p className="text-white text-[13px] font-medium leading-tight">
                            {member.name.split(" ")[0]}
                          </p>
                          <p className="text-white/40 text-[11px]">{member.role}</p>
                        </div>
                        {member.is_locked && (
                          <p className="text-[#FF6B6B] text-[10px] font-medium">🔒 Locked</p>
                        )}
                        {isOwnerNeedsSetup && (
                          <p className="text-[#FBBF24] text-[10px] text-center font-medium">
                            Setup required
                          </p>
                        )}
                        {!member.has_pin && !member.is_locked && member.role !== "OWNER" && (
                          <p className="text-white/30 text-[10px]">No PIN set</p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* PIN error below the grid — identical to POS */}
                {pinError && (
                  <p className="mt-5 text-[#FF9B9B] text-[13px] text-center max-w-xs leading-relaxed">
                    {pinError}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Owner Kitchen PIN setup modal ── */}
      {showOwnerSetupModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h3 className="text-[#0F2B4C] text-[18px] font-semibold mb-2">Kitchen PIN Required</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please configure your Kitchen PIN in Dashboard → Staff Management before signing in.
            </p>
            <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1 mb-5">
              <li>Go to the Dashboard</li>
              <li>Open <span className="font-medium text-[#0F2B4C]">Staff Management</span></li>
              <li>Find your name → click <span className="font-medium text-[#0F2B4C]">Set Kitchen PIN</span></li>
              <li>Return here to sign in</li>
            </ol>
            <button
              onClick={() => setShowOwnerSetupModal(false)}
              className="w-full h-10 text-white bg-[#0F2B4C] rounded-xl font-medium text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Exit mode gate — identical to POS ── */}
      {showExitGate && (
        <ModeGate
          shopId={shopId as string}
          shopName=""
          mode="KITCHEN"
          action="exit"
          allowCancel={true}
          onSuccess={() => setShowExitGate(false)}
          onCancel={() => setShowExitGate(false)}
        />
      )}
    </>
  );
}

// ── Sub-component ─────────────────────────────────────────

function NoStaffMessage() {
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
      <p className="text-white/60 text-[15px] font-medium mb-2">No kitchen staff found</p>
      <p className="text-white/25 text-[13px] leading-relaxed">
        Assign at least one staff member the{" "}
        <span className="text-[#0D7A5F]">Chef</span>,{" "}
        <span className="text-[#BA7517]">Manager</span>, or{" "}
        <span className="text-[#534AB7]">Owner</span> role.
      </p>
      <p className="text-white/15 text-[12px] mt-3">
        Go to Dashboard → Staff to assign roles.
      </p>
    </div>
  );
}