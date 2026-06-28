"use client";
// =========================================================
// components/layout/MobileDrawer.tsx
//
// Shared mobile-nav primitives used by Sidebar.tsx and
// ShopSidebar.tsx so both behave identically below 768px
// instead of each component reinventing its own drawer logic.
// =========================================================

import React from "react";

/** Fixed top bar shown only below the md breakpoint (<768px).
 *  Tapping the hamburger opens the off-canvas sidebar drawer. */
export function MobileTopBar({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <div className="md:hidden fixed top-0 inset-x-0 h-12 z-30 bg-white border-b border-ui-greyBorder flex items-center gap-3 px-3">
      <button
        onClick={onOpen}
        aria-label="Open menu"
        className="p-2 -ml-1 rounded-md text-ui-grey hover:bg-ui-greyLight active:bg-ui-greyLight transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <span className="text-[14px] font-semibold text-brand-navy truncate">{title}</span>
    </div>
  );
}

/** Dimmed overlay behind the drawer on mobile. Tapping it closes
 *  the drawer — the standard off-canvas-nav pattern. */
export function MobileBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="md:hidden fixed inset-0 bg-black/40 z-40"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}