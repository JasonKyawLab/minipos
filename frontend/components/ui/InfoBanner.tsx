
"use client";

import { useState, useEffect } from "react";

interface InfoBannerProps {
  /**
   * Unique key stored in localStorage to remember
   * collapsed/expanded state. Must be unique per banner.
   */
  storageKey: string;
  title: string;
  bullets: string[];
  /** Optional example shown in a monospace block */
  example?: string;
}

export function InfoBanner({
  storageKey,
  title,
  bullets,
  example,
}: InfoBannerProps) {
  // Default to expanded (true) until localStorage is read.
  // We start with null to avoid a flash of wrong state.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    // "1" means the user previously collapsed it
    setCollapsed(stored === "1");
  }, [storageKey]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  }

  // Don't render until we know the collapsed state
  // (prevents layout shift on initial load)
  if (collapsed === null) return null;

  return (
    <div className="mb-5 rounded-lg border border-[#C8DEFF] bg-[#EEF5FF] overflow-hidden">
      {/* ── Header row — always visible, clickable to toggle ── */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#E4EFFE] transition-colors text-left"
        aria-expanded={!collapsed}
      >
        {/* Info circle icon */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          className="text-[#2563EB] shrink-0"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="7.5" stroke="currentColor" />
          <path
            d="M8 7v5M8 5v.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Title */}
        <span className="flex-1 text-[13px] font-semibold text-[#1D3A6E]">
          {title}
        </span>

        {/* Chevron — points down when collapsed, up when expanded */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 text-[#2563EB] transition-transform ${
            collapsed ? "" : "rotate-180"
          }`}
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* ── Body — hidden when collapsed ── */}
      {!collapsed && (
        <div className="px-4 pb-3 pt-0.5 border-t border-[#C8DEFF]/60">
          <ul className="space-y-1 mt-2">
            {bullets.map((b, i) => (
              <li key={i} className="text-[12px] text-[#374151] flex gap-1.5">
                <span className="text-[#2563EB] shrink-0 mt-px">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {example && (
            <div className="mt-2.5 px-2.5 py-1.5 bg-white border border-[#C8DEFF] rounded text-[11px] text-[#374151] font-mono leading-relaxed">
              {example}
            </div>
          )}
        </div>
      )}
    </div>
  );
}