"use client";
// =========================================================
// app/(pos)/pos/[shopId]/login/page.tsx
// Path: frontend/app/(pos)/pos/[shopId]/login/page.tsx
//
// SECURITY MODEL — "burn the ships"
// ─────────────────────────────────────────────────────────
// After a successful PIN login the backend sets a pos_token
// HttpOnly cookie. This page does NOT read, store, or pass
// any session data to the terminal page.
//
// The terminal page (terminal/page.tsx) is responsible for
// fetching its own session by calling GET /pos-auth/me using
// the pos_token cookie. No data crosses the client-storage
// boundary at any point.
//
// WHY window.location.href instead of router.push()
// ─────────────────────────────────────────────────────────
// router.push() is a client-side navigation. It fires before
// the browser has committed the Set-Cookie header from the
// Axios response into the cookie jar. When Next.js middleware
// runs on the new route it reads an empty pos_token and
// redirects back to this page — an infinite loop.
//
// window.location.href forces a full HTTP round-trip. The
// browser commits all pending Set-Cookie headers first, then
// sends the new GET request. Middleware sees pos_token and
// allows the navigation through. Kitchen mode uses the same
// pattern — that is why it works.
//
// PREREQUISITE — next.config.ts proxy
// ─────────────────────────────────────────────────────────
// pos_token is set by the Express backend on localhost:3001.
// Next.js middleware runs on localhost:5173. Cookies are
// origin-scoped by the browser, so middleware can NEVER read
// a cookie set by a different origin.
//
// The next.config.ts rewrites proxy routes all /api/* calls
// through Next.js so the Set-Cookie lands on the same origin
// the browser uses for navigation. Without that proxy this
// page cannot fix the redirect loop no matter what.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams }               from "next/navigation";
import posApi              from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
import { ModeGate }        from "@/components/mode/ModeGate";
import type { PosStaffItem } from "@/types";
import { DevicePendingScreen } from "@/components/terminal/DevicePendingScreen";

// ── No session imports ────────────────────────────────────
// usePosSession is intentionally absent. This page does not
// touch PosContext at all — the terminal page owns that
// responsibility via its /me fetch on mount.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const DEVICE_ERROR_CODES = new Set([
  "DEVICE_NOT_VERIFIED",
  "DEVICE_NOT_APPROVED",
  "DEVICE_VERIFICATION_UNAVAILABLE",
]);

type Screen = "LOADING" | "PENDING_APPROVAL" | "SELECT_STAFF" | "ENTER_PIN" | "DEVICE_PENDING";

// ── Per-shop device key ────────────────────────────────────
//
// Uses a per-shop storage key "minipos_device_key_{shopId}".
// One browser tab serving two shops generates two independent
// UUIDs — one entry per shop in each Permissions dashboard.
// This prevents cross-shop device identity bleed.
function getOrCreateDeviceKey(shopId: string): string {
  if (typeof window === "undefined") return "";
  const storageKey = `minipos_device_key_${shopId}`;
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, key);
  }
  return key;
}

