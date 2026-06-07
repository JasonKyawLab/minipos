"use client";

// =========================================================
// app/(kitchen)/kitchen/[shopId]/display/page.tsx
// Path: frontend/app/(kitchen)/kitchen/[shopId]/display/page.tsx
//
// Kitchen Display System (KDS) — the main working screen.
//
// ── WHAT THIS PAGE DOES ───────────────────────────────────
// Shows all active kitchen tickets in a Kanban-style board:
//
//   [QUEUED]  →  [IN PROGRESS]  →  [READY]
//
// Chef taps an item to advance it:
//   PENDING → PREPARING → READY
//
// The backend recalculates ticket status atomically when all
// items reach READY → ticket moves to READY column.
//
// Chef taps "Done" on a READY ticket → ticket disappears
// (status = DONE, no longer returned by GET /tickets).
//
// ── REAL-TIME UPDATES ─────────────────────────────────────
// Socket events keep the board live without polling:
//
//   kitchen:ticket_created  → new order arrived, add to board
//   kitchen:ticket_updated  → ticket status changed (DONE/CANCELLED)
//   kitchen:item_status     → single item bumped by another device
//   kitchen:ticket_ready    → all items ready, play visual alert
//   kitchen:force_logout    → owner kicked this chef out remotely
//
// ── API ENDPOINTS USED ────────────────────────────────────
//   GET    /api/shops/:shopId/kitchen/tickets
//   PATCH  /api/shops/:shopId/kitchen/tickets/:ticketId/items/:itemId/status
//   PATCH  /api/shops/:shopId/kitchen/tickets/:ticketId/status
//   POST   /api/shops/:shopId/kitchen-auth/logout
// =========================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams }  from "next/navigation";
import kitchenApi     from "@/lib/kitchenApi";
import { ModeGate }   from "@/components/mode/ModeGate";
import { getSocket }  from "@/lib/socket";

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
}

// ── Socket event names (must match socket.events.ts) ─────

const EV_TICKET_CREATED = "kitchen:ticket_created";
const EV_TICKET_UPDATED = "kitchen:ticket_updated";
const EV_ITEM_STATUS    = "kitchen:item_status";
const EV_TICKET_READY   = "kitchen:ticket_ready";
const EV_FORCE_LOGOUT   = "kitchen:force_logout";

// ── Constants ─────────────────────────────────────────────

const SHIFT_START_KEY = "minipos_kitchen_shift_start";

// Active statuses shown on the board. DONE and CANCELLED are
// excluded — once done, the ticket disappears from the board.
const ACTIVE_STATUSES: KitchenTicketStatus[] = ["QUEUED", "IN_PROGRESS", "READY"];

// Next item status when chef taps an item
const NEXT_ITEM_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  PENDING:   "PREPARING",
  PREPARING: "READY",
};

// Column definitions for the Kanban board
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
  return Date.now() - new Date(queuedAt).getTime() > 15 * 60_000; // 15 min
}

