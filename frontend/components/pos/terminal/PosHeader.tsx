"use client";

import React from "react";
import type { MeResponse } from "@/types/pos";

interface Props {
  session:      MeResponse | null;
  endingShift:  boolean;
  exitingMode:  boolean;
  onEndShift:   () => void;
  onExitMode:   () => void;
}

export function PosHeader({ session, endingShift, exitingMode, onEndShift, onExitMode }: Props) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
      <div>
        <p className="text-white/40 text-[12px] uppercase tracking-widest">Point of Sale</p>
        <p className="text-white text-[18px] font-semibold">
          {session?.shopName ?? "POS Terminal"}
          {session?.userName && (
            <span className="text-white/40 font-normal ml-2">· {session.userName}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
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
