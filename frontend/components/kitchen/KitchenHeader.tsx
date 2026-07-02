"use client";

import React from "react";

interface Props {
  shopName?:       string;
  staffName?:      string;
  ticketCount:     number;
  socketConnected: boolean;
  endingShift:     boolean;
  exitingMode:     boolean;
  onEndShift:      () => void;
  onExitMode:      () => void;
}

export function KitchenHeader({
  shopName,
  staffName,
  ticketCount,
  socketConnected,
  endingShift,
  exitingMode,
  onEndShift,
  onExitMode,
}: Props) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-white/40 text-[12px] uppercase tracking-widest">Kitchen Display</p>
          <p className="text-white text-[18px] font-semibold">
            {shopName || "Kitchen"}
            {staffName && (
              <span className="text-white/40 font-normal ml-2">· {staffName}</span>
            )}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[11px]">
          {ticketCount} active
        </span>
        {!socketConnected && (
          <span className="px-2 py-0.5 rounded-full bg-[#D97706]/20 text-[#D97706] text-[11px] animate-pulse">
            Reconnecting…
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onEndShift}
          disabled={endingShift || exitingMode}
          className="px-4 h-10 text-[14px] text-white/60 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white transition disabled:opacity-40"
        >
          {endingShift ? "Ending…" : "End shift"}
        </button>
        <button
          onClick={onExitMode}
          disabled={endingShift || exitingMode}
          className="px-4 h-10 text-[14px] text-white/30 border border-white/5 rounded-xl hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
        >
          {exitingMode ? "Exiting…" : "Exit mode"}
        </button>
      </div>
    </header>
  );
}
