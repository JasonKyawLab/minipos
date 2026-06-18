"use client";
// =========================================================
// app/(qr)/qr/[token]/table/orders/page.tsx
//
// The "My Orders" / running tab page.
// Customer sees all items ordered this sitting, grouped by
// round. Shows combined total. Offers two actions:
//   1. Add more items → back to menu
//   2. Request bill   → locks table, notifies cashier
//
// States:
//   OPEN    → normal view with both action buttons
//   CLOSING → read-only "Cashier is on the way" screen
//   PAID    → "All done, thank you!" screen
//   null    → no active session, redirect to menu
//
// Socket events listened:
//   qr:table_locked   → switch to CLOSING view instantly
//   qr:table_reopened → switch back to OPEN view
//   qr:order_status   → handle PAID transition
// =========================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency } from "@/utils/formatCurrency";
import { getSocket }      from "@/lib/socket";
import type { Currency }  from "@/types";

// ── Types ─────────────────────────────────────────────────

type SessionStatus = "OPEN" | "CLOSING" | "PAID" | "CANCELLED";

interface SessionItem {
  id:                string;
  product_name:      string;
  item_name:         string;
  unit_price:        number;
  qty:               number;
  subtotal:          number;
  modifier_snapshot: Array<{ name: string; price_delta: number }>;
  item_note:         string | null;
  round:             number | null;
  is_addon:          boolean | null;
  created_at:        string;
}

interface TableSession {
  order_id:       string;
  order_no:       string;
  status:         SessionStatus;
  bill_requested: boolean;
  subtotal:       number;
  tax_amount:     number;
  total_amount:   number;
  customer_name:  string | null;
  currency:       Currency;
  items:          SessionItem[];
}

// ── Component ─────────────────────────────────────────────

