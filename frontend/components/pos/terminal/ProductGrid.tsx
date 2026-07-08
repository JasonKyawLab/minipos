"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import type { PublicMenuItem } from "@/types/pos";
import type { Currency } from "@/types";

interface Props {
  items:   PublicMenuItem[];
  loading: boolean;
  error:   string;
  currency: Currency;
  onItemClick: (product: PublicMenuItem) => void;
}

export function ProductGrid({ items, loading, error, currency, onItemClick }: Props) {
  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
        <p className="text-white/30 text-[13px]">Loading menu…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
        <p className="text-red-400 text-[13px]">{error}</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
        <p className="text-white/30 text-[13px]">No items in this category.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((product) => (
          <button
            key={product.product_model_id}
            onClick={() => onItemClick(product)}
            className="bg-white/[0.08] hover:bg-white/15 border border-white/10 rounded-xl p-4 text-left transition active:scale-[0.97] flex flex-col gap-2 min-h-[90px]"
          >
            <p className="text-white text-[16px] font-semibold leading-snug line-clamp-2">
              {product.product_name}
            </p>
            <div className="flex items-center justify-between mt-auto">
              <p className="text-white/50 text-[14px] font-medium">
                {product.items.length === 1
                  ? formatCurrency(product.items[0].price, currency)
                  : `From ${formatCurrency(Math.min(...product.items.map((v) => v.price)), currency)}`}
              </p>
              {(product.items.length > 1 || product.modifier_groups.length > 0) && (
                <span className="text-[10px] text-white/30 font-medium">Options</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
