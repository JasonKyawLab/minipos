"use client";

import React from "react";
import type { RestaurantMode, OrderContext } from "@/types/pos";

interface Props {
  mode:            RestaurantMode;
  billRequestCount: number;
  orderCtx:        OrderContext | null;
  onSaleClick:     () => void;
  onTablesClick:   () => void;
  onCancelDineIn:  () => void;
}

export function RestaurantModeSelector({
  mode,
  billRequestCount,
  orderCtx,
  onSaleClick,
  onTablesClick,
  onCancelDineIn,
}: Props) {
  const isDineInMenuMode = orderCtx?.orderType === "DINE_IN" && mode === "takeaway";

  return (
    <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/10">
      <div className="flex gap-2">
        <button
          onClick={onSaleClick}
          className={`
            flex-1 flex flex-col items-center justify-center gap-1
            h-16 rounded-xl border-2 font-semibold transition active:scale-[0.97]
            ${mode === "takeaway"
              ? "bg-[#0D7A5F] border-[#0D7A5F] text-white shadow-lg shadow-[#0D7A5F]/20"
              : "bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/20"}
          `}
        >
          <span className="text-[24px] leading-none">🛒</span>
          <span className="text-[14px] tracking-wide">Sale</span>
        </button>

        <button
          onClick={onTablesClick}
          className={`
            relative flex-1 flex flex-col items-center justify-center gap-1
            h-16 rounded-xl border-2 font-semibold transition active:scale-[0.97]
            ${mode === "tables"
              ? "bg-[#1E4FBF] border-[#1E4FBF] text-white shadow-lg shadow-[#1E4FBF]/20"
              : "bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/20"}
          `}
        >
          {billRequestCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold flex items-center justify-center">
              {billRequestCount}
            </span>
          )}
          <span className="text-[24px] leading-none">🪑</span>
          <span className="text-[14px] tracking-wide">Tables</span>
        </button>
      </div>

      {isDineInMenuMode && orderCtx?.tableName && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-[#1E4FBF]/15 border border-[#1E4FBF]/30 rounded-xl">
          <span className="text-[14px]">🪑</span>
          <p className="text-[#93C5FD] text-[12px] font-semibold flex-1">
            Adding items for Table {orderCtx.tableName}
          </p>
          <button
            onClick={onCancelDineIn}
            className="text-white/30 hover:text-white/70 text-[11px] transition"
          >
            ✕ Cancel
          </button>
        </div>
      )}
    </div>
  );
}
