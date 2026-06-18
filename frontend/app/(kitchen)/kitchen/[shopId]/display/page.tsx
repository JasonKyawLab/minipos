"use client";

// =========================================================
// app/(kitchen)/kitchen/[shopId]/display/page.tsx
// Path: frontend/app/(kitchen)/kitchen/[shopId]/display/page.tsx
// 
// CHANGES:
//   - After socket connects, emit "join_terminal_session".
//   - On reconnect, re‑emit the join and refetch tickets.
//   - Added error listener for debugging.
// =========================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams }  from "next/navigation";
import kitchenApi     from "@/lib/kitchenApi";
import { ModeGate }   from "@/components/mode/ModeGate";
import { createFreshSocket, getSocket } from "@/lib/socket";

// ── Types (mirror backend kitchen.types.ts) ───────────────
type KitchenStatus       = "PENDING" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
type KitchenTicketStatus = "QUEUED"  | "IN_PROGRESS" | "READY" | "DONE" | "CANCELLED";
type KitchenPriority     = "NORMAL"  | "HIGH";

interface KitchenTicketItem {
  id:                string;
  order_id:          string;
  product_name:      string;
  item_name:         string;
  qty:               number;
  modifier_snapshot: Array<{ name: string; price_delta: number }>;
  item_note:         string | null;
  kitchen_status:    KitchenStatus;
}

interface KitchenTicket {
  id:            string;
  order_id:      string;
  order_no:      string;
  order_type:    string;
  table_number:  string | null;
  customer_name: string | null;
  notes:         string | null;
  ticket_status: KitchenTicketStatus;
  priority:      KitchenPriority;
  queued_at:     string;
  items:         KitchenTicketItem[];
  round:         number;
  is_addon:      boolean;
}

// ── Socket event names ─────────────────────────────────────
const EV_TICKET_CREATED = "kitchen:ticket_created";
const EV_TICKET_UPDATED = "kitchen:ticket_updated";
const EV_ITEM_STATUS    = "kitchen:item_status";
const EV_TICKET_READY   = "kitchen:ticket_ready";
const EV_FORCE_LOGOUT   = "kitchen:force_logout";

// ── Constants ─────────────────────────────────────────────
const SHIFT_START_KEY = "minipos_kitchen_shift_start";
const ACTIVE_STATUSES: KitchenTicketStatus[] = ["QUEUED", "IN_PROGRESS", "READY"];
const NEXT_ITEM_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  PENDING:   "PREPARING",
  PREPARING: "READY",
};
const COLUMNS: Array<{ status: KitchenTicketStatus; label: string; colour: string }> = [
  { status: "QUEUED",      label: "Queued",      colour: "border-[#D97706] text-[#D97706]" },
  { status: "IN_PROGRESS", label: "In Progress", colour: "border-[#534AB7] text-[#534AB7]" },
  { status: "READY",       label: "Ready",       colour: "border-[#0D7A5F] text-[#0D7A5F]" },
];