export default function TableOrdersPage() {
  const { token }   = useParams<{ token: string }>();
  const router      = useRouter();

  const [session, setSession]   = useState<TableSession | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [requesting, setRequesting] = useState(false);

  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  // ── Load session ─────────────────────────────────────────
  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/table/session`
      );
      if (!res.ok) throw new Error("Session not found.");
      const data: TableSession | null = await res.json();

      if (!data) {
        // No active session — send back to menu
        router.replace(`/qr/${token}`);
        return;
      }
      setSession(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // ── Socket ────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.order_id) return;

    const socket = getSocket();
    socketRef.current = socket;

    // Join the qr_session room for this order
    socket.emit("join_qr_session", session.order_id);

    // Table locked — cashier has been notified
    socket.on("qr:table_locked", () => {
      setSession(prev => prev ? { ...prev, status: "CLOSING", bill_requested: true } : prev);
    });

    // Table reopened — cashier unlocked
    socket.on("qr:table_reopened", () => {
      setSession(prev => prev ? { ...prev, status: "OPEN", bill_requested: false } : prev);
    });

    // Order paid
    socket.on("qr:order_status", (payload: { newStatus: string }) => {
      if (payload.newStatus === "PAID") {
        setSession(prev => prev ? { ...prev, status: "PAID" } : prev);
      }
    });

    return () => {
      socket.off("qr:table_locked");
      socket.off("qr:table_reopened");
      socket.off("qr:order_status");
    };
  }, [session?.order_id]);

  // ── Request bill ──────────────────────────────────────────
  async function handleRequestBill() {
    if (requesting || session?.status !== "OPEN") return;
    setRequesting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/table/request-bill`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "REQUEST_FAILED");
      }
      // Optimistically update — socket event will confirm
      setSession(prev => prev ? { ...prev, status: "CLOSING", bill_requested: true } : prev);
    } catch (err: any) {
      alert(err.message === "NO_ACTIVE_ORDER" ? "No active order found." : "Something went wrong. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  // ── Group items by round ──────────────────────────────────
  // Round null means items added before the round tracking migration
  // — show them in a single group.
  function groupByRound(items: SessionItem[]) {
    const groups = new Map<number, SessionItem[]>();
    for (const item of items) {
      const round = item.round ?? 1;
      if (!groups.has(round)) groups.set(round, []);
      groups.get(round)!.push(item);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[14px] text-[#5F5E5A]">Loading your orders…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-[18px] font-medium text-[#0F2B4C] mb-2">No active order</p>
          <p className="text-[13px] text-[#5F5E5A] mb-4">Your session may have ended.</p>
          <button
            onClick={() => router.push(`/qr/${token}`)}
            className="px-4 py-2 bg-[#0F2B4C] text-white text-[13px] rounded-xl"
          >
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  const currency   = session.currency;
  const roundGroups = groupByRound(session.items);

  // ── PAID state ────────────────────────────────────────────
  if (session.status === "PAID") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-[#F9F8F5]">
        <div className="text-[56px] mb-4">🙏</div>
        <h1 className="text-[22px] font-semibold text-[#0F2B4C] mb-2">
          Thank you!
        </h1>
        <p className="text-[14px] text-[#5F5E5A] mb-1">Payment confirmed.</p>
        <p className="text-[13px] text-[#9B9891]">Order {session.order_no}</p>
      </div>
    );
  }

  // ── CLOSING state — bill requested ────────────────────────
  if (session.status === "CLOSING") {
    return (
      <div className="min-h-screen bg-[#F9F8F5] pb-8">
        {/* Header */}
        <div className="bg-white border-b border-[#E8E6E0] px-4 py-3">
          <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wider font-medium">Your orders</p>
          <h1 className="text-[17px] font-semibold text-[#0F2B4C]">{session.order_no}</h1>
        </div>

        {/* Status banner */}
        <div className="mx-4 mt-4 p-4 bg-[#FFF8EC] border border-[#BA7517]/30 rounded-2xl flex items-start gap-3">
          <span className="text-[24px]">🧾</span>
          <div>
            <p className="text-[14px] font-semibold text-[#BA7517]">Cashier is on the way</p>
            <p className="text-[12px] text-[#5F5E5A] mt-0.5">
              Your bill request has been sent. A cashier will come to your table shortly.
            </p>
          </div>
        </div>

        {/* Items summary */}
        <div className="px-4 mt-4">
          <ItemList roundGroups={roundGroups} currency={currency} />
          <TotalRow session={session} currency={currency} />
        </div>
      </div>
    );
  }

  // ── OPEN state — normal view ──────────────────────────────
  return (
    <div className="min-h-screen bg-[#F9F8F5] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E6E0] px-4 py-3">
        <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wider font-medium">My orders</p>
        <h1 className="text-[17px] font-semibold text-[#0F2B4C]">{session.order_no}</h1>
      </div>

      {/* Items grouped by round */}
      <div className="px-4 pt-4">
        <ItemList roundGroups={roundGroups} currency={currency} />
        <TotalRow session={session} currency={currency} />
      </div>

      {/* Actions */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-3 bg-gradient-to-t from-white via-white to-transparent space-y-2">
        {/* Add more items */}
        <button
          onClick={() => router.push(`/qr/${token}`)}
          className="w-full h-12 rounded-2xl border-2 border-[#0F2B4C] text-[#0F2B4C] text-[14px] font-semibold active:scale-[0.98] transition"
        >
          + Add more items
        </button>

        {/* Request bill */}
        <button
          onClick={handleRequestBill}
          disabled={requesting || session.items.length === 0}
          className="w-full h-12 rounded-2xl bg-[#0D7A5F] text-white text-[14px] font-semibold disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          {requesting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending request…
            </>
          ) : (
            "🧾 Request bill"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Item list ─────────────────────────────────────────────

function ItemList({
  roundGroups,
  currency,
}: {
  roundGroups: [number, SessionItem[]][];
  currency:    Currency;
}) {
  if (roundGroups.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[14px] text-[#5F5E5A]">No items yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 mb-4">
      {roundGroups.map(([round, items]) => (
        <div key={round}>
          {/* Round heading */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              round === 1
                ? "bg-[#E8F5F1] text-[#0D7A5F]"
                : "bg-[#FFF3E0] text-[#BA7517]"
            }`}>
              {round === 1 ? "First order" : `Add-on · Round ${round}`}
            </span>
            <div className="flex-1 h-px bg-[#E8E6E0]" />
          </div>

          {/* Items */}
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0F2B4C] leading-tight">
                    {item.product_name}
                    {item.item_name !== item.product_name && (
                      <span className="text-[#5F5E5A] font-normal"> · {item.item_name}</span>
                    )}
                  </p>
                  {item.modifier_snapshot?.length > 0 && (
                    <p className="text-[11px] text-[#5F5E5A]">
                      {item.modifier_snapshot.map(m => m.name).join(", ")}
                    </p>
                  )}
                  {item.item_note && (
                    <p className="text-[11px] text-[#9B9891] italic">{item.item_note}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] text-[#5F5E5A]">×{item.qty}</p>
                  <p className="text-[13px] font-medium text-[#0F2B4C]">
                    {formatCurrency(item.subtotal, currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Total row ─────────────────────────────────────────────

function TotalRow({ session, currency }: { session: TableSession; currency: Currency }) {
  return (
    <div className="border-t border-[#E8E6E0] pt-3 space-y-1">
      <div className="flex justify-between text-[12px] text-[#5F5E5A]">
        <span>Subtotal</span>
        <span>{formatCurrency(session.subtotal, currency)}</span>
      </div>
      {session.tax_amount > 0 && (
        <div className="flex justify-between text-[12px] text-[#5F5E5A]">
          <span>Tax</span>
          <span>{formatCurrency(session.tax_amount, currency)}</span>
        </div>
      )}
      <div className="flex justify-between text-[15px] font-bold text-[#0F2B4C] pt-1">
        <span>Total</span>
        <span>{formatCurrency(session.total_amount, currency)}</span>
      </div>
    </div>
  );
}