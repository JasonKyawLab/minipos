// components/mode/ModeGate.tsx

"use client";
// =========================================================
// components/mode/ModeGate.tsx
//
// Full-screen password gate with mode-aware theming.
//
// POS Mode    → Navy blue theme  (#0F2B4C) — professional, daytime
// Kitchen Mode → Dark charcoal   (#0A0A0A) — dark environment, night
//
// The entire overlay (header + form) now reflects the active
// mode so staff instantly know which mode they are entering
// or exiting — no ambiguity between POS and Kitchen.
// =========================================================

import React, { useState, useRef, useEffect } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";

type Mode   = "POS" | "KITCHEN";
type Action = "enter" | "exit";

interface ModeGateProps {
  shopId:      string;
  shopName:    string;
  mode:        Mode;
  action:      Action;
  onSuccess:   () => void;
  onCancel:    () => void;
  allowCancel: boolean;
}

// ── Mode-specific theme tokens ─────────────────────────────
//
// Each mode gets its own complete colour palette so every
// element — overlay, header, form background, input, button —
// consistently reflects the active mode.
//
// POS:
//   headerBg   → brand navy (matches POS sidebar button)
//   formBg     → slightly lighter navy for depth
//   inputBg    → white/10 tint so text is readable on dark
//   buttonBg   → teal accent (same as platform confirm actions)
//   cancelBg   → white/10 subtle
//   overlay    → navy-tinted black
//
// KITCHEN:
//   headerBg   → near-black (matches kitchen display bg)
//   formBg     → dark charcoal — clearly different from POS
//   inputBg    → white/8 tint
//   buttonBg   → kitchen green (0D7A5F — matches chef avatar)
//   cancelBg   → white/8 subtle
//   overlay    → pure dark black
// =========================================================

interface ModeTheme {
  // Full-screen overlay tint
  overlay:      string;
  // Top coloured header section
  headerBg:     string;
  // Mode label text (small uppercase above title)
  labelText:    string;
  // Main title + subtitle text
  titleText:    string;
  subtitleText: string;
  // Shop name hint
  shopText:     string;
  // Form section below the header
  formBg:       string;
  // Label above the input
  inputLabel:   string;
  // The password input field
  inputBg:      string;
  inputBorder:  string;
  inputFocus:   string;
  inputText:    string;
  inputPlaceholder: string;
  // Error message banner
  errorBg:      string;
  errorBorder:  string;
  errorText:    string;
  // Primary action button (Unlock / Exit mode)
  buttonBg:     string;
  buttonHover:  string;
  buttonText:   string;
  // Cancel button (only shown when allowCancel=true)
  cancelBg:     string;
  cancelBorder: string;
  cancelText:   string;
  cancelHover:  string;
  // Spinner ring inside the button
  spinnerRing:  string;
  // Lock icon background
  iconBg:       string;
  // Mode badge dot
  badgeDot:     string;
  badgeText:    string;
}

