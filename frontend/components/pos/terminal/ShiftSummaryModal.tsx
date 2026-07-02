"use client";

import React from "react";

interface Props {
  open:          boolean;
  shiftDuration: string;
  onConfirm:     () => void;
  onCancel:      () => void;
}

export function ShiftSummaryModal({ open, shiftDuration, onConfirm, onCancel }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-[#0F2B4C] px-6 py-5">
          <p className="text-white/50 text-[11px] uppercase tracking-widest mb-1">Shift complete</p>
          <p className="text-white text-[20px] font-semibold">Great work today!</p>
        </div>
        <div className="px-6 py-5">
          {shiftDuration && (
            <p className="text-[#5F5E5A] text-[14px] mb-4">
              Shift duration:{" "}
              <span className="font-medium text-[#0F2B4C]">{shiftDuration}</span>
            </p>
          )}
          <button
            onClick={onConfirm}
            className="w-full h-11 rounded-xl bg-[#0F2B4C] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
          >
            End shift &amp; log out
          </button>
          <button
            onClick={onCancel}
            className="w-full h-9 mt-2 text-[13px] text-[#5F5E5A] hover:text-[#0F2B4C] transition"
          >
            Continue working
          </button>
        </div>
      </div>
    </div>
  );
}
