"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getErrorMessage } from "@/utils/errorMessages";
import { ModeGate } from "@/components/mode/ModeGate";
import { DevicePendingScreen } from "@/components/terminal/DevicePendingScreen";

type KitchenRole = "OWNER" | "MANAGER" | "CHEF";

interface KitchenStaffItem {
  user_id:   string;
  name:      string;
  role:      KitchenRole;
  has_pin:   boolean;
  is_locked: boolean;
}

type Screen = "LOADING" | "PENDING_APPROVAL" | "SELECT_STAFF" | "ENTER_PIN" | "DEVICE_PENDING";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const DEVICE_ERROR_CODES = new Set([
  "DEVICE_NOT_VERIFIED",
  "DEVICE_NOT_APPROVED",
  "DEVICE_VERIFICATION_UNAVAILABLE",
]);

// ── BUG FIX: Shop-scoped device key ───────────────────────
//
// PROBLEM (before):
//   The device key was stored under a single global key
//   "minipos_device_key" in localStorage. Opening Shop A's
//   kitchen login would generate a UUID, then opening Shop B's
//   kitchen login on the same browser would reuse that same UUID.
//
//   The backend stores devices scoped to a shop_id, so Shop A
//   and Shop B each got a row in shop_devices with the same
//   device_key value. Approving the device in Shop A's Permissions
//   dashboard had no effect on Shop B, and vice versa. More
//   confusingly, if you had already approved the key in Shop A,
//   opening Shop B would appear to "already be approved" before
//   the owner had ever seen Shop B's Permissions page.
//
// FIX:
//   Use a per-shop storage key: "minipos_device_key_{shopId}".
//   Each shop now generates and stores its own independent UUID.
//   One physical tablet serving two shops will appear as two
//   separate devices — one entry per shop in each Permissions
//   dashboard. This correctly models reality: the owner of each
//   shop must independently decide whether to trust this device.
//
// MIGRATION NOTE:
//   Old keys stored under "minipos_device_key" are abandoned.
//   On first load after this change, a new UUID is generated per
//   shop. Any previously-approved devices will need re-approval.
//   This is the correct behaviour — the old key was ambiguous.
//
function getOrCreateDeviceKey(shopId: string): string {
  if (typeof window === "undefined") return "";
  const storageKey = `minipos_device_key_${shopId}`;
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, key);
  }
  return key;
}

function isCardDisabled(member: KitchenStaffItem): boolean {
  if (member.is_locked) return true;
  if (member.role === "OWNER") return false;
  return !member.has_pin;
}

