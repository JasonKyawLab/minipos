"use client";

import React, { useState, useEffect } from "react";
import { Spinner } from "@/components/states";
import type { KitchenTicket, KitchenTicketItem, KitchenRole, KitchenStatus, KitchenTicketStatus } from "@/types/kitchen";

// ── Elapsed timer ──────────────────────────────────────────

function elapsedLabel(queuedAt: string): string {
  const ms      = Date.now() - new Date(queuedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60)  return `${minutes}m ${seconds}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isOverdue(queuedAt: string): boolean {
  return Date.now() - new Date(queuedAt).getTime() > 15 * 60_000;
}

function ElapsedTime({ queuedAt }: { queuedAt: string }) {
  const [label, setLabel] = useState(() => elapsedLabel(queuedAt));
  const [over, setOver]   = useState(() => isOverdue(queuedAt));

  useEffect(() => {
    const tick = setInterval(() => {
      setLabel(elapsedLabel(queuedAt));
      setOver(isOverdue(queuedAt));
    }, 1000);
    return () => clearInterval(tick);
  }, [queuedAt]);

  return (
    <span className={`shrink-0 text-[11px] font-mono tabular-nums ${over ? "text-[#FF9B9B]" : "text-white/30"}`}>
      {label}
    </span>
  );
}

// ── Ticket status derivation ───────────────────────────────

export function deriveTicketStatus(
  items:   KitchenTicketItem[],
  current: KitchenTicketStatus
): KitchenTicketStatus {
  const active = items.filter(
    (i) => i.kitchen_status !== "CANCELLED" && i.kitchen_status !== "SERVED"
  );
  if (active.length === 0) return current;
  const allReady     = active.every((i) => i.kitchen_status === "READY");
  const anyPreparing = active.some((i)  => i.kitchen_status === "PREPARING");
  if (allReady)     return "READY";
  if (anyPreparing) return "IN_PROGRESS";
  return "QUEUED";
}

// ── TicketCard ─────────────────────────────────────────────

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN:  "Dine In",
  TAKEAWAY: "Takeaway",
  RETAIL:   "Retail",
  QR:       "QR Order",
};

export interface TicketCardProps {
  ticket:       KitchenTicket;
  bumpingItems: Set<string>;
  completing:   boolean;
  currentRole:  KitchenRole;
  onBumpItem:   (ticket: KitchenTicket, item: KitchenTicketItem) => void;
  onComplete:   (ticket: KitchenTicket) => void;
  onVoidTicket: (ticket: KitchenTicket) => void;
}

export const TicketCard = React.memo(function TicketCard({
  ticket,
  bumpingItems,
  completing,
  currentRole,
  onBumpItem,
  onComplete,
  onVoidTicket,
}: TicketCardProps) {
  const cardBg  = ticket.priority === "HIGH" ? "bg-[#D97706]/8 border-[#D97706]/30" : "bg-white/5 border-white/10";
  const canVoid = currentRole === "OWNER" || currentRole === "MANAGER";

  return (
    <div className={`rounded-2xl border ${cardBg} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-white font-bold text-[15px]">#{ticket.order_no}</p>
              {ticket.priority === "HIGH" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#D97706]/20 text-[#D97706] uppercase tracking-wide">
                  High
                </span>
              )}
              {ticket.is_addon && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-[#BA7517] text-white leading-none">
                  ADD-ON 🔶
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/50 text-[11px]">
                {ORDER_TYPE_LABELS[ticket.order_type] ?? ticket.order_type}
              </span>
              {ticket.table_number && (
                <>
                  <span className="text-white/20 text-[11px]">·</span>
                  <span className="text-white/70 text-[11px] font-medium">Table {ticket.table_number}</span>
                </>
              )}
              {ticket.customer_name && (
                <>
                  <span className="text-white/20 text-[11px]">·</span>
                  <span className="text-white/50 text-[11px] truncate max-w-[100px]">{ticket.customer_name}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ElapsedTime queuedAt={ticket.queued_at} />
          </div>
        </div>
        {ticket.notes && (
          <p className="mt-2 text-[#D97706] text-[11px] leading-snug">📝 {ticket.notes}</p>
        )}
      </div>

      {/* Items */}
      <div className="px-3 py-2 space-y-1.5">
        {ticket.items.map((item) => {
          const isBumping   = bumpingItems.has(item.id);
          const canBump     = item.kitchen_status === "PENDING" || item.kitchen_status === "PREPARING";
          const isDone      = item.kitchen_status === "READY" || item.kitchen_status === "SERVED";
          const isCancelled = item.kitchen_status === "CANCELLED";

          const itemBg =
            isCancelled                         ? "bg-white/3 opacity-40"  :
            isDone                              ? "bg-[#0D7A5F]/10"        :
            item.kitchen_status === "PREPARING" ? "bg-[#534AB7]/10"        :
            "bg-white/5";

          const statusDot =
            isCancelled                         ? "bg-white/20"  :
            isDone                              ? "bg-[#0D7A5F]" :
            item.kitchen_status === "PREPARING" ? "bg-[#534AB7]" :
            "bg-white/30";

          return (
            <button
              key={item.id}
              onClick={() => canBump && onBumpItem(ticket, item)}
              disabled={!canBump || isBumping || isCancelled}
              className={`w-full text-left px-3 py-2.5 rounded-xl ${itemBg} transition-all ${
                canBump && !isBumping ? "hover:brightness-125 active:scale-[0.98] cursor-pointer" : "cursor-default"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot} ${item.kitchen_status === "PREPARING" ? "animate-pulse" : ""}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13px] font-medium leading-tight ${isDone || isCancelled ? "text-white/40 line-through" : "text-white"}`}>
                      {item.product_name !== item.item_name
                        ? `${item.product_name} — ${item.item_name}`
                        : item.item_name}
                    </p>
                    <span className={`shrink-0 text-[12px] font-bold ${isDone ? "text-[#0D7A5F]" : "text-white/60"}`}>
                      ×{item.qty}
                    </span>
                  </div>
                  {item.modifier_snapshot.length > 0 && (
                    <p className="text-white/30 text-[11px] mt-0.5 leading-snug">
                      {item.modifier_snapshot.map((m) => m.name).join(", ")}
                    </p>
                  )}
                  {item.item_note && (
                    <p className="text-[#D97706]/70 text-[11px] mt-0.5 leading-snug">{item.item_note}</p>
                  )}
                </div>
                {canBump && (
                  <div className="shrink-0 mt-0.5">
                    {isBumping ? (
                      <Spinner size={16} />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 3l4 4-4 4" stroke="white" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      {(ticket.ticket_status === "READY" || canVoid) && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {ticket.ticket_status === "READY" && (
            <button
              onClick={() => onComplete(ticket)}
              disabled={completing}
              className="w-full h-9 rounded-xl bg-[#0D7A5F] hover:bg-[#0B6B52] text-white text-[13px] font-medium active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {completing ? (
                <Spinner size={16} />
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7l3.5 3.5L11.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Mark as Done
                </>
              )}
            </button>
          )}
          {canVoid && (
            <button
              onClick={(e) => { e.stopPropagation(); onVoidTicket(ticket); }}
              className="w-full h-9 rounded-xl border border-[#A32D2D]/40 text-[#FF6B6B] text-[13px] font-medium hover:bg-[#A32D2D]/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Cancel order
            </button>
          )}
        </div>
      )}
    </div>
  );
});
