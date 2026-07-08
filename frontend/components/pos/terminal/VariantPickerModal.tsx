"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import type { PublicMenuItem, PublicMenuItemVariant } from "@/types/pos";
import type { Currency } from "@/types";

interface Props {
  product:         PublicMenuItem | null;
  currency:        Currency;
  onClose:         () => void;
  onDirectAdd:     (product: PublicMenuItem, variant: PublicMenuItemVariant) => void;
  onOpenModifiers: (product: PublicMenuItem, variant: PublicMenuItemVariant) => void;
}

export function VariantPickerModal({ product, currency, onClose, onDirectAdd, onOpenModifiers }: Props) {
  if (!product) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <p className="text-white font-semibold text-[15px]">{product.product_name}</p>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white transition text-[18px]"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {product.items.map((variant) => (
            <button
              key={variant.id}
              disabled={!variant.is_active || variant.is_sold_out}
              onClick={() => {
                if (product.modifier_groups.length > 0) {
                  onOpenModifiers(product, variant);
                } else {
                  onDirectAdd(product, variant);
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition ${
                !variant.is_active || variant.is_sold_out
                  ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed"
                  : "bg-white/8 border-white/10 hover:bg-white/15"
              }`}
            >
              <span className="text-white text-[13px]">{variant.name}</span>
              <span className="text-white/60 text-[13px]">
                {variant.is_sold_out ? "Sold out" : formatCurrency(variant.price, currency)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