function getShiftDuration(): string {
  const startStr = sessionStorage.getItem(SHIFT_START_KEY);
  if (!startStr) return "Unknown";
  const diffMs  = Date.now() - new Date(startStr).getTime();
  const hours   = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ── Component ─────────────────────────────────────────────

export default function KitchenDisplayPage() {
  const { shopId } = useParams<{ shopId: string }>();

  // ── Ticket state ──────────────────────────────────────────
  const [tickets, setTickets]         = useState<KitchenTicket[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // ── Optimistic update tracking ────────────────────────────
  const [bumpingItems, setBumpingItems]     = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds]   = useState<Set<string>>(new Set());

  // ── Shift / exit state ────────────────────────────────────
  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // ── Connection banner ─────────────────────────────────────
  const [socketConnected, setSocketConnected] = useState(true);

  // ── Socket ref — stable across re-renders ─────────────────
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  // ─────────────────────────────────────────────────────────
  // FETCH TICKETS
  // ─────────────────────────────────────────────────────────
  // Loads all active tickets on mount and after reconnect.
  // The backend returns QUEUED + IN_PROGRESS + READY in one
  // query with items aggregated as JSON — no N+1 problem.
  const fetchTickets = useCallback(async () => {
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
    }
  }, [shopId]);

  // ─────────────────────────────────────────────────────────
  // SOCKET SETUP
  // ─────────────────────────────────────────────────────────
  //
  // WHY we don't call socket.disconnect() in cleanup:
  //   getSocket() returns a singleton. Calling disconnect()
  //   on unmount destroys the shared instance — any other
  //   component that calls getSocket() gets a dead socket.
  //   We only remove our listeners; the connection stays alive.
  //
  // WHY we call fetchTickets() immediately AND on connect:
  //   If the socket is already connected when this component
  //   mounts, the "connect" event never fires. The immediate
  //   fetchTickets() call handles that case.
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Register all listeners BEFORE connecting so we never
    // miss an event that fires during the connect handshake.

    socket.on("connect",    () => { setSocketConnected(true); fetchTickets(); });
    socket.on("disconnect", () => setSocketConnected(false));

    // ── kitchen:ticket_created ─────────────────────────────
    socket.on(EV_TICKET_CREATED, async (payload: { ticketId: string }) => {
      if (!payload.ticketId) return;
      try {
        const { data } = await kitchenApi.get<KitchenTicket>(
          `/api/shops/${shopId}/kitchen/tickets/${payload.ticketId}`
        );
        setTickets((prev) => {
          const exists = prev.some((t) => t.id === data.id);
          if (exists) return prev;
          return [data, ...prev];
        });
      } catch {
        fetchTickets();
      }
    });

    // ── kitchen:ticket_updated ─────────────────────────────
    socket.on(EV_TICKET_UPDATED, (payload: {
      ticketId?:      string;
      orderId?:       string;
      ticket_status:  KitchenTicketStatus;
    }) => {
      // payload.ticketId for status updates, payload.orderId for cancel
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

    // ── kitchen:item_status ────────────────────────────────
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

    // ── kitchen:ticket_ready ───────────────────────────────
    socket.on(EV_TICKET_READY, (_payload: { ticketId: string }) => {
      // ticket_status already updated by EV_ITEM_STATUS above
    });

    // ── kitchen:force_logout ──────────────────────────────
    socket.on(EV_FORCE_LOGOUT, () => {
      kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`).catch(() => {});
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/kitchen/${shopId}`;
    });

    // Connect AFTER listeners are registered
    if (!socket.connected) {
      socket.connect();
    } else {
      // Already connected — fire fetchTickets manually since
      // the "connect" event won't fire again
      setSocketConnected(true);
      fetchTickets();
    }

    // Shift start
    if (!sessionStorage.getItem(SHIFT_START_KEY)) {
      sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
    }

    return () => {
      // Remove only OUR listeners — do NOT disconnect the singleton
      socket.off("connect");
      socket.off("disconnect");
      socket.off(EV_TICKET_CREATED);
      socket.off(EV_TICKET_UPDATED);
      socket.off(EV_ITEM_STATUS);
      socket.off(EV_TICKET_READY);
      socket.off(EV_FORCE_LOGOUT);
    };
  }, [shopId, fetchTickets]);

  // ── Initial fetch (independent of socket) ─────────────────
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // ── Polling fallback — every 8 seconds ────────────────────
  // Safety net: if socket events don't arrive for any reason
  // (wrong room, reconnect gap, deploy lag), the board stays
  // accurate. Silent background re-fetch — no loading spinner.
  useEffect(() => {
    const id = setInterval(() => {
      fetchTickets();
    }, 8_000);
    return () => clearInterval(id);
  }, [fetchTickets]);

  // ── Elapsed time ticker ───────────────────────────────────
  // Removed — ElapsedTime component handles its own interval
  // so only the time label re-renders, not the whole board.

  // ─────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────

  // Bump a single item to its next status.
  // Optimistic: update local state immediately, revert on error.
  async function handleBumpItem(ticket: KitchenTicket, item: KitchenTicketItem) {
    const nextStatus = NEXT_ITEM_STATUS[item.kitchen_status];
    if (!nextStatus) return; // READY/SERVED/CANCELLED items are not tappable

    // Prevent double-tap
    if (bumpingItems.has(item.id)) return;
    setBumpingItems((s) => new Set(s).add(item.id));

    // Optimistic update
    const prevTickets = tickets;
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticket.id) return t;
        const updatedItems = t.items.map((i) =>
          i.id === item.id ? { ...i, kitchen_status: nextStatus } : i
        );
        // Recalculate ticket status client-side for instant feedback
        const ticketStatus = deriveTicketStatus(updatedItems, t.ticket_status);
        return { ...t, ticket_status: ticketStatus, items: updatedItems };
      })
    );

    try {
      await kitchenApi.patch(
        `/api/shops/${shopId}/kitchen/tickets/${ticket.id}/items/${item.id}/status`,
        { kitchen_status: nextStatus }
      );
      // Server response triggers socket event which will confirm the state.
      // No need to re-fetch — socket event is authoritative.
    } catch {
      // Revert on error
      setTickets(prevTickets);
    } finally {
      setBumpingItems((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
    }
  }

  // Mark entire ticket as DONE (removes it from the board).
  async function handleCompleteTicket(ticket: KitchenTicket) {
    if (completingIds.has(ticket.id)) return;
    setCompletingIds((s) => new Set(s).add(ticket.id));

    // Optimistic remove
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id));

    try {
      await kitchenApi.patch(
        `/api/shops/${shopId}/kitchen/tickets/${ticket.id}/status`,
        { ticket_status: "DONE" }
      );
    } catch {
      // Revert — put the ticket back
      fetchTickets();
    } finally {
      setCompletingIds((s) => {
        const next = new Set(s);
        next.delete(ticket.id);
        return next;
      });
    }
  }

  // ── Shift / exit ──────────────────────────────────────────
  function handleEndShiftClick() {
    setShiftDuration(getShiftDuration());
    setShowShiftSummary(true);
  }

  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try {
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch { /* non-fatal */ } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/kitchen/${shopId}`;
    }
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try {
      await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`);
    } catch { /* non-fatal */ } finally {
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/shops/${shopId}/dashboard`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-white/30 text-[11px] uppercase tracking-widest">
                Kitchen Display
              </p>
              <p className="text-white text-[15px] font-medium">Live Orders</p>
            </div>

            {/* Socket status dot */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
              socketConnected
                ? "bg-[#0D7A5F]/20 text-[#0D7A5F]"
                : "bg-[#D97706]/20 text-[#D97706]"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                socketConnected ? "bg-[#0D7A5F]" : "bg-[#D97706] animate-pulse"
              }`} />
              {socketConnected ? "Live" : "Reconnecting…"}
            </div>
          </div>

          {/* Ticket count badges */}
          <div className="flex items-center gap-2">
            {COLUMNS.map((col) => {
              const count = tickets.filter((t) => t.ticket_status === col.status).length;
              if (count === 0) return null;
              return (
                <div key={col.status} className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${col.colour}`}>
                  {count} {col.label}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleEndShiftClick}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/50 border border-white/10 rounded-lg hover:bg-white/8 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending…" : "End Shift"}
            </button>
            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-4 h-8 text-[12px] text-white/30 border border-white/10 rounded-lg hover:bg-white/8 hover:text-white transition disabled:opacity-40"
            >
              Exit Mode
            </button>
          </div>
        </header>

        {/* ── Disconnection banner ── */}
        {!socketConnected && (
          <div className="bg-[#D97706]/10 border-b border-[#D97706]/20 px-6 py-2 text-center">
            <p className="text-[#D97706] text-[12px]">
              Connection lost — orders may be delayed. Attempting to reconnect…
            </p>
          </div>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 overflow-hidden">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-white/30 text-[13px]">Loading orders…</p>
            </div>
          )}

          {/* Fetch error */}
          {!loading && fetchError && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-white/40 text-[14px]">{fetchError}</p>
              <button
                onClick={fetchTickets}
                className="px-5 h-9 text-[13px] text-white/60 border border-white/20 rounded-xl hover:bg-white/8 transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty board */}
          {!loading && !fetchError && tickets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="6" y="8" width="20" height="16" rx="2" stroke="white" strokeWidth="1.5" strokeOpacity="0.3" />
                  <path d="M11 14h10M11 18h6" stroke="white" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-white/40 text-[15px] font-medium">No active orders</p>
              <p className="text-white/20 text-[13px]">New orders will appear here instantly</p>
            </div>
          )}

          {/* Kanban board */}
          {!loading && !fetchError && tickets.length > 0 && (
            <div className="h-full grid grid-cols-3 divide-x divide-white/10 overflow-hidden">
              {COLUMNS.map((col) => {
                const colTickets = tickets
                  .filter((t) => t.ticket_status === col.status)
                  .sort((a, b) => {
                    // HIGH priority first, then oldest first (FIFO)
                    if (a.priority !== b.priority) {
                      return a.priority === "HIGH" ? -1 : 1;
                    }
                    return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
                  });

                return (
                  <div key={col.status} className="flex flex-col overflow-hidden">
                    {/* Column header */}
                    <div className={`px-4 py-2.5 border-b border-white/10 shrink-0`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-semibold uppercase tracking-wider ${col.colour.split(" ")[1]}`}>
                          {col.label}
                        </span>
                        {colTickets.length > 0 && (
                          <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                            col.status === "QUEUED"      ? "bg-[#D97706]/20 text-[#D97706]" :
                            col.status === "IN_PROGRESS" ? "bg-[#534AB7]/20 text-[#534AB7]" :
                                                           "bg-[#0D7A5F]/20 text-[#0D7A5F]"
                          }`}>
                            {colTickets.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tickets in this column */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      {colTickets.length === 0 && (
                        <p className="text-white/15 text-[12px] text-center mt-6">Empty</p>
                      )}
                      {colTickets.map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          bumpingItems={bumpingItems}
                          completing={completingIds.has(ticket.id)}
                          onBumpItem={handleBumpItem}
                          onComplete={handleCompleteTicket}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── Shift summary modal ── */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-[#0A0A0A] px-6 py-5">
              <p className="text-white/30 text-[11px] uppercase tracking-widest mb-1">End of shift</p>
              <p className="text-white text-[20px] font-semibold">Good work today!</p>
            </div>
            <div className="px-6 py-5">
              <div className="bg-[#F1EFE8] rounded-xl p-4 mb-5">
                <p className="text-[12px] text-[#5F5E5A] mb-0.5">Shift duration</p>
                <p className="text-[28px] font-semibold text-[#0F2B4C] leading-tight">{shiftDuration}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowShiftSummary(false)}
                  className="flex-1 h-10 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-xl hover:bg-[#F1EFE8] transition"
                >
                  Stay logged in
                </button>
                <button
                  onClick={handleShiftConfirmed}
                  className="flex-1 h-10 text-[13px] font-medium text-white bg-[#0A0A0A] rounded-xl hover:bg-[#1A1A1A] transition"
                >
                  End shift →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit mode gate ── */}
      {showExitGate && (
        <ModeGate
          shopId={shopId as string}
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

// ─────────────────────────────────────────────────────────
// ELAPSED TIME
// ─────────────────────────────────────────────────────────
// Isolated into its own component with its own interval so
// only this tiny label re-renders every second — not the
// entire ticket card or the whole board.
// ─────────────────────────────────────────────────────────

function ElapsedTime({ queuedAt }: { queuedAt: string }) {
  const [label, setLabel] = useState(() => elapsedLabel(queuedAt));
  const overdue = isOverdue(queuedAt);

  useEffect(() => {
    // Update immediately, then every second
    setLabel(elapsedLabel(queuedAt));
    const id = setInterval(() => {
      setLabel(elapsedLabel(queuedAt));
    }, 1_000);
    return () => clearInterval(id);
  }, [queuedAt]);

  return (
    <div className={`shrink-0 text-[11px] font-medium tabular-nums ${
      overdue ? "text-[#FF6B6B]" : "text-white/30"
    }`}>
      {label}
      {overdue && <span className="ml-1">⚠</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// TICKET CARD
// ─────────────────────────────────────────────────────────
// React.memo prevents re-renders unless ticket data,
// bumpingItems, or completing actually changes.
// The elapsed time label is handled by ElapsedTime above —
// it has its own interval and re-renders independently.
// ─────────────────────────────────────────────────────────

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
      {/* ── Ticket header ── */}
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

          {/* ElapsedTime is isolated — only it re-renders on tick */}
          <ElapsedTime queuedAt={ticket.queued_at} />
        </div>

        {ticket.notes && (
          <p className="mt-2 text-[#D97706] text-[11px] leading-snug">
            📝 {ticket.notes}
          </p>
        )}
      </div>

      {/* ── Items list ── */}
      <div className="px-3 py-2 space-y-1.5">
        {ticket.items.map((item) => {
          const isBumping  = bumpingItems.has(item.id);
          const canBump    = item.kitchen_status === "PENDING" || item.kitchen_status === "PREPARING";
          const isDone     = item.kitchen_status === "READY" || item.kitchen_status === "SERVED";
          const isCancelled = item.kitchen_status === "CANCELLED";

          const itemBg =
            isCancelled         ? "bg-white/3 opacity-40"     :
            isDone              ? "bg-[#0D7A5F]/10"           :
            item.kitchen_status === "PREPARING" ? "bg-[#534AB7]/10" :
                                  "bg-white/5";

          const statusDot =
            isCancelled         ? "bg-white/20"    :
            isDone              ? "bg-[#0D7A5F]"   :
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
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot} ${
                  item.kitchen_status === "PREPARING" ? "animate-pulse" : ""
                }`} />

                <div className="flex-1 min-w-0">
                  {/* Item name + qty */}
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

                  {/* Modifiers */}
                  {item.modifier_snapshot.length > 0 && (
                    <p className="text-white/30 text-[11px] mt-0.5 leading-snug">
                      {item.modifier_snapshot.map((m) => m.name).join(", ")}
                    </p>
                  )}

                  {/* Item note */}
                  {item.item_note && (
                    <p className="text-[#D97706]/70 text-[11px] mt-0.5 leading-snug">
                      {item.item_note}
                    </p>
                  )}
                </div>

                {/* Tap indicator for tappable items */}
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

      {/* ── Done button (only on READY tickets) ── */}
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
}); // React.memo

// ─────────────────────────────────────────────────────────
// CLIENT-SIDE TICKET STATUS DERIVATION
// ─────────────────────────────────────────────────────────
// Mirrors the backend deriveTicketStatus() logic so that
// optimistic updates show the correct column instantly.
// The socket event will confirm (or correct) the real value.
// ─────────────────────────────────────────────────────────

function deriveTicketStatus(
  items: KitchenTicketItem[],
  current: KitchenTicketStatus
): KitchenTicketStatus {
  const active = items.filter(
    (i) => i.kitchen_status !== "CANCELLED" && i.kitchen_status !== "SERVED"
  );
  if (active.length === 0) return current; // no active items — no change

  const allReady     = active.every((i) => i.kitchen_status === "READY");
  const anyPreparing = active.some((i)  => i.kitchen_status === "PREPARING");

  if (allReady)     return "READY";
  if (anyPreparing) return "IN_PROGRESS";
  return "QUEUED";
}