const THEMES: Record<Mode, ModeTheme> = {
  POS: {
    overlay:          "rgba(0, 0, 0, 0.85)",
    headerBg:         "#0F2B4C",   // brand navy
    labelText:        "text-white/50",
    titleText:        "text-white",
    subtitleText:     "text-white/50",
    shopText:         "text-white/30",
    // Form is a slightly lighter navy — creates depth without
    // breaking the navy theme established by the header.
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
    headerBg:         "#0A0A0A",   // near-black kitchen theme
    labelText:        "text-white/30",
    titleText:        "text-white",
    subtitleText:     "text-white/40",
    shopText:         "text-white/20",
    // Form is dark charcoal — clearly different from the
    // POS navy form, but still readable in a bright kitchen.
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
    // Kitchen confirm uses the same green as chef avatars
    // so the action colour is consistent with kitchen UI.
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

  const theme      = THEMES[mode];
  const modeLabel  = MODE_LABELS[mode];
  const actionCopy = ACTION_COPY[action];

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError("");

    try {
      await api.post(`/api/shops/${shopId}/verify-password`, { password });
      onSuccess();
    } catch (err: any) {
      const code = err.response?.data?.message;

      const GATE_ERRORS: Record<string, string> = {
        INVALID_PASSWORD:       "Incorrect password. Please try again.",
        FORBIDDEN:              "Only the owner or manager can do this.",
        USER_NOT_FOUND:         "Account not found. Please log in again.",
        "Not authenticated":    "Your session has expired. Please log in again.",
        "Forbidden":            "You don't have permission to do this.",
        "Invalid token":        "Your session has expired. Please log in again.",
        "Invalid user":         "Your session is invalid. Please log in again.",
      };

      const msg = (code ? GATE_ERRORS[code] : undefined) ?? getErrorMessage(code);
      setError(msg);
      setPassword("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: theme.overlay, backdropFilter: "blur(8px)" }}
    >
      <div
        className={`w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl ${
          shake ? "animate-shake" : ""
        }`}
      >
        {/* ── Header — coloured by mode ──────────────────── */}
        <div
          className="px-6 pt-6 pb-5"
          style={{ background: theme.headerBg }}
        >
          {/* Mode badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${theme.badgeDot}`} />
            <span className={`text-[11px] uppercase tracking-widest font-medium ${theme.badgeText}`}>
              {modeLabel}
            </span>
          </div>

          {/* Lock icon */}
          <div className={`w-12 h-12 rounded-xl ${theme.iconBg} flex items-center justify-center mb-4`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="1.5" />
              <path
                d="M8 11V7a4 4 0 018 0v4"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16" r="1.5" fill="white" />
            </svg>
          </div>

          <h2 className={`text-[20px] font-semibold mb-1 ${theme.titleText}`}>
            {actionCopy.title}
          </h2>
          <p className={`text-[13px] leading-relaxed ${theme.subtitleText}`}>
            {actionCopy.subtitle}
          </p>

          {/* Shop name context */}
          {shopName && (
            <div className="mt-3 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 5l6-4 6 4v7H1V5z"
                  stroke="white"
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={`text-[12px] ${theme.shopText}`}>{shopName}</span>
            </div>
          )}
        </div>

        {/* ── Form — themed by mode ──────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-5"
          style={{ background: theme.formBg }}
        >
          {/* Error banner */}
          {error && (
            <div className={`mb-4 px-3 py-2.5 rounded-lg border ${theme.errorBg} ${theme.errorBorder}`}>
              <p className={`text-[13px] ${theme.errorText}`}>{error}</p>
            </div>
          )}

          {/* Password input */}
          <div className="mb-4">
            <label className={`block text-[12px] font-medium mb-1.5 ${theme.inputLabel}`}>
              Account password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit(e as any)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className={`
                w-full h-10 px-3 text-[14px] rounded-lg border
                focus:outline-none focus:ring-2 focus:ring-offset-0
                transition-colors
                ${theme.inputBg}
                ${theme.inputBorder}
                ${theme.inputFocus}
                ${theme.inputText}
                ${theme.inputPlaceholder}
              `}
            />
          </div>

          {/* Action buttons */}
          <div className={`flex gap-2 ${allowCancel ? "flex-row" : "flex-col"}`}>
            {allowCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className={`
                  flex-1 h-10 text-[13px] font-medium rounded-lg border
                  transition-colors disabled:opacity-40
                  ${theme.cancelBg}
                  ${theme.cancelBorder}
                  ${theme.cancelText}
                  ${theme.cancelHover}
                `}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={!password || loading}
              className={`
                flex-1 h-10 flex items-center justify-center gap-2
                text-[13px] font-medium rounded-lg transition-colors
                disabled:opacity-40
                ${theme.buttonBg}
                ${theme.buttonHover}
                ${theme.buttonText}
              `}
            >
              {loading && (
                <span
                  className={`w-4 h-4 border-2 rounded-full animate-spin ${theme.spinnerRing}`}
                />
              )}
              {loading ? "Verifying…" : actionCopy.button}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}