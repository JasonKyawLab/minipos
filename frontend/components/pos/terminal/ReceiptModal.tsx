"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import type { Receipt } from "@/types/pos";

interface Props {
  receipt:    Receipt | null;
  onNewOrder: () => void;
}

export function ReceiptModal({ receipt, onNewOrder }: Props) {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-[#0D7A5F] px-6 py-6 text-center">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M5 14l6 6L23 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-white/70 text-[12px] uppercase tracking-widest mb-1">Payment successful</p>
          <p className="text-white text-[28px] font-bold">{formatCurrency(receipt.total_amount)}</p>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="flex justify-between text-[13px]">
            <span className="text-[#5F5E5A]">Order</span>
            <span className="font-mono font-medium text-[#0F2B4C]">#{receipt.order_no}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-[#5F5E5A]">Method</span>
            <span className="font-medium text-[#0F2B4C]">{receipt.method}</span>
          </div>
          {receipt.change_amount !== null && receipt.change_amount > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-[#5F5E5A]">Change</span>
              <span className="font-bold text-[#0D7A5F]">{formatCurrency(receipt.change_amount)}</span>
            </div>
          )}
          <button
            onClick={onNewOrder}
            className="w-full h-11 mt-2 rounded-xl bg-[#0F2B4C] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
          >
            New Order
          </button>
        </div>
      </div>
    </div>
  );
}