// ── Helpers ───────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────
export default function KitchenDisplayPage() {
  const { shopId } = useParams<{ shopId: string }>();

  const [tickets, setTickets]               = useState<KitchenTicket[]>([]);
  const [loading, setLoading]               = useState(true);
  const [fetchError, setFetchError]         = useState<string | null>(null);
  const [bumpingItems, setBumpingItems]     = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds]   = useState<Set<string>>(new Set());
  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);
  const [socketConnected, setSocketConnected]   = useState(true);

  const socketRef  = useRef<ReturnType<typeof getSocket> | null>(null);
  const fetchingRef = useRef(false);

  const fetchTickets = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setFetchError(null);
      const { data } = await kitchenApi.get<KitchenTicket[]>(
        `/api/shops/${shopId}/kitchen/tickets`,
        { params: { status: ACTIVE_STATUSES.join(",") } }
      );
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      setFetchError("Failed to load orders. Check your connection.");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [shopId]);

  useEffect(() => {
    const socket = createFreshSocket();
    socketRef.current = socket;
    socket.connect();

    // ── Connect / reconnect handlers ──────────────────────
    socket.on("connect", () => {
      console.log("[Kitchen Socket] connected, id:", socket.id);
      setSocketConnected(true);
      // MANUAL JOIN: explicitly ask to join the terminal room
      socket.emit("join_terminal_session", { shopId, mode: "KITCHEN" });
      fetchTickets();
    });

    socket.on("disconnect", (reason) => {
      console.log("[Kitchen Socket] disconnected, reason:", reason);
      setSocketConnected(false);
    });

    socket.on("reconnect", () => {
      console.log("[Kitchen Socket] reconnected");
      socket.emit("join_terminal_session", { shopId, mode: "KITCHEN" });
      fetchTickets();
    });

    socket.on("terminal_room_joined", (data: unknown) => {
      console.log("[Kitchen Socket] joined terminal room:", data);
    });

    socket.on("error", (err: any) => {
      console.error("[Kitchen Socket] Socket error:", err);
    });

    // ── Kitchen events ──────────────────────────────────────
    socket.on(EV_TICKET_CREATED, () => {
      console.log("[Kitchen Socket] ticket_created received — refreshing");
      fetchTickets();
    });

    socket.on(EV_TICKET_UPDATED, (payload: {
      ticketId?:     string;
      orderId?:      string;
      ticket_status: KitchenTicketStatus;
    }) => {
      const id = payload.ticketId ?? payload.orderId;
      if (!id) return;
      if (payload.ticket_status === "DONE" || payload.ticket_status === "CANCELLED") {
        setTickets((prev) => prev.filter(
          (t) => t.id !== id && t.order_id !== id
        ));
      } else {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === id || t.order_id === id
              ? { ...t, ticket_status: payload.ticket_status }
              : t
          )
        );
      }
    });

    socket.on(EV_ITEM_STATUS, (payload: {
      ticketId:       string;
      itemId:         string;
      kitchen_status: KitchenStatus;
      ticket_status:  KitchenTicketStatus;
    }) => {
      setTickets((prev) =>
        prev.map((ticket) => {
          if (ticket.id !== payload.ticketId) return ticket;
          return {
            ...ticket,
            ticket_status: payload.ticket_status,
            items: ticket.items.map((item) =>
              item.id === payload.itemId
                ? { ...item, kitchen_status: payload.kitchen_status }
                : item
            ),
          };
        })
      );
    });

    socket.on(EV_TICKET_READY, () => {
      // ticket_status already updated by EV_ITEM_STATUS above
    });

    socket.on(EV_FORCE_LOGOUT, () => {
      kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`).catch(() => {});
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/kitchen/${shopId}`;
    });

    // ── Initial fetch ──────────────────────────────────────
    fetchTickets();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("terminal_room_joined");
      socket.off("error");
      socket.off(EV_TICKET_CREATED);
      socket.off(EV_TICKET_UPDATED);
      socket.off(EV_ITEM_STATUS);
      socket.off(EV_TICKET_READY);
      socket.off(EV_FORCE_LOGOUT);
      socket.disconnect();
    };
  }, [shopId, fetchTickets]);

  // ── Bump item status ──────────────────────────────────────
  async function handleBumpItem(ticket: KitchenTicket, item: KitchenTicketItem) {
    const nextStatus = NEXT_ITEM_STATUS[item.kitchen_status];
    if (!nextStatus) return;
    setBumpingItems((prev) => new Set(prev).add(item.id));
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticket.id) return t;
        const updatedItems = t.items.map((i) =>
          i.id === item.id ? { ...i, kitchen_status: nextStatus } : i
        );
        const ticketStatus = deriveTicketStatus(updatedItems, t.ticket_status);
        return { ...t, ticket_status: ticketStatus, items: updatedItems };
      })
    );
    try {
      await kitchenApi.patch(
        `/api/shops/${shopId}/kitchen/tickets/${ticket.id}/items/${item.id}/status`,
        { kitchen_status: nextStatus }
      );
    } catch {
      fetchTickets();
    } finally {
      setBumpingItems((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
    }
  }

  // ── Complete ticket ───────────────────────────────────────
  async function handleCompleteTicket(ticket: KitchenTicket) {
    setCompletingIds((prev) => new Set(prev).add(ticket.id));
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    try {
      await kitchenApi.patch(
        `/api/shops/${shopId}/kitchen/tickets/${ticket.id}/status`,
        { ticket_status: "DONE" }
      );
    } catch {
      fetchTickets();
    } finally {
      setCompletingIds((prev) => { const s = new Set(prev); s.delete(ticket.id); return s; });
    }
  }

  // ── Shift / exit ──────────────────────────────────────────
  function handleEndShiftClick() {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (startStr) {
      const ms      = Date.now() - new Date(startStr).getTime();
      const hours   = Math.floor(ms / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      setShiftDuration(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }
    setShowShiftSummary(true);
  }

  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try { await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`); } catch {}
    sessionStorage.removeItem(SHIFT_START_KEY);
    window.location.href = `/kitchen/${shopId}`;
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try { await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`); } catch {}
    sessionStorage.removeItem(SHIFT_START_KEY);
    window.location.href = `/shops/${shopId}/dashboard`;
  }

  // ── Render ────────────────────────────────────────────────
  const totalActive = tickets.length;

  return (
    <>
      <div className="h-screen bg-[#111827] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-white text-[15px] font-medium">Kitchen Display</p>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[11px]">
              {totalActive} active
            </span>
            {!socketConnected && (
              <span className="px-2 py-0.5 rounded-full bg-[#BA7517]/20 text-[#D97706] text-[11px] animate-pulse">
                Reconnecting…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEndShiftClick}
              disabled={endingShift || exitingMode}
              className="px-3 h-7 text-[11px] text-white/50 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending…" : "End shift"}
            </button>
            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-3 h-7 text-[11px] text-white/30 border border-white/5 rounded-lg hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
            >
              {exitingMode ? "Exiting…" : "Exit mode"}
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden gap-3 p-4">
          {COLUMNS.map((col) => {
            const count = tickets.filter((t) => t.ticket_status === col.status).length;
            return (
              <div key={col.status} className="flex flex-col flex-1 min-w-0">
                <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${col.colour}`}>
                  <span className={`text-[13px] font-semibold ${col.colour.split(" ")[1]}`}>
                    {col.label}
                  </span>
                  <span className={`text-[11px] ${col.colour.split(" ")[1]} opacity-60`}>
                    ({count})
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {loading ? (
                    <p className="text-white/20 text-[12px] text-center py-8">Loading…</p>
                  ) : fetchError && col.status === "QUEUED" ? (
                    <div className="text-center py-8">
                      <p className="text-red-400/70 text-[12px]">{fetchError}</p>
                      <button
                        onClick={fetchTickets}
                        className="mt-2 text-[11px] text-white/30 hover:text-white/60 transition"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    tickets
                      .filter((t) => t.ticket_status === col.status)
                      .map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          bumpingItems={bumpingItems}
                          completing={completingIds.has(ticket.id)}
                          onBumpItem={handleBumpItem}
                          onComplete={handleCompleteTicket}
                        />
                      ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Shift summary modal ── */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-[#0F2B4C] px-6 py-5">
              <p className="text-white/50 text-[11px] uppercase tracking-widest mb-1">Shift complete</p>
              <p className="text-white text-[20px] font-semibold">Great work today!</p>
            </div>
            <div className="px-6 py-5">
              {shiftDuration && (
                <p className="text-[#5F5E5A] text-[14px] mb-4">
                  Shift duration: <span className="font-medium text-[#0F2B4C]">{shiftDuration}</span>
                </p>
              )}
              <button
                onClick={handleShiftConfirmed}
                className="w-full h-11 rounded-xl bg-[#0F2B4C] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
              >
                End shift &amp; log out
              </button>
              <button
                onClick={() => setShowShiftSummary(false)}
                className="w-full h-9 mt-2 text-[13px] text-[#5F5E5A] hover:text-[#0F2B4C] transition"
              >
                Continue working
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit gate ── */}
      {showExitGate && (
        <ModeGate
          shopId={shopId}
          shopName=""
          mode="KITCHEN"
          action="exit"
          allowCancel={true}
          onSuccess={handleExitConfirmed}
          onCancel={() => setShowExitGate(false)}
        />
      )}
    </>
  );
}

// ── Ticket Card component ──────────────────────────────────
interface TicketCardProps {
  ticket:       KitchenTicket;
  bumpingItems: Set<string>;
  completing:   boolean;
  onBumpItem:   (ticket: KitchenTicket, item: KitchenTicketItem) => void;
  onComplete:   (ticket: KitchenTicket) => void;
}

const TicketCard = React.memo(function TicketCard({
  ticket,
  bumpingItems,
  completing,
  onBumpItem,
  onComplete,
}: TicketCardProps) {
  const orderTypeLabel: Record<string, string> = {
    DINE_IN:  "Dine In",
    TAKEAWAY: "Takeaway",
    RETAIL:   "Retail",
    QR:       "QR Order",
  };

  const cardBg = ticket.priority === "HIGH"
    ? "bg-[#D97706]/8 border-[#D97706]/30"
    : "bg-white/5 border-white/10";

  return (
    <div className={`rounded-2xl border ${cardBg} overflow-hidden`}>
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
                {orderTypeLabel[ticket.order_type] ?? ticket.order_type}
              </span>
              {ticket.table_number && (
                <>
                  <span className="text-white/20 text-[11px]">·</span>
                  <span className="text-white/70 text-[11px] font-medium">
                    Table {ticket.table_number}
                  </span>
                </>
              )}
              {ticket.customer_name && (
                <>
                  <span className="text-white/20 text-[11px]">·</span>
                  <span className="text-white/50 text-[11px] truncate max-w-[100px]">
                    {ticket.customer_name}
                  </span>
                </>
              )}
            </div>
          </div>
          <ElapsedTime queuedAt={ticket.queued_at} />
        </div>
        {ticket.notes && (
          <p className="mt-2 text-[#D97706] text-[11px] leading-snug">
            📝 {ticket.notes}
          </p>
        )}
      </div>

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
                canBump && !isBumping
                  ? "hover:brightness-125 active:scale-[0.98] cursor-pointer"
                  : "cursor-default"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot} ${
                  item.kitchen_status === "PREPARING" ? "animate-pulse" : ""
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13px] font-medium leading-tight ${
                      isDone || isCancelled ? "text-white/40 line-through" : "text-white"
                    }`}>
                      {item.product_name !== item.item_name
                        ? `${item.product_name} — ${item.item_name}`
                        : item.item_name}
                    </p>
                    <span className={`shrink-0 text-[12px] font-bold ${
                      isDone ? "text-[#0D7A5F]" : "text-white/60"
                    }`}>
                      ×{item.qty}
                    </span>
                  </div>
                  {item.modifier_snapshot.length > 0 && (
                    <p className="text-white/30 text-[11px] mt-0.5 leading-snug">
                      {item.modifier_snapshot.map((m) => m.name).join(", ")}
                    </p>
                  )}
                  {item.item_note && (
                    <p className="text-[#D97706]/70 text-[11px] mt-0.5 leading-snug">
                      {item.item_note}
                    </p>
                  )}
                </div>
                {canBump && (
                  <div className="shrink-0 mt-0.5">
                    {isBumping ? (
                      <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />
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

      {ticket.ticket_status === "READY" && (
        <div className="px-3 pb-3">
          <button
            onClick={() => onComplete(ticket)}
            disabled={completing}
            className="w-full h-9 rounded-xl bg-[#0D7A5F] hover:bg-[#0B6B52] text-white text-[13px] font-medium active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {completing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7l3.5 3.5L11.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Mark as Done
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
});

// ── Elapsed timer ─────────────────────────────────────────
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
    <span className={`shrink-0 text-[11px] font-mono tabular-nums ${
      over ? "text-[#FF9B9B]" : "text-white/30"
    }`}>
      {label}
    </span>
  );
}

// ── Client-side ticket status derivation ──────────────────
function deriveTicketStatus(
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