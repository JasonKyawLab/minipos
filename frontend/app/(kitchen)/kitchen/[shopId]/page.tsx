"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams }               from "next/navigation";
import { DevicePendingScreen }                      from "@/components/terminal/DevicePendingScreen";
import { ModeGate }                                 from "@/components/mode/ModeGate";
import { getErrorMessage }                          from "@/utils/errorMessages";
import { getOrCreateDeviceKey } from "@/utils/deviceKey";

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRoleColour(role: KitchenRole): string {
  if (role === "OWNER")   return "bg-[#7C3AED]"; // purple
  if (role === "MANAGER") return "bg-[#D97706]"; // amber
  return "bg-[#0D7A5F]";                          // teal — CHEF
}

// Non-technical copy for kitchen staff — no mention of cookies or internals.
function getFriendlyDeviceMessage(code: string | undefined): string {
  if (code === "ERR_DEVICE_LOCKED_TO_MODE") {
    return "This device is already set up for something else.";
  }
  return getErrorMessage(code);
}

export default function KitchenLoginPage() {
  const { shopId }   = useParams<{ shopId: string }>();
  const searchParams = useSearchParams();

  const [screen, setScreen]         = useState<Screen>("LOADING");
  const [staff, setStaff]           = useState<KitchenStaffItem[]>([]);
  const [selected, setSelected]     = useState<KitchenStaffItem | null>(null);
  const [pin, setPin]               = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake]           = useState(false);
  const [pinError, setPinError]     = useState("");
  const [deviceError, setDeviceError]         = useState("");
  const [deviceErrorCode, setDeviceErrorCode] = useState<string | undefined>(undefined);

  const [showExitGate, setShowExitGate]               = useState(false);
  const [pendingDeviceKey, setPendingDeviceKey]       = useState<string | null>(null);
  const [showOwnerSetupModal, setShowOwnerSetupModal] = useState(false);

  // Registers the device as PENDING. If registration fails (e.g. stale mode cookie), surfaces a friendly error instead of the pending screen.
  const handleAutoRegister = useCallback(async (triggerCode: string) => {
    const deviceKey = getOrCreateDeviceKey(shopId);
    try {
      const res = await fetch(`${API_BASE}/api/shops/${shopId}/devices/register`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_key:  deviceKey,
          device_name: `Kitchen — ${navigator.userAgent.slice(0, 40)}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body.message as string | undefined;
        setDeviceErrorCode(code);
        setDeviceError(getFriendlyDeviceMessage(code ?? triggerCode));
        setScreen("SELECT_STAFF");
        return;
      }

      // Store key so DevicePendingScreen can show the Device ID to the owner
      setPendingDeviceKey(deviceKey);
      setScreen("DEVICE_PENDING");
    } catch {
      setDeviceErrorCode(triggerCode);
      setDeviceError(getFriendlyDeviceMessage(triggerCode));
      setScreen("SELECT_STAFF");
    }
  }, [shopId]);

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
        setDeviceErrorCode(code);
        setDeviceError(getFriendlyDeviceMessage(code));
        setScreen("SELECT_STAFF");
        return;
      }
      const data: KitchenStaffItem[] = await res.json();
      setStaff(Array.isArray(data) ? data : []);
      setScreen("SELECT_STAFF");
    } catch {
      setDeviceErrorCode(undefined);
      setDeviceError("Failed to load staff list. Please check your connection.");
      setScreen("SELECT_STAFF");
    }
  }, [shopId, handleAutoRegister]);

  // ?device_pending is set by ModeGate after activation — go straight to pending screen if present.
  useEffect(() => {
    const pendingKey = searchParams.get("device_pending");
    if (pendingKey) {
      setPendingDeviceKey(pendingKey);
      setScreen("DEVICE_PENDING");
      return;
    }
    const errorParam = searchParams.get("error");
    if (errorParam && DEVICE_ERROR_CODES.has(errorParam)) {
      setDeviceErrorCode(errorParam);
      setDeviceError(getFriendlyDeviceMessage(errorParam));
    }
    getOrCreateDeviceKey(shopId);
    fetchStaff();
  }, [searchParams, fetchStaff, shopId]);

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
      setPinError(`${member.name} has no Kitchen PIN.`);
      return;
    }
    setSelected(member);
    setPin("");
    setPinError("");
    setScreen("ENTER_PIN");
  }

  function handlePinKey(digit: string) {
    if (pin.length >= 6) return;
    setPinError("");
    setPin((p) => p + digit);
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
    setPinError("");
  }

  async function submitPin() {
    if (!selected || pin.length < 4) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/shops/${shopId}/kitchen-auth/login`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selected.user_id,
          pin,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body.message as string | undefined;

        if (code && DEVICE_ERROR_CODES.has(code)) {
          // Device was revoked or became unverified mid-session.
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

      const body = await res.json().catch(() => ({}));
      // kitchen_token is httpOnly — persist role/name/shopName in sessionStorage for the display page.
      sessionStorage.setItem(`minipos_kitchen_role_${shopId}`,      body.role     ?? "CHEF");
      sessionStorage.setItem(`minipos_kitchen_name_${shopId}`,      body.name     ?? selected.name);
      sessionStorage.setItem(`minipos_kitchen_shop_name_${shopId}`, body.shopName ?? "");
      sessionStorage.setItem(`minipos_kitchen_shift_start`, new Date().toISOString());

      // DO NOT replace this with router.push(). Full-page navigation
      // is required so the browser commits Set-Cookie before
      // middleware reads kitchen_token on the next request.
      window.location.href = `/kitchen/${shopId}/display`;

    } catch {
      setPinError("Failed to sign in. Please check your connection.");
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }

  function handleExitConfirmed() {
    setShowExitGate(false);
    // ERR_DEVICE_LOCKED_TO_MODE means staff hit "Reset this device" — retry registration rather than navigating away.
    if (deviceErrorCode === "ERR_DEVICE_LOCKED_TO_MODE") {
      setDeviceError("");
      setDeviceErrorCode(undefined);
      setScreen("LOADING");
      fetchStaff();
      return;
    }
    window.location.href = `/shops/${shopId}/dashboard`;
  }

  // ── RENDER: Device approval pending ───────────────────────
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

  // ── RENDER: Loading skeleton ───────────────────────────────
  if (screen === "LOADING") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-28 h-36 rounded-xl bg-white/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── RENDER: PIN entry numpad ───────────────────────────────
  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative px-6">
        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setPinError(""); }}
          className="absolute top-6 left-6 text-[13px] text-white/60 hover:text-white/90 transition"
        >
          ← Back
        </button>

        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full ${getRoleColour(selected.role)} flex items-center justify-center text-white text-[22px] font-medium mx-auto mb-3`}>
            {getInitials(selected.name)}
          </div>
          <p className="text-white text-[18px] font-medium">{selected.name}</p>
          <p className="text-white/50 text-[13px]">{selected.role}</p>
        </div>

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

        <button
          onClick={submitPin}
          disabled={submitting || pin.length < 4}
          className="mt-6 w-[240px] h-14 rounded-2xl text-[15px] font-bold uppercase tracking-wider text-white bg-[#D97706] disabled:opacity-30"
        >
          {submitting ? "Verifying…" : "Sign In"}
        </button>
      </div>
    );
  }

  // ── RENDER: Staff selection grid (default) ─────────────────
  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 relative">
        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/30 hover:text-white/70 transition px-3 py-1.5 rounded-lg border border-white/10"
        >
          Exit Mode
        </button>

        {/* Device couldn't register — show only the reset action, not a half-populated staff grid. */}
        {deviceErrorCode === "ERR_DEVICE_LOCKED_TO_MODE" ? (
          <div className="bg-[#1A1A1A] border border-[#D97706]/40 rounded-xl px-6 py-6 max-w-sm text-center">
            <p className="text-[#FBBF24] text-[15px] font-medium mb-2">This device needs a quick reset</p>
            <p className="text-white/60 text-[13px] mb-5 leading-relaxed">{deviceError}</p>
            <button
              onClick={() => setShowExitGate(true)}
              className="bg-[#D97706] hover:bg-[#B45F05] text-white text-[13px] font-medium px-5 py-2.5 rounded-lg transition w-full"
            >
              Reset this device
            </button>
            <p className="text-white/35 text-[12px] mt-3 leading-relaxed">
              Ask your manager or owner to enter their password to reset this device.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <p className="text-white/50 text-[13px] uppercase tracking-widest mb-1">Kitchen</p>
              <h1 className="text-white text-[26px] font-medium">Who are you?</h1>
            </div>

            {deviceError && (
              <div className="bg-[#1A1A1A] border border-[#D97706]/40 rounded-xl px-5 py-4 mb-4 text-center max-w-sm">
                <p className="text-[#FBBF24] text-[13px] font-medium mb-1">Something's not right</p>
                <p className="text-white/60 text-[13px]">{deviceError}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-center max-w-lg">
              {staff.map((member) => {
                const disabled = member.is_locked || (!member.has_pin && member.role !== "OWNER");
                const isOwnerNeedsSetup = member.role === "OWNER" && !member.has_pin;

                return (
                  <button
                    key={member.user_id}
                    onClick={() => handleSelectStaff(member)}
                    disabled={disabled}
                    className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 transition active:scale-95 ${
                      disabled
                        ? "bg-white/5 opacity-40 cursor-not-allowed"
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-full ${getRoleColour(member.role)} flex items-center justify-center text-white text-[16px] font-medium`}>
                      {getInitials(member.name)}
                    </div>
                    <div className="text-center">
                      <p className="text-white text-[13px] font-medium leading-tight">
                        {member.name.split(" ")[0]}
                      </p>
                      <p className="text-white/40 text-[11px]">{member.role}</p>
                    </div>
                    {isOwnerNeedsSetup && (
                      <p className="text-[#FBBF24] text-[10px] text-center font-medium">
                        Setup required
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {pinError && screen === "SELECT_STAFF" && (
              <p className="mt-5 text-[#FF9B9B] text-[13px] text-center max-w-xs leading-relaxed">
                {pinError}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Owner PIN setup modal ── */}
      {showOwnerSetupModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h3 className="text-[#0F2B4C] text-[18px] font-semibold mb-2">Kitchen PIN Required</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please configure your PIN in Dashboard → Staff Management before signing in.
            </p>
            <button
              onClick={() => setShowOwnerSetupModal(false)}
              className="w-full h-10 text-white bg-[#0F2B4C] rounded-xl font-medium text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Exit mode gate ── */}
      {showExitGate && (
        <ModeGate
          shopId={shopId}
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