function isCardDisabled(member: PosStaffItem): boolean {
  if (member.is_locked) return true;
  if (member.role === "OWNER") return false;
  return !member.has_pin;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PosLoginPage() {
  const { shopId }   = useParams<{ shopId: string }>();
  const searchParams = useSearchParams();

  const [screen, setScreen]         = useState<Screen>("LOADING");
  const [staff, setStaff]           = useState<PosStaffItem[]>([]);
  const [selected, setSelected]     = useState<PosStaffItem | null>(null);
  const [pin, setPin]               = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake]           = useState(false);
  const [pinError, setPinError]     = useState("");
  const [deviceError, setDeviceError] = useState("");

  const [showExitGate, setShowExitGate]             = useState(false);
  const [pendingDeviceKey, setPendingDeviceKey]     = useState<string | null>(null);
  const [showOwnerSetupModal, setShowOwnerSetupModal] = useState(false);

  // ── Auto-register unrecognised device ────────────────────
  //
  // If requireVerifiedDevice returns DEVICE_NOT_VERIFIED or
  // DEVICE_NOT_APPROVED we register the device and show the
  // "waiting for approval" screen. The owner then approves
  // from the Permissions dashboard and activates POS mode,
  // which sets the terminal_id cookie server-side.
  const handleAutoRegister = useCallback(
    async (triggerCode: string) => {
      const deviceKey = getOrCreateDeviceKey(shopId);
      try {
        await fetch(`${API_BASE}/api/shops/${shopId}/devices/register`, {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_key:  deviceKey,
            device_name: `POS — ${navigator.userAgent.slice(0, 40)}`,
          }),
        });
        setScreen("PENDING_APPROVAL");
      } catch {
        setDeviceError(getErrorMessage(triggerCode));
        setScreen("SELECT_STAFF");
      }
    },
    [shopId]
  );

  // ── Fetch staff list ──────────────────────────────────────
  //
  // Calls GET /pos-auth/staff-list which is protected by
  // requireVerifiedDevice. If the device is not yet registered
  // or approved the request returns 403 and we auto-register.
  const fetchStaff = useCallback(async () => {
    setScreen("LOADING");
    try {
      const { data } = await posApi.get<PosStaffItem[]>(
        `/api/shops/${shopId}/pos-auth/staff-list`
      );
      setStaff(Array.isArray(data) ? data : []);
      setScreen("SELECT_STAFF");
    } catch (err: any) {
      const code = err.response?.data?.message as string | undefined;
      if (code && DEVICE_ERROR_CODES.has(code)) {
        await handleAutoRegister(code);
      } else {
        setDeviceError(getErrorMessage(code));
        setScreen("SELECT_STAFF");
      }
    }
  }, [shopId, handleAutoRegister]);

  // ── Mount effect ──────────────────────────────────────────
  useEffect(() => {
    // Device was just registered and is waiting for approval.
    // URL contains ?device_pending=<deviceId> from ModeGate.
    const pendingKey = searchParams.get("device_pending");
    if (pendingKey) {
      setPendingDeviceKey(pendingKey);
      setScreen("DEVICE_PENDING");
      return;
    }

    // Device verification failed at the middleware level before
    // even reaching this page (e.g. revoked device).
    const errorParam = searchParams.get("error");
    if (errorParam && DEVICE_ERROR_CODES.has(errorParam)) {
      setDeviceError(getErrorMessage(errorParam));
    }

    // Ensure a device key exists for this shop in localStorage
    // before the staff-list fetch triggers auto-registration.
    getOrCreateDeviceKey(shopId);
    fetchStaff();
  }, [searchParams, fetchStaff, shopId]);

  // ── Staff card selection ──────────────────────────────────
  function handleSelectStaff(member: PosStaffItem) {
    if (member.is_locked) {
      setPinError("Account locked. Contact a manager to reset.");
      return;
    }
    if (member.role === "OWNER" && !member.has_pin) {
      setShowOwnerSetupModal(true);
      return;
    }
    if (!member.has_pin) {
      setPinError("No PIN set. Ask a manager to set your PIN first.");
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

  // ── PIN submission ────────────────────────────────────────
  //
  // SECURITY: this function does NOT write anything to
  // sessionStorage, localStorage, or any other client storage.
  //
  // Flow:
  //   1. POST /pos-auth/login — backend validates PIN and sets
  //      pos_token as an HttpOnly cookie on the response.
  //   2. We navigate to /pos/:shopId/terminal via a full-page
  //      reload (window.location.href). The browser commits
  //      the Set-Cookie header before sending the new request.
  //   3. Next.js middleware reads pos_token from the cookie
  //      jar on that request and allows the route through.
  //   4. The terminal page mounts and calls GET /pos-auth/me
  //      to fetch session data directly from the backend using
  //      the pos_token cookie. No client-side handoff needed.
  //
  // WHY NOT router.push():
  //   Client-side navigation does not guarantee the browser
  //   has flushed Set-Cookie before middleware runs on the
  //   prefetched route. This causes a redirect loop.
  async function submitPin() {
    if (!selected || pin.length < 4) return;
    setSubmitting(true);
    try {
      // Login request — the ONLY thing this does is set the
      // pos_token HttpOnly cookie. We do not read the response
      // body. The terminal page fetches its own session data.
      await posApi.post(
        `/api/shops/${shopId}/pos-auth/login`,
        {
          user_id: selected.user_id,
          pin,
        }
      );

      // Full-page navigation — commits the Set-Cookie header
      // into the browser's cookie jar before sending the next
      // HTTP request. Middleware then reads pos_token and
      // allows the terminal route through.
      //
      // DO NOT replace this with router.push(). See file header.
      window.location.href = `/pos/${shopId}/terminal`;

    } catch (err: any) {
      const code = err.response?.data?.message as string | undefined;

      if (code && DEVICE_ERROR_CODES.has(code)) {
        // Device was revoked or became unverified mid-session.
        // Re-register and show the approval waiting screen.
        await handleAutoRegister(code);
        setSelected(null);
        setPin("");
      } else {
        // Wrong PIN, locked account, rate-limited, etc.
        setPinError(getErrorMessage(code));
        setPin("");
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleExitConfirmed() {
    setShowExitGate(false);
    window.location.href = `/shops/${shopId}/dashboard`;
  }

  // ── RENDER: Device approval pending ───────────────────────
  if (screen === "DEVICE_PENDING" && pendingDeviceKey) {
    return (
      <DevicePendingScreen
        shopId={shopId}
        deviceKey={pendingDeviceKey}
        mode="POS"
        onApproved={() => {
          window.history.replaceState({}, "", `/pos/${shopId}`);
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
      <div className="min-h-screen bg-[#0F2B4C] flex items-center justify-center">
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-28 h-36 rounded-xl bg-white/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── RENDER: Waiting for owner to approve device ────────────
  if (screen === "PENDING_APPROVAL") {
    return (
      <>
        <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center p-6 text-center relative">
          <button
            onClick={() => setShowExitGate(true)}
            className="absolute top-6 right-6 text-[12px] text-white/30 hover:text-white/70 transition px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30"
          >
            Exit Mode
          </button>

          <div className="w-16 h-16 rounded-2xl bg-[#BA7517]/20 border border-[#BA7517]/30 flex items-center justify-center mb-5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="#BA7517" strokeWidth="1.5" />
              <path d="M16 10v6l4 3" stroke="#BA7517" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-white/40 text-[11px] uppercase tracking-widest mb-2">Device Registered</p>
          <h1 className="text-white text-[22px] font-medium mb-3">Waiting for Approval</h1>
          <p className="text-white/40 text-[13px] max-w-xs leading-relaxed">
            This device has been registered and is waiting for the owner to approve it.
          </p>
          <div className="mt-6 bg-white/5 border border-white/10 rounded-xl px-5 py-4 max-w-xs text-left space-y-2">
            <p className="text-white/60 text-[12px] font-medium">Next steps:</p>
            <ol className="text-white/40 text-[12px] space-y-1 list-decimal list-inside">
              <li>Tell the owner to open the Dashboard</li>
              <li>Go to <span className="text-white/60">Permissions</span></li>
              <li>Approve this device</li>
              <li>Activate POS mode from the sidebar</li>
            </ol>
          </div>
          <button
            onClick={fetchStaff}
            className="mt-6 px-6 h-10 text-[13px] text-white/60 border border-white/20 rounded-xl hover:bg-white/10 transition"
          >
            Check again
          </button>
        </div>

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

  // ── RENDER: PIN entry numpad ───────────────────────────────
  if (screen === "ENTER_PIN" && selected) {
    return (
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center relative px-6">
        <button
          onClick={() => { setScreen("SELECT_STAFF"); setPin(""); setPinError(""); }}
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
        <div className={`w-[240px] mb-6 ${shake ? "animate-shake" : ""}`}>
          <input
            type="password"
            readOnly
            value={pin}
            placeholder="ENTER PIN"
            className="w-full h-16 bg-white/5 border-2 border-white/10 rounded-2xl text-center text-2xl tracking-[0.5em] text-white placeholder:text-white/10 placeholder:text-[12px] focus:outline-none focus:border-[#0D7A5F] transition-all"
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
          className="mt-6 w-[240px] h-14 rounded-2xl text-[15px] font-bold uppercase tracking-wider text-white bg-[#0D7A5F] disabled:opacity-30"
        >
          {submitting ? "Verifying…" : "Sign In"}
        </button>
      </div>
    );
  }

  // ── RENDER: Staff selection grid (default) ─────────────────
  return (
    <>
      <div className="min-h-screen bg-[#0F2B4C] flex flex-col items-center justify-center p-6 relative">
        <button
          onClick={() => setShowExitGate(true)}
          className="absolute top-6 right-6 text-[12px] text-white/30 hover:text-white/70 transition px-3 py-1.5 rounded-lg border border-white/10"
        >
          Exit Mode
        </button>

        <div className="mb-6 text-center">
          <p className="text-white/50 text-[13px] uppercase tracking-widest mb-1">Point of Sale</p>
          <h1 className="text-white text-[26px] font-medium">Who are you?</h1>
        </div>

        {deviceError && (
          <div className="mb-5 w-full max-w-sm px-4 py-3 bg-[#BA7517]/20 border border-[#BA7517]/40 rounded-xl text-center">
            <p className="text-[#FBBF24] text-[13px] font-medium">Device not activated</p>
            <p className="text-[#FBBF24]/70 text-[12px]">{deviceError}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center max-w-lg">
          {staff.map((member) => {
            const disabled          = isCardDisabled(member);
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
                <div className="w-12 h-12 rounded-full bg-[#0D7A5F] flex items-center justify-center text-white text-[16px] font-medium">
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
      </div>

      {/* ── Owner PIN setup modal ── */}
      {showOwnerSetupModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h3 className="text-[#0F2B4C] text-[18px] font-semibold mb-2">POS PIN Required</h3>
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