"use client";
import React from "react";

interface VoidTicketModalProps {
  orderNo:       string;
  isLoading:     boolean;
  errorMessage?: string | null;
  onConfirm:     () => void;
  onCancel:      () => void;
}

export function VoidTicketModal({
  orderNo,
  isLoading,
  errorMessage,
  onConfirm,
  onCancel,
}: VoidTicketModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-[#A32D2D] px-6 py-5">
          <p className="text-white/70 text-[11px] uppercase tracking-widest mb-1">
            Void ticket
          </p>
          <p className="text-white text-[18px] font-semibold">
            Cancel order #{orderNo}?
          </p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[#5F5E5A] text-[14px] mb-5">
            This will remove the ticket from the kitchen display.
            This action cannot be undone, and the customer/cashier
            will be notified that the order was cancelled.
          </p>

          {errorMessage && (
            <p className="text-[#A32D2D] text-[13px] mb-3">{errorMessage}</p>
          )}

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full h-11 rounded-xl bg-[#A32D2D] text-white text-[14px] font-semibold hover:bg-opacity-90 transition disabled:opacity-50"
          >
            {isLoading ? "Voiding..." : "Yes, void this ticket"}
          </button>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="w-full h-9 mt-2 text-[13px] text-[#5F5E5A] hover:text-[#0F2B4C] transition disabled:opacity-50"
          >
            Keep ticket
          </button>
        </div>
      </div>
    </div>
  );
}