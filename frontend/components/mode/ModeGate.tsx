"use client";
// =========================================================
// components/mode/ModeGate.tsx
//
// Full-screen password gate for entering/exiting POS or
// Kitchen mode with explicit parameter isolation.
// =========================================================

import React, { useState, useRef, useEffect } from "react";
import api from "@/lib/api";
import { useParams } from "next/navigation";

type Mode   = "POS" | "KITCHEN";
type Action = "enter" | "exit";

interface ModeGateProps {
  shopId:      string;
  shopName:    string;
  mode:        Mode;
  action:      Action;
  allowCancel: boolean;
  onSuccess:   () => void;
  onCancel:    () => void;
}

interface ModeTheme {
  overlay:          string;
  headerBg:         string;
  labelText:        string;
  titleText:        string;
  subtitleText:     string;
  shopText:         string;
  formBg:           string;
  inputLabel:       string;
  inputBg:          string;
  inputBorder:      string;
  inputFocus:       string;
  inputText:        string;
  inputPlaceholder: string;
  errorBg:          string;
  errorBorder:      string;
  errorText:        string;
  buttonBg:         string;
  buttonHover:      string;
  buttonText:       string;
  cancelBg:         string;
  cancelBorder:     string;
  cancelText:       string;
  cancelHover:      string;
  spinnerRing:      string;
  iconBg:           string;
  badgeDot:         string;
  badgeText:        string;
}

const THEMES: Record<Mode, ModeTheme> = {
  POS: {
    overlay:          "rgba(0, 0, 0, 0.85)",
    headerBg:         "#0F2B4C",
    labelText:        "text-white/50",
    titleText:        "text-white",
    subtitleText:     "text-white/50",
    shopText:         "text-white/30",
    formBg:           "#1A3A5C",
    inputLabel:       "text-white/60",
    inputBg:          "bg-white/10",
    inputBorder:      "border-white/20",
    inputFocus:       "focus:border-[#0D7A5F] focus:ring-[#0D7A5F]/30",
    inputText:        "text-white",
    inputPlaceholder: "placeholder:text-white/30",
    errorBg:          "bg-[#A32D2D]/20",
    errorBorder:      "border-[#FF6B6B]/30",
    errorText:        "text-[#FF9B9B]",
    buttonBg:         "bg-[#0D7A5F]",
    buttonHover:      "hover:bg-[#0a6b52]",
    buttonText:       "text-white",
    cancelBg:         "bg-white/10",
    cancelBorder:     "border-white/20",
    cancelText:       "text-white/70",
    cancelHover:      "hover:bg-white/15 hover:text-white",
    spinnerRing:      "border-white/30 border-t-white",
    iconBg:           "bg-white/10",
    badgeDot:         "bg-white/40",
    badgeText:        "text-white/50",
  },
  KITCHEN: {
    overlay:          "rgba(0, 0, 0, 0.92)",
    headerBg:         "#0A0A0A",
    labelText:        "text-white/30",
    titleText:        "text-white",
    subtitleText:     "text-white/40",
    shopText:         "text-white/20",
    formBg:           "#1A1A1A",
    inputLabel:       "text-white/50",
    inputBg:          "bg-white/8",
    inputBorder:      "border-white/15",
    inputFocus:       "focus:border-[#0D7A5F] focus:ring-[#0D7A5F]/30",
    inputText:        "text-white",
    inputPlaceholder: "placeholder:text-white/25",
    errorBg:          "bg-[#A32D2D]/20",
    errorBorder:      "border-[#FF6B6B]/30",
    errorText:        "text-[#FF9B9B]",
    buttonBg:         "bg-[#0D7A5F]",
    buttonHover:      "hover:bg-[#0a6b52]",
    buttonText:       "text-white",
    cancelBg:         "bg-white/8",
    cancelBorder:     "border-white/15",
    cancelText:       "text-white/60",
    cancelHover:      "hover:bg-white/12 hover:text-white/80",
    spinnerRing:      "border-white/30 border-t-white",
    iconBg:           "bg-white/8",
    badgeDot:         "bg-white/30",
    badgeText:        "text-white/30",
  },
};

const MODE_LABELS: Record<Mode, string> = {
  POS:     "POS Mode",
  KITCHEN: "Kitchen Mode",
};

const ACTION_COPY: Record<Action, { title: string; subtitle: string; button: string }> = {
  enter: {
    title:    "Password required",
    subtitle: "Enter your account password to unlock this mode.",
    button:   "Unlock",
  },
  exit: {
    title:    "Password required to exit",
    subtitle: "Enter your account password to return to the dashboard.",
    button:   "Exit mode",
  },
};

const GATE_ERRORS: Record<string, string> = {
  INVALID_PASSWORD:                "Incorrect password. Please try again.",
  FORBIDDEN:                       "Only the owner or manager can do this.",
  USER_NOT_FOUND:                  "Account not found. Please log in again.",
  "Not authenticated":             "Your session has expired. Please log in again.",
  "Forbidden":                     "You don't have permission to do this.",
  "Invalid token":                 "Your session has expired. Please log in again.",
  "Invalid user":                  "Your session is invalid. Please log in again.",
  NO_ACTIVE_MODE_SESSION:          "No active session found. Please refresh the page.",
  TERMINAL_SESSION_INVALID:        "Your session has expired. Please log in again.",
  TERMINAL_SHOP_MISMATCH:          "Session does not match this shop.",
  DEVICE_NOT_VERIFIED:             "This device is not activated. Go to Dashboard → Permissions, approve the device first, then try again.",
  DEVICE_NOT_APPROVED:             "This device is pending approval. Go to Dashboard → Permissions and approve it, then try again.",
  DEVICE_VERIFICATION_UNAVAILABLE: "Device check temporarily unavailable. Please try again in a moment.",
  DEVICE_NOT_FOUND:                "Device not found. Please register this device first.",
};

