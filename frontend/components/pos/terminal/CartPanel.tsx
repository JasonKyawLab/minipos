"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import { Spinner } from "@/components/states";
import type { CartLine, ConfirmedItem, ActiveOrder, OrderContext } from "@/types/pos";
import type { Currency } from "@/types";

interface Props {
  cart:             CartLine[];
  confirmedItems:   ConfirmedItem[];
  orderCtx:         OrderContext | null;
  activeOrder:      ActiveOrder | null;
  tableOrder:       ActiveOrder | null;
  loadingTableOrder: boolean;
  isRestaurant:     boolean;
  isDineInMenuMode: boolean;
  placing:          boolean;
  cancelling:       boolean;
  currency:         Currency;
  onUpdateQty:      (key: string, delta: number) => void;
  onPlaceOrder:     () => void;
  onCollectPayment: () => void;
  onClearCart:      () => void;
  onCancelOrder:    () => void;
}

export function CartPanel({
  cart,
  confirmedItems,
  orderCtx,
  activeOrder,
  tableOrder,
  loadingTableOrder,
  isRestaurant,
  isDineInMenuMode,
  placing,
  cancelling,
  currency,
  onUpdateQty,
  onPlaceOrder,
  onCollectPayment,
  onClearCart,
  onCancelOrder,
}: Props) {
  const cartSubtotal      = cart.reduce((s, l) => s + l.lineTotal, 0);
  const cartCount         = cart.reduce((s, l) => s + l.qty, 0);
  const confirmedSubtotal = confirmedItems.reduce((s, i) => s + i.subtotal, 0);
  const hasConfirmedItems = confirmedItems.length > 0;
  const payingOrder       = activeOrder ?? tableOrder;

  const displayTotal = payingOrder
    ? payingOrder.total_amount
    : confirmedSubtotal + cartSubtotal;

  const isTakeawayOrRetail =
    orderCtx?.orderType === "TAKEAWAY" ||
    orderCtx?.orderType === "RETAIL"   ||
    !isRestaurant;

  return (
    <aside className="w-[320px] border-l border-white/10 flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        {isDineInMenuMode && orderCtx?.tableName ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-[#1E4FBF]/15 border border-[#1E4FBF]/20 rounded-xl">
            <span className="text-[20px]">🪑</span>
            <div className="flex-1 min-w-0">
              <p className="text-[#93C5FD] text-[15px] font-semibold">Table {orderCtx.tableName}</p>
              <p className="text-white/30 text-[12px]">Dine in order</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0D7A5F]/10 border border-[#0D7A5F]/20 rounded-xl">
            <span className="text-[20px]">🛒</span>
            <div className="flex-1 min-w-0">
              <p className="text-[#4ADE80] text-[15px] font-semibold">Sale</p>
              <p className="text-white/30 text-[12px]">New order</p>
            </div>
          </div>
        )}
      </div>

      {/* Items scroll zone */}
      <div className="flex-1 overflow-y-auto">
        {loadingTableOrder && (
          <div className="flex items-center justify-center h-20 gap-2">
            <Spinner size={16} />
            <p className="text-white/30 text-[12px]">Loading order…</p>
          </div>
        )}

        {/* Already-ordered items (DINE_IN top zone) */}
        {!loadingTableOrder && hasConfirmedItems && (
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-2">
              Already ordered
            </p>
            <div className="space-y-2">
              {confirmedItems.map((item) => (
                <div key={item.id} className="bg-white/[0.04] border border-white/5 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white/70 text-[14px] font-medium leading-tight truncate">
                        {item.product_name_snapshot}
                        {item.item_name_snapshot !== item.product_name_snapshot && (
                          <span className="text-white/30 ml-1">— {item.item_name_snapshot}</span>
                        )}
                      </p>
                      {item.modifier_snapshot?.length > 0 && (
                        <p className="text-white/25 text-[12px] mt-0.5 truncate">
                          {item.modifier_snapshot.map((m) => m.name).join(", ")}
                        </p>
                      )}
                      {item.item_note && (
                        <p className="text-white/20 text-[12px] mt-0.5 italic truncate">{item.item_note}</p>
                      )}
                      <p className="text-white/30 text-[13px] mt-1 font-medium">
                        {formatCurrency(item.subtotal, currency)}
                      </p>
                    </div>
                    <span className="text-white/30 text-[14px] font-mono shrink-0 mt-0.5">×{item.qty}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 mb-1 px-1">
              <p className="text-[12px] text-white/20">Sent to kitchen</p>
              <p className="text-[13px] text-white/30 font-medium">{formatCurrency(confirmedSubtotal, currency)}</p>
            </div>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-white/8" />
              <p className="text-[11px] text-white/20 uppercase tracking-widest shrink-0">Add more</p>
              <div className="flex-1 h-px bg-white/8" />
            </div>
          </div>
        )}

        {/* New cart items */}
        <div className="px-4 py-3">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-white/20 text-[14px]">
                {hasConfirmedItems ? "Tap items to add more" : "Add items to start"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((line) => (
                <div key={line.key} className="bg-white/5 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[15px] font-semibold leading-tight truncate">
                        {line.productName}
                        {line.variantName !== line.productName && (
                          <span className="text-white/40 ml-1 font-normal">— {line.variantName}</span>
                        )}
                      </p>
                      {line.modifiers.length > 0 && (
                        <p className="text-white/30 text-[12px] mt-0.5 truncate">
                          {line.modifiers.map((m) => m.name).join(", ")}
                        </p>
                      )}
                      <p className="text-white/50 text-[13px] mt-1 font-medium">
                        {formatCurrency(line.lineTotal, currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <button
                        onClick={() => onUpdateQty(line.key, -1)}
                        className="w-8 h-8 rounded-lg bg-white/10 text-white text-[16px] flex items-center justify-center hover:bg-white/20 transition"
                      >
                        −
                      </button>
                      <span className="text-white text-[15px] font-semibold w-5 text-center">
                        {line.qty}
                      </span>
                      <button
                        onClick={() => onUpdateQty(line.key, +1)}
                        className="w-8 h-8 rounded-lg bg-white/10 text-white text-[16px] flex items-center justify-center hover:bg-white/20 transition"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="px-4 py-4 border-t border-white/10 shrink-0 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <p className="text-white/40 text-[14px]">
            {hasConfirmedItems ? "Total" : `Subtotal (${cartCount} item${cartCount !== 1 ? "s" : ""})`}
          </p>
          <p className="text-white text-[20px] font-bold">{formatCurrency(displayTotal, currency)}</p>
        </div>

        {/* DINE_IN: table already has an order */}
        {!activeOrder && tableOrder && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1E4FBF]/10 border border-[#1E4FBF]/20 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-[#93C5FD]" />
              <p className="text-[#93C5FD] text-[13px] font-medium">#{tableOrder.order_no} — table open</p>
            </div>
            {cart.length > 0 && (
              <button
                onClick={onPlaceOrder}
                disabled={placing}
                className="w-full h-12 rounded-xl bg-white/10 text-white text-[15px] font-semibold hover:bg-white/20 transition disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {placing ? <><Spinner />Sending…</> : "Send to Kitchen"}
              </button>
            )}
            <button
              onClick={onCollectPayment}
              className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition"
            >
              Collect Payment
            </button>
          </div>
        )}

        {/* DINE_IN: first order for this table (no existing order) */}
        {!activeOrder && !tableOrder && isRestaurant && orderCtx?.orderType === "DINE_IN" && (
          <button
            onClick={onPlaceOrder}
            disabled={placing || cart.length === 0}
            className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {placing
              ? <><Spinner />Sending to kitchen…</>
              : "Place & Send to Kitchen"}
          </button>
        )}

        {/* TAKEAWAY / RETAIL */}
        {!activeOrder && !tableOrder && isTakeawayOrRetail && (
          <div className="space-y-2">
            <button
              onClick={onCollectPayment}
              disabled={cart.length === 0 || (isRestaurant && !orderCtx)}
              className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Collect Payment
            </button>
            {cart.length > 0 && (
              <button
                onClick={onClearCart}
                className="w-full h-10 rounded-xl bg-white/5 text-[#FF9B9B]/50 text-[14px] hover:bg-red-500/10 hover:text-[#FF9B9B] transition"
              >
                Clear Cart
              </button>
            )}
          </div>
        )}

        {/* Awaiting payment (DINE_IN order confirmed) */}
        {activeOrder && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1E4FBF]/10 border border-[#1E4FBF]/20 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-[#93C5FD] animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-[#93C5FD] text-[13px] font-medium">
                  #{activeOrder.order_no} — awaiting payment
                </p>
                <p className="text-white/30 text-[12px]">{formatCurrency(activeOrder.total_amount, currency)}</p>
              </div>
            </div>
            <button
              onClick={onCollectPayment}
              className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition"
            >
              Collect Payment
            </button>
            {activeOrder.status === "OPEN" && !tableOrder && (
              <button
                onClick={onCancelOrder}
                disabled={cancelling}
                className="w-full h-10 rounded-xl bg-white/5 text-[#FF9B9B]/50 text-[14px] hover:bg-red-500/10 hover:text-[#FF9B9B] transition disabled:opacity-40"
              >
                {cancelling ? "Cancelling…" : "Cancel Order"}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
