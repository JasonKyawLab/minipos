"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import type { PublicMenuItem, PublicMenuItemVariant, PublicModifierGroup } from "@/types/pos";

interface Props {
  product:      PublicMenuItem | null;
  variant:      PublicMenuItemVariant | null;
  selectedMods: Record<string, string[]>;
  note:         string;
  onClose:      () => void;
  onModToggle:  (group: PublicModifierGroup, optionId: string) => void;
  onNoteChange: (note: string) => void;
  onConfirm:    () => void;
}

function isValid(product: PublicMenuItem, selectedMods: Record<string, string[]>): boolean {
  return product.modifier_groups.every((g) => {
    if (!g.is_required) return true;
    return (selectedMods[g.id] ?? []).length >= g.min_select;
  });
}

export function ModifierSheetModal({
  product,
  variant,
  selectedMods,
  note,
  onClose,
  onModToggle,
  onNoteChange,
  onConfirm,
}: Props) {
  if (!product || !variant) return null;

  const valid = isValid(product, selectedMods);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <p className="text-white font-semibold text-[15px]">{product.product_name}</p>
            <p className="text-white/40 text-[12px]">
              {variant.name} — {formatCurrency(variant.price)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white transition text-[18px]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {product.modifier_groups.map((group) => (
            <div key={group.id}>
              <p className="text-white/70 text-[12px] font-semibold uppercase tracking-wide mb-2">
                {group.name}
                {group.is_required && <span className="text-red-400 ml-1">*</span>}
              </p>
              <div className="space-y-1.5">
                {group.options.map((opt) => {
                  const selected = (selectedMods[group.id] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => onModToggle(group, opt.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition text-[13px] ${
                        selected
                          ? "bg-[#0D7A5F]/20 border-[#0D7A5F]/50 text-white"
                          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      <span>{opt.name}</span>
                      {opt.price_delta !== 0 && (
                        <span className="text-white/40 text-[12px]">
                          +{formatCurrency(opt.price_delta)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <p className="text-white/70 text-[12px] font-semibold uppercase tracking-wide mb-2">
              Note (optional)
            </p>
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. no onions, extra spicy"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          <button
            onClick={onConfirm}
            disabled={!valid}
            className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add to Order
          </button>
        </div>
      </div>
    </div>
  );
}
