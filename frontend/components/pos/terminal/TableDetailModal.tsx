"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import { Spinner } from "@/components/states";
import type { TableStatus, ActiveOrder, ConfirmedItem } from "@/types/pos";

interface Props {
  table:        TableStatus | null;
  order:        ActiveOrder | null;
  items:        ConfirmedItem[];
  loading:      boolean;
  onClose:      () => void;
  onAddItems:   () => void;
  onPay:        () => void;
}

export function TableDetailModal({ table, order, items, loading, onClose, onAddItems, onPay }: Props) {
  if (!table) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest mb-0.5">Table</p>
            <p className="text-white text-[22px] font-bold leading-none">{table.table_number}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 text-white/30 hover:bg-white/15 hover:text-white transition flex items-center justify-center text-[16px]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[40vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Spinner size={16} />
              <p className="text-white/30 text-[13px]">Loading order…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-1">
              <p className="text-white/50 text-[15px] font-medium">Table is available</p>
              <p className="text-white/25 text-[12px]">Start a new order below</p>
            </div>
          ) : (
            <>
              <p className="text-white/30 text-[11px] uppercase tracking-widest mb-3">Current order</p>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[14px] font-medium leading-snug">
                        {item.product_name_snapshot}
                        {item.item_name_snapshot !== item.product_name_snapshot && (
                          <span className="text-white/40 text-[13px] ml-1">
                            — {item.item_name_snapshot}
                          </span>
                        )}
                      </p>
                      {item.modifier_snapshot?.length > 0 && (
                        <p className="text-white/35 text-[12px] mt-0.5">
                          {item.modifier_snapshot.map((m) => m.name).join(", ")}
                        </p>
                      )}
                      {item.item_note && (
                        <p className="text-white/25 text-[12px] italic mt-0.5">{item.item_note}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white/50 text-[12px]">×{item.qty}</p>
                      <p className="text-white/70 text-[13px] font-medium">{formatCurrency(item.subtotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                <p className="text-white/40 text-[13px]">Total</p>
                <p className="text-white text-[18px] font-bold">
                  {formatCurrency(order?.total_amount ?? 0)}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
          <button
            onClick={onAddItems}
            className="w-full h-14 rounded-xl bg-[#1E4FBF] text-white text-[16px] font-bold hover:bg-[#1a44a8] active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <span className="text-[20px]">＋</span> Add Items
          </button>
          {order && (
            <button
              onClick={onPay}
              className="w-full h-14 rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <span className="text-[20px]">💳</span> Pay Now
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full h-10 text-white/30 text-[13px] hover:text-white/60 transition"
          >
            ← Back to Tables
          </button>
        </div>
      </div>
    </div>
  );
}
