"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import type { BillRequest } from "@/types/pos";
import type { Currency } from "@/types";

interface Props {
  requests:  BillRequest[];
  currency:  Currency;
  onPay:     (req: BillRequest) => void;
  onReopen:  (orderId: string) => void;
  onDismiss: (orderId: string) => void;
}

export function BillRequestBanner({ requests, currency, onPay, onReopen, onDismiss }: Props) {
  if (requests.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-white/10 px-4 py-2 space-y-1.5 bg-[#BA7517]/5">
      {requests.map((req) => (
        <div
          key={req.orderId}
          className="flex items-center gap-3 px-4 py-3 bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-xl"
        >
          <span className="text-[22px] shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[#D97706] leading-tight">
              {req.tableNumber ? `Table ${req.tableNumber}` : req.orderNo} wants to pay
            </p>
            <p className="text-[12px] text-white/30 mt-0.5">{formatCurrency(req.totalAmount, currency)}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onPay(req)}
              className="px-3 h-8 rounded-lg bg-[#D97706] text-white text-[13px] font-semibold hover:bg-[#B45309] transition"
            >
              Pay
            </button>
            <button
              onClick={() => onReopen(req.orderId)}
              className="px-3 h-8 rounded-lg bg-white/10 text-white/60 text-[13px] hover:bg-white/20 hover:text-white transition"
            >
              Reopen
            </button>
            <button
              onClick={() => onDismiss(req.orderId)}
              className="w-8 h-8 rounded-lg bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60 transition text-[14px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
