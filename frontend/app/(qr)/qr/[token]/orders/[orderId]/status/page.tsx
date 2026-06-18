"use client";
// =========================================================
// app/(qr)/qr/[token]/orders/[orderId]/status/page.tsx
//
// FIX: Added CLOSING to STATUS_INFO so the Record<OrderStatus>
// is exhaustive after CLOSING was added to the OrderStatus type.
//
// Also added:
// - Socket listener for qr:table_locked and qr:order_status
//   so the UI updates instantly without waiting for the poll
// - Polling extended to also run while status is "CLOSING"
// =========================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/utils/formatCurrency";
import { getSocket }      from "@/lib/socket";
import type { Order, OrderStatus, Currency, OrderItem } from "@/types";

const STATUS_INFO: Record<OrderStatus, { label: string; desc: string; colour: string; icon: string }> = {
  OPEN:      { label: "Order received",   desc: "Your order has been received.",            colour: "#5F5E5A", icon: "⏳" },
  CONFIRMED: { label: "Being prepared",   desc: "The kitchen is preparing your order.",     colour: "#BA7517", icon: "👨‍🍳" },
  // CLOSING = customer has requested the bill, cashier is coming
  CLOSING:   { label: "Cashier coming",   desc: "A cashier will come to your table shortly.", colour: "#BA7517", icon: "🧾" },
  PAID:      { label: "All done!",         desc: "Payment confirmed. Thank you!",            colour: "#0D7A5F", icon: "✅" },
  CANCELLED: { label: "Cancelled",         desc: "This order has been cancelled.",           colour: "#A32D2D", icon: "❌" },
  REFUNDED:  { label: "Refunded",          desc: "A refund has been issued.",                colour: "#534AB7", icon: "↩️" },
};

interface OrderStatusData extends Order {
  items:    OrderItem[];
  currency: Currency;
}

export default function OrderStatusPage() {
  const { token, orderId } = useParams<{ token: string; orderId: string }>();

  const [order, setOrder]     = useState<OrderStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/orders/${orderId}`
      );
      if (!res.ok) throw new Error("Order not found.");
      const data: OrderStatusData = await res.json();
      setOrder(data);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [token, orderId]);

  // ── Initial load + polling ─────────────────────────────
  // Poll while OPEN, CONFIRMED, or CLOSING (any non-terminal state)
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (
        order?.status === "OPEN"      ||
        order?.status === "CONFIRMED" ||
        order?.status === "CLOSING"
      ) {
        load();
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [load, order?.status]);

  // ── Socket: instant updates without waiting for poll ──
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Join the QR session room for this order
    socket.emit("join_qr_session", orderId);

    // qr:order_status — status changed (CONFIRMED, PAID, etc.)
    socket.on("qr:order_status", (payload: { newStatus: string }) => {
      setOrder((prev) =>
        prev ? { ...prev, status: payload.newStatus as OrderStatus } : prev
      );
    });

    // qr:table_locked — customer requested bill → CLOSING
    socket.on("qr:table_locked", () => {
      setOrder((prev) =>
        prev ? { ...prev, status: "CLOSING" as OrderStatus } : prev
      );
    });

    // qr:table_reopened — cashier unlocked → back to OPEN
    socket.on("qr:table_reopened", () => {
      setOrder((prev) =>
        prev ? { ...prev, status: "OPEN" as OrderStatus } : prev
      );
    });

    return () => {
      socket.off("qr:order_status");
      socket.off("qr:table_locked");
      socket.off("qr:table_reopened");
    };
  }, [orderId]);

  const currency   = order?.currency ?? "THB";
  const statusInfo = order ? STATUS_INFO[order.status] : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[14px] text-[#5F5E5A]">Loading order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-[18px] font-medium text-[#0F2B4C] mb-2">Order not found</p>
          <p className="text-[13px] text-[#5F5E5A]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1EFE8]">
      {/* Header */}
      <div className="bg-white border-b border-[#D3D1C7] px-4 py-3">
        <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide">Order status</p>
        <p className="text-[18px] font-medium text-[#0F2B4C] font-mono">{order.order_no}</p>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Status card */}
        <div className="bg-white rounded-2xl p-6 text-center">
          <div className="text-[48px] mb-3">{statusInfo?.icon}</div>
          <p
            className="text-[22px] font-medium mb-1"
            style={{ color: statusInfo?.colour }}
          >
            {statusInfo?.label}
          </p>
          <p className="text-[13px] text-[#5F5E5A]">{statusInfo?.desc}</p>

          {/* Pulse indicator for active (non-terminal) states */}
          {(order.status === "OPEN" || order.status === "CONFIRMED" || order.status === "CLOSING") && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: statusInfo?.colour,
                  animation: "pulse 2s infinite",
                }}
              />
              <p className="text-[11px]" style={{ color: statusInfo?.colour }}>Updating automatically</p>
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl p-5">
          <p className="text-[13px] font-medium text-[#5F5E5A] uppercase tracking-wide mb-3">Your items</p>
          <div className="space-y-2">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between text-[13px]">
                <div>
                  <p className="text-[#0F2B4C] font-medium">{item.qty}× {item.item_name_snapshot}</p>
                  {item.modifier_snapshot?.length > 0 && (
                    <p className="text-[11px] text-[#5F5E5A]">
                      {item.modifier_snapshot.map(m => m.name).join(", ")}
                    </p>
                  )}
                  {item.item_note && (
                    <p className="text-[11px] text-[#BA7517] italic">{item.item_note}</p>
                  )}
                </div>
                <span className="text-[#0D7A5F] font-medium ml-4 flex-shrink-0">
                  {formatCurrency(Number(item.subtotal), currency)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-[#F1EFE8] mt-4 pt-3 space-y-1 text-[13px]">
            {Number(order.tax_amount) > 0 && (
              <div className="flex justify-between text-[#5F5E5A]">
                <span>Tax</span>
                <span>{formatCurrency(Number(order.tax_amount), currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-[#0F2B4C] text-[15px]">
              <span>Total</span>
              <span>{formatCurrency(Number(order.total_amount), currency)}</span>
            </div>
          </div>
        </div>

        {/* Back to menu — only when not CLOSING or PAID */}
        {order.status !== "CLOSING" && order.status !== "PAID" && (
          <a
            href={`/qr/${token}`}
            className="block w-full text-center py-3 text-[13px] text-[#0D7A5F] font-medium"
          >
            ← Back to menu
          </a>
        )}
      </div>
    </div>
  );
}