function getGateError(message?: string): string {
  if (!message) return "Something went wrong. Please try again.";
  return GATE_ERRORS[message] ?? "Something went wrong. Please try again.";
}

export function ModeGate({
  shopId,
  shopName,
  mode,
  action,
  onSuccess,
  onCancel,
  allowCancel,
}: ModeGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [shake, setShake]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const params        = useParams();
  const routeShopId   = params?.shopId as string;
  const theme         = THEMES[mode];
  const modeLabel     = MODE_LABELS[mode];
  const actionCopy    = ACTION_COPY[action];

  // Guarantee that targetShopId evaluates to the route identifier.
  const targetShopId = routeShopId || (Array.isArray(shopId) ? shopId[0] : shopId);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (action === "enter") {
        // ── BUG FIX: Read the shop-scoped device key ──────────
        //
        // BEFORE: localStorage.getItem("minipos_device_key")
        //   This was a single global key. Opening two shops on the
        //   same browser caused both to share the same device UUID,
        //   so Shop B's Permissions page never saw a new pending
        //   device — it looked like Shop A's already-approved device.
        //
        // AFTER: localStorage.getItem("minipos_device_key_{shopId}")
        //   Each shop has its own UUID. The correct key for THIS
        //   shop is always what we send to the backend. Matches the
        //   key written by PosLoginPage and KitchenLoginPage.
        const deviceKey = (
          typeof window !== "undefined"
            ? localStorage.getItem(`minipos_device_key_${targetShopId}`)
            : null
        );

        const response = await api.post(
          `/api/shops/${targetShopId}/terminal/activate`,
          {
            password,
            mode: mode.toUpperCase(),
            ...(deviceKey ? { device_id: deviceKey } : {}),
          },
          { validateStatus: (s) => s < 500 }
        );

        if (response.status === 202 && response.data?.status === "AWAITING_APPROVAL") {
          window.location.href = `/${mode.toLowerCase()}/${targetShopId}?device_pending=${encodeURIComponent(response.data.deviceId)}`;
          return;
        }

        if (response.status !== 201) {
          const code = response.data?.message;
          setError(getGateError(code));
          setPassword("");
          setShake(true);
          setTimeout(() => setShake(false), 500);
          return;
        }

        // Navigate to the terminal/display page after successful activation.
        window.location.href = `/${mode.toLowerCase()}/${targetShopId}`;

      } else {
        // ── Exit ──────────────────────────────────────────────
        const response = await api.post(
          `/api/shops/${targetShopId}/terminal/exit`,
          { password },
          { validateStatus: (s) => s < 500 }
        );

        if (response.status !== 200 && response.status !== 201) {
          const code = response.data?.message;
          setError(getGateError(code));
          setPassword("");
          setShake(true);
          setTimeout(() => setShake(false), 500);
          return;
        }

        onSuccess();
        window.location.href = `/shops/${targetShopId}/dashboard`;
      }
    } catch (err: any) {
      const code = err.response?.data?.message;
      setError(getGateError(code));
      setPassword("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: theme.overlay, backdropFilter: "blur(8px)" }}
    >
      <div className={`w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl ${shake ? "animate-shake" : ""}`}>
        {/* Header */}
        <div className="px-6 pt-6 pb-5" style={{ background: theme.headerBg }}>
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${theme.badgeDot}`} />
            <span className={`text-[11px] uppercase tracking-widest font-medium ${theme.badgeText}`}>
              {modeLabel}
            </span>
          </div>

          <div className={`w-12 h-12 rounded-xl ${theme.iconBg} flex items-center justify-center mb-4`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="1.5" />
              <path d="M8 11V7a4 4 0 018 0v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1.5" fill="white" />
            </svg>
          </div>

          <h2 className={`text-[20px] font-semibold mb-1 ${theme.titleText}`}>{actionCopy.title}</h2>
          <p className={`text-[13px] leading-relaxed ${theme.subtitleText}`}>{actionCopy.subtitle}</p>

          {shopName && (
            <div className="mt-3 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 5l6-4 6 4v7H1V5z" stroke="white" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round" />
              </svg>
              <span className={`text-[12px] ${theme.shopText}`}>{shopName}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5" style={{ background: theme.formBg }}>
          {error && (
            <div className={`mb-4 px-3 py-2.5 rounded-lg border ${theme.errorBg} ${theme.errorBorder}`}>
              <p className={`text-[13px] ${theme.errorText}`}>{error}</p>
            </div>
          )}

          <div className="mb-4">
            <label className={`block text-[12px] font-medium mb-1.5 ${theme.inputLabel}`}>
              Account password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Enter your password"
              autoComplete="current-password"
              className={`w-full h-10 px-3 text-[14px] rounded-lg border focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors ${theme.inputBg} ${theme.inputBorder} ${theme.inputFocus} ${theme.inputText} ${theme.inputPlaceholder}`}
            />
          </div>

          <div className={`flex gap-2 ${allowCancel ? "flex-row" : "flex-col"}`}>
            {allowCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className={`flex-1 h-10 text-[13px] font-medium rounded-lg border transition-colors disabled:opacity-40 ${theme.cancelBg} ${theme.cancelBorder} ${theme.cancelText} ${theme.cancelHover}`}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={!password || loading}
              className={`flex-1 h-10 flex items-center justify-center gap-2 text-[13px] font-medium rounded-lg transition-colors disabled:opacity-40 ${theme.buttonBg} ${theme.buttonHover} ${theme.buttonText}`}
            >
              {loading && <span className={`w-4 h-4 border-2 rounded-full animate-spin ${theme.spinnerRing}`} />}
              {loading ? "Verifying…" : actionCopy.button}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}