export default function KitchenLoginPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const searchParams = useSearchParams();

  const [screen, setScreen]             = useState<Screen>("LOADING");
  const [staff, setStaff]               = useState<KitchenStaffItem[]>([]);
  const [selected, setSelected]         = useState<KitchenStaffItem | null>(null);
  const [pin, setPin]                   = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [shake, setShake]               = useState(false);
  const [pinError, setPinError]         = useState("");
  const [deviceError, setDeviceError]   = useState("");
  const [showExitGate, setShowExitGate] = useState(false);
  const [pendingDeviceKey, setPendingDeviceKey]     = useState<string | null>(null);
  const [showOwnerSetupModal, setShowOwnerSetupModal] = useState(false);

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
    // Ensure device key exists for this shop before fetching staff.
    getOrCreateDeviceKey(shopId);
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // ── RENDER: Device Pending Screen ─────────────────────────
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

  async function fetchStaff() {
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
  }

  async function handleAutoRegister(triggerCode: string) {
    // Shop-scoped key ensures this device registers separately per shop.
    const deviceKey = getOrCreateDeviceKey(shopId);
    try {
      await fetch(
        `${API_BASE}/api/shops/${shopId}/devices/register`,
        {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_key:  deviceKey,
            device_name: `Kitchen — ${navigator.userAgent.slice(0, 40)}`,
          }),
        }
      );
      setScreen("PENDING_APPROVAL");
    } catch {
      setDeviceError(getErrorMessage(triggerCode));
      setScreen("SELECT_STAFF");
    }
  }

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

  function handlePinKey(digit: string) {
    if (pin.length >= 6) return;
    setPinError("");
    setPin((p) => p + digit);
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
    setPinError("");
  }

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

  // ── RENDER: Loading ──────────────────────────────────────

  if (screen === "LOADING") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-28 h-36 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── RENDER: Pending approval ─────────────────────────────

  if (screen === "PENDING_APPROVAL") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#BA7517]/15 border border-[#BA7517]/25 flex items-center justify-center mb-5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="12" stroke="#BA7517" strokeWidth="1.5" />
            <path d="M16 10v6l4 3" stroke="#BA7517" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-white/30 text-[11px] uppercase tracking-widest mb-2">
          Device Registered
        </p>
        <h1 className="text-white text-[22px] font-medium mb-3">
          Waiting for Approval
        </h1>
        <p className="text-white/30 text-[13px] max-w-xs leading-relaxed">
          This device has been registered and is waiting for the owner to approve it.
        </p>
        <div className="mt-6 bg-white/5 border border-white/10 rounded-xl px-5 py-4 max-w-xs text-left space-y-2">
          <p className="text-white/50 text-[12px] font-medium">Next steps:</p>
          <ol className="text-white/30 text-[12px] space-y-1 list-decimal list-inside">
            <li>Tell the owner to open the Dashboard</li>
            <li>Go to <span className="text-white/50">Permissions</span></li>
            <li>Approve this device</li>
            <li>Activate Kitchen mode from the sidebar</li>
          </ol>
        </div>
        <button
          onClick={() => fetchStaff()}
          className="mt-6 px-6 h-10 text-[13px] text-white/40 border border-white/10 rounded-xl hover:bg-white/5 transition"
        >
          Check again
        </button>
      </div>
    );
  }

  // ── RENDER: PIN entry ────────────────────────────────────

  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative px-6">
        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setPinError(""); }}
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
          {pinError && (
            <p className="text-[#FF6B6B] text-[12px] mt-3 text-center">{pinError}</p>
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

  // ── RENDER: Staff selection ──────────────────────────────

  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 relative">
        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/25 hover:text-white/60 transition px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
        >
          Exit Mode
        </button>

        <div className="mb-6 text-center">
          <p className="text-white/30 text-[11px] uppercase tracking-[0.2em] mb-1">
            Kitchen Display
          </p>
          <h1 className="text-white text-[26px] font-medium">Who&apos;s cooking?</h1>
          <p className="text-white/20 text-[12px] mt-1">
            Owners, Managers, and Chefs only
          </p>
        </div>

        {deviceError && (
          <div className="mb-5 w-full max-w-sm px-4 py-3 bg-[#BA7517]/15 border border-[#BA7517]/30 rounded-xl text-center">
            <p className="text-[#FBBF24] text-[13px] font-medium mb-0.5">
              Device not activated
            </p>
            <p className="text-[#FBBF24]/60 text-[12px] leading-relaxed">
              {deviceError}
            </p>
          </div>
        )}

        {staff.length === 0 && !deviceError ? (
          <NoStaffMessage reason="no_staff" />
        ) : (
          <>
            <div className="flex flex-wrap gap-3 justify-center max-w-lg">
              {staff.map((member) => {
                const disabled = isCardDisabled(member);
                const isOwnerNeedsSetup = member.role === "OWNER" && !member.has_pin;

                return (
                  <button
                    key={member.user_id}
                    onClick={() => handleSelectStaff(member)}
                    disabled={disabled}
                    className={`w-28 py-5 rounded-xl flex flex-col items-center gap-2 border transition ${
                      disabled
                        ? "bg-white/5 border-white/10 opacity-50 cursor-not-allowed"
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
                      <p className="text-[#FF6B6B] text-[10px] font-medium">🔒 Locked</p>
                    )}
                    {isOwnerNeedsSetup && (
                      <p className="text-[#FBBF24] text-[10px] text-center leading-tight px-1">
                        Setup required
                      </p>
                    )}
                    {!member.has_pin && !member.is_locked && member.role !== "OWNER" && (
                      <p className="text-white/40 text-[10px]">No PIN set</p>
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

      {/* Owner setup instructions modal */}
      {showOwnerSetupModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in overflow-hidden">
            <div className="bg-[#0A0A0A] px-6 py-5">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.5" />
                  <path d="M10 6v4M10 13h.01" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-white/40 text-[11px] uppercase tracking-widest mb-1">
                First-time setup
              </p>
              <p className="text-white text-[18px] font-semibold">
                Kitchen PIN not configured
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="text-[14px] text-[#5F5E5A] leading-relaxed mb-4">
                As the shop owner, you need to set up your Kitchen PIN before
                signing in here.
              </p>
              <div className="bg-[#F1EFE8] rounded-xl p-4 mb-5 space-y-2">
                <p className="text-[12px] text-[#5F5E5A] font-medium">How to set your Kitchen PIN:</p>
                <ol className="text-[12px] text-[#5F5E5A] space-y-1 list-decimal list-inside">
                  <li>Go to the Dashboard</li>
                  <li>Open <span className="font-medium text-[#0F2B4C]">Staff Management</span></li>
                  <li>Find your name and click <span className="font-medium text-[#0F2B4C]">Set Kitchen PIN</span></li>
                  <li>Return here to sign in</li>
                </ol>
              </div>
              <button
                onClick={() => setShowOwnerSetupModal(false)}
                className="w-full h-10 text-[13px] font-medium text-white bg-[#0A0A0A] rounded-xl hover:bg-[#1A1A1A] transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

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

function NoStaffMessage({ reason }: { reason: "no_staff" }) {
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