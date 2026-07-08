"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import { Spinner } from "@/components/states";
import type { Currency } from "@/types";

interface Props {
  open:           boolean;
  orderLabel:     string;
  subtotal:       number;
  taxAmount:      number;
  total:          number;
  payMethod:      "CASH" | "COD";
  receivedAmount: string;
  payError:       string;
  paying:         boolean;
  currency:       Currency;
  onClose:        () => void;
  onMethodChange: (method: "CASH" | "COD") => void;
  onAmountChange: (amount: string) => void;
  onConfirm:      () => void;
}

const QUICK_DENOMS = [20, 50, 100, 200, 500, 1000];

export function PaymentModal({
  open,
  orderLabel,
  subtotal,
  taxAmount,
  total,
  payMethod,
  receivedAmount,
  payError,
  paying,
  currency,
  onClose,
  onMethodChange,
  onAmountChange,
  onConfirm,
}: Props) {
  if (!open) return null;

  const received    = parseFloat(receivedAmount);
  const totalCents  = Math.round(total * 100);        // avoid float precision bugs
  const validAmount = !isNaN(received) && received > 0;
  const change      = validAmount ? received - total : null;
  const isShort     = validAmount && Math.round(received * 100) < totalCents;

  const quickAmounts = [
    Math.round(total * 100) / 100,                    // exact rounded total
    ...QUICK_DENOMS.filter((d) => d > total).slice(0, 3),
  ].slice(0, 4);

  function handleKey(key: string) {
    if (key === "⌫") {
      onAmountChange(receivedAmount.slice(0, -1));
    } else if (key === ".") {
      if (!receivedAmount.includes(".")) onAmountChange((receivedAmount || "0") + ".");
    } else {
      const next  = receivedAmount + key;
      const parts = next.split(".");
      if (parts[1] && parts[1].length > 2) return;
      onAmountChange(next);
    }
  }

  const canConfirm =
    !paying &&
    (payMethod === "COD" ||
      (payMethod === "CASH" && validAmount && Math.round(received * 100) >= totalCents));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest mb-0.5">{orderLabel}</p>
            <p className="text-white font-bold text-[22px]">{formatCurrency(total, currency)}</p>
            {taxAmount > 0 && (
              <p className="text-white/40 text-[11px] mt-0.5">
                Subtotal {formatCurrency(subtotal, currency)} + Tax {formatCurrency(taxAmount, currency)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition text-[18px]">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Method toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["CASH", "COD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onMethodChange(m)}
                className={`h-10 rounded-xl text-[13px] font-semibold transition border ${
                  payMethod === m
                    ? "bg-[#0D7A5F] border-[#0D7A5F] text-white"
                    : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                }`}
              >
                {m === "CASH" ? "💵 Cash" : "📦 COD"}
              </button>
            ))}
          </div>

          {payMethod === "CASH" && (
            <>
              {/* Amount display */}
              <div className="bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-right">
                <p className="text-white/30 text-[11px] mb-0.5">Amount received</p>
                <p className="text-white text-[24px] font-bold tracking-wide">
                  {receivedAmount ? formatCurrency(parseFloat(receivedAmount) || 0, currency) : "—"}
                </p>
                {change !== null && change >= 0 && (
                  <p className="text-[#0D7A5F] text-[13px] font-semibold mt-1">
                    Change: {formatCurrency(change, currency)}
                  </p>
                )}
                {isShort && (
                  <p className="text-[#FF9B9B] text-[12px] mt-1">
                    Short by {formatCurrency(total - received, currency)}
                  </p>
                )}
              </div>

              {/* Quick amounts */}
              <div className="grid grid-cols-4 gap-1.5">
                {quickAmounts.map((amount, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAmountChange(String(amount))}
                    className={`h-8 rounded-lg text-[11px] font-medium transition border ${
                      parseFloat(receivedAmount) === amount
                        ? "bg-[#0D7A5F]/30 border-[#0D7A5F]/50 text-[#0D7A5F]"
                        : "bg-white/8 border-white/10 text-white/60 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {amount === total ? "Exact" : formatCurrency(amount, currency)}
                  </button>
                ))}
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((key) => (
                  <button
                    key={key}
                    onClick={() => handleKey(key)}
                    className={`h-12 rounded-xl text-white font-medium transition active:scale-95 ${
                      key === "⌫"
                        ? "bg-white/8 hover:bg-white/15 text-white/60 text-[18px]"
                        : "bg-white/10 hover:bg-white/20 text-[18px]"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </>
          )}

          {payError && (
            <p className="text-[#FF9B9B] text-[12px] text-center">{payError}</p>
          )}

          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="w-full h-12 rounded-xl bg-[#0D7A5F] text-white text-[15px] font-bold hover:bg-opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {paying
              ? <><Spinner />Processing…</>
              : payMethod === "COD" ? "Confirm COD Order" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
