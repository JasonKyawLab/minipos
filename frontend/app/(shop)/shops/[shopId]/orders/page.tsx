"use client";
// =========================================================
// app/(shop)/shops/[shopId]/orders/page.tsx
//
// FIX: Added CLOSING to:
//   1. Local type OrderStatus union
//   2. STATUS_LABELS map
//   3. STATUS_STYLES map
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { usePathname }      from "next/navigation";
import { useShop }          from "@/context/ShopContext";
import api                  from "@/lib/api";
import { getErrorMessage }  from "@/utils/errorMessages";
import { formatCurrency }   from "@/utils/formatCurrency";
import { formatDateTime }   from "@/utils/formatDate";
import toast                from "react-hot-toast";
import { SkeletonTable }    from "@/components/ui/Skeleton";
import { EmptyState }       from "@/components/states";

// ── Types ─────────────────────────────────────────────────

type OrderType =
  | "RETAIL" | "DINE_IN" | "TAKEAWAY"
  | "QR"     | "ONLINE"  | "DELIVERY" | "PICKUP";

type OrderStatus =
  | "OPEN" | "CONFIRMED" | "CLOSING" | "PAID" | "CANCELLED" | "REFUNDED";

interface ModifierSnapshot {
  modifier_option_id: string;
  name:               string;
  price_delta:        number;
}

interface OrderItem {
  id:                    string;
  order_id:              string;
  product_item_id:       string | null;
  product_name_snapshot: string;
  item_name_snapshot:    string;
  unit_price_snapshot:   number;
  qty:                   number;
  subtotal:              number;
  status:                string;
  modifier_snapshot:     ModifierSnapshot[];
  item_note:             string | null;
  created_at:            string;
}

interface Order {
  id:               string;
  shop_id:          string;
  order_no:         string;
  order_type:       OrderType;
  status:           OrderStatus;
  table_id:         string | null;
  cashier_id:       string | null;
  subtotal:         number;
  tax_amount:       number;
  discount_amount:  number;
  total_amount:     number;
  customer_name:    string | null;
  customer_phone:   string | null;
  delivery_address: string | null;
  delivery_note:    string | null;
  notes:            string | null;
  cancelled_at:     string | null;
  completed_at:     string | null;
  created_at:       string;
  updated_at:       string;
  items?:           OrderItem[];
  cashier_name:     string | null;
  table_number:     string | null;
}

interface Payment {
  id:              string;
  order_id:        string;
  method:          string;
  amount:          number;
  received_amount: number | null;
  change_amount:   number | null;
  status:          string;
  note:            string | null;
  paid_at:         string | null;
  created_at:      string;
}

interface OrderDetail extends Order {
  payments?: Payment[];
}

// ── Helpers ───────────────────────────────────────────────

function getDefaultDateRange() {
  const today = new Date().toLocaleDateString("en-CA");
  return { from: today, to: today };
}

const TYPE_LABELS: Record<OrderType, string> = {
  RETAIL:   "Retail",
  DINE_IN:  "Dine-in",
  TAKEAWAY: "Takeaway",
  QR:       "QR Order",
  ONLINE:   "Online",
  DELIVERY: "Delivery",
  PICKUP:   "Pickup",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN:      "Open",
  CONFIRMED: "Confirmed",
  CLOSING:   "Closing",     // table session requested bill
  PAID:      "Paid",
  CANCELLED: "Cancelled",
  REFUNDED:  "Refunded",
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  OPEN:      "bg-[#EAF0FB] text-[#2B5BA8]",
  CONFIRMED: "bg-[#FFF4E0] text-[#BA7517]",
  CLOSING:   "bg-[#FFF4E0] text-[#BA7517]",  // same amber — table is almost done
  PAID:      "bg-[#E1F5EE] text-[#0D7A5F]",
  CANCELLED: "bg-[#FCEBEB] text-[#A32D2D]",
  REFUNDED:  "bg-[#F3F0FA] text-[#534AB7]",
};

// ── Component ─────────────────────────────────────────────

export default function OrdersPage() {
  const { shopId, currency, userRole } = useShop();
  const pathname = usePathname();

  const canRefund = ["OWNER", "MANAGER"].includes(userRole);

  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const limit = 30;

  const { from: defFrom, to: defTo } = getDefaultDateRange();
  const [dateFrom,     setDateFrom]     = useState(defFrom);
  const [dateTo,       setDateTo]       = useState(defTo);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [typeFilter,   setTypeFilter]   = useState<OrderType | "">("");

  const [detail,        setDetail]        = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding,    setRefunding]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        from:   dateFrom,
        to:     dateTo,
        limit,
        offset: (page - 1) * limit,
      };
      if (statusFilter) params.status     = statusFilter;
      if (typeFilter)   params.order_type = typeFilter;

      const { data } = await api.get<Order[]>(
        `/api/shops/${shopId}/orders`, { params }
      );

      setOrders(Array.isArray(data) ? data : []);
      setTotal(Array.isArray(data) ? data.length : 0);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoading(false);
    }
  }, [shopId, dateFrom, dateTo, statusFilter, typeFilter, page]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, statusFilter, typeFilter]);
  useEffect(() => { load(); }, [load]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [pathname]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", load);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  async function openDetail(orderId: string) {
    setDetail(null);
    setLoadingDetail(true);
    setRefundAmount("");
    setRefundReason("");
    try {
      const { data: order } = await api.get<OrderDetail>(
        `/api/shops/${shopId}/orders/${orderId}`
      );
      const { data: payments } = await api.get<Payment[]>(
        `/api/shops/${shopId}/orders/${orderId}/payments`
      );
      setDetail({ ...order, payments });
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleRefund() {
    if (!detail) return;
    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid refund amount.");
      return;
    }
    setRefunding(true);
    try {
      await api.post(`/api/shops/${shopId}/orders/${detail.id}/refunds`, {
        type:            "AMOUNT",
        amount,
        reason:          refundReason || undefined,
        idempotency_key: crypto.randomUUID(),
      });
      toast.success("Refund processed.");
      setDetail(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRefunding(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function getOrderContext(o: Order): string {
    if (o.order_type === "DINE_IN")  return o.table_number  ? `Table ${o.table_number}` : "Dine-in";
    if (o.order_type === "TAKEAWAY") return o.customer_name ?? "Takeaway";
    if (o.order_type === "QR")       return o.customer_name ?? "QR Order";
    if (o.order_type === "RETAIL")   return o.cashier_name  ?? "—";
    return o.customer_name ?? "—";
  }

  return (
    <div className="animate-fade-in">

      <div className="mb-6">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Orders</h1>
        <p className="text-[13px] text-[#5F5E5A] mt-0.5">
          View and manage all orders for this shop.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#0F2B4C]/20"
          />
          <span className="text-[#5F5E5A] text-[13px]">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#0F2B4C]/20"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
          className="h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#0F2B4C]/20"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OrderType | "")}
          className="h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#0F2B4C]/20"
        >
          <option value="">All types</option>
          {(Object.keys(TYPE_LABELS) as OrderType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        {!loading && (
          <span className="ml-auto text-[12px] text-[#5F5E5A]">
            {total} order{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Orders table */}
      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          description="Try adjusting the date range or filters."
        />
      ) : (
        <>
          <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                  <th className="text-left px-5 py-3 font-medium">Order #</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Context</th>
                  <th className="text-left px-4 py-3 font-medium">Served by</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40 cursor-pointer"
                    onClick={() => openDetail(o.id)}
                  >
                    <td className="px-5 py-3 font-mono text-[#0F2B4C] font-medium">
                      {o.order_no}
                    </td>
                    <td className="px-4 py-3 text-[#5F5E5A]">
                      {formatDateTime(o.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] px-2 py-0.5 rounded bg-[#F1EFE8] text-[#5F5E5A] font-medium whitespace-nowrap">
                        {TYPE_LABELS[o.order_type] ?? o.order_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5F5E5A]">
                      {getOrderContext(o)}
                    </td>
                    <td className="px-4 py-3 text-[#5F5E5A]">
                      {o.cashier_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[o.status]}`}>
                        {STATUS_LABELS[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#0F2B4C]">
                      {formatCurrency(Number(o.total_amount), currency)}
                    </td>
                    <td className="px-5 py-3 text-right text-[12px] text-[#534AB7]">
                      View →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-[13px] border border-[#D3D1C7] rounded-lg bg-white disabled:opacity-40 hover:bg-[#F1EFE8] transition"
              >
                ← Prev
              </button>
              <span className="text-[13px] text-[#5F5E5A]">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-[13px] border border-[#D3D1C7] rounded-lg bg-white disabled:opacity-40 hover:bg-[#F1EFE8] transition"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {(loadingDetail || detail) && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="h-full w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">

            <div className="flex items-center justify-between px-5 py-4 border-b border-[#D3D1C7] shrink-0">
              <div>
                {loadingDetail ? (
                  <div className="h-5 w-32 bg-[#F1EFE8] rounded animate-pulse" />
                ) : (
                  <>
                    <p className="text-[15px] font-medium text-[#0F2B4C] font-mono">
                      {detail?.order_no}
                    </p>
                    <p className="text-[12px] text-[#5F5E5A] mt-0.5">
                      {detail && formatDateTime(detail.created_at)}
                    </p>
                  </>
                )}
              </div>
              <button
                onClick={() => setDetail(null)}
                className="text-[#5F5E5A] hover:text-[#0F2B4C] transition text-[20px] leading-none"
              >
                ✕
              </button>
            </div>

            {loadingDetail ? (
              <div className="flex-1 p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-4 bg-[#F1EFE8] rounded animate-pulse"
                    style={{ width: `${70 + i * 5}%` }}
                  />
                ))}
              </div>
            ) : detail ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                <div className="space-y-2 text-[13px]">
                  <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wide mb-2">
                    Order Info
                  </p>

                  <div className="flex justify-between">
                    <span className="text-[#5F5E5A]">Type</span>
                    <span className="font-medium text-[#0F2B4C]">
                      {TYPE_LABELS[detail.order_type] ?? detail.order_type}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#5F5E5A]">Status</span>
                    <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[detail.status]}`}>
                      {STATUS_LABELS[detail.status]}
                    </span>
                  </div>

                  {detail.cashier_name && (
                    <div className="flex justify-between">
                      <span className="text-[#5F5E5A]">Served by</span>
                      <span className="font-medium text-[#0F2B4C]">{detail.cashier_name}</span>
                    </div>
                  )}

                  {detail.order_type === "DINE_IN" && detail.table_number && (
                    <div className="flex justify-between">
                      <span className="text-[#5F5E5A]">Table</span>
                      <span className="font-medium text-[#0F2B4C]">Table {detail.table_number}</span>
                    </div>
                  )}

                  {detail.customer_name && detail.order_type !== "DINE_IN" && (
                    <div className="flex justify-between">
                      <span className="text-[#5F5E5A]">Customer</span>
                      <span className="font-medium text-[#0F2B4C]">{detail.customer_name}</span>
                    </div>
                  )}

                  {detail.customer_phone && (
                    <div className="flex justify-between">
                      <span className="text-[#5F5E5A]">Phone</span>
                      <span className="font-medium text-[#0F2B4C]">{detail.customer_phone}</span>
                    </div>
                  )}

                  {detail.delivery_address && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#5F5E5A]">Delivery address</span>
                      <span className="font-medium text-[#0F2B4C]">{detail.delivery_address}</span>
                    </div>
                  )}

                  {detail.notes && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#5F5E5A]">Notes</span>
                      <span className="text-[#0F2B4C] italic">{detail.notes}</span>
                    </div>
                  )}
                </div>

                {detail.items && detail.items.length > 0 && (
                  <div>
                    <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wide mb-2">
                      Items
                    </p>
                    <div className="space-y-2">
                      {detail.items.map((item) => (
                        <div key={item.id} className="flex items-start justify-between text-[13px]">
                          <div className="flex-1 min-w-0">
                            <p className="text-[#0F2B4C] font-medium">
                              {item.qty}× {item.item_name_snapshot}
                            </p>
                            <p className="text-[11px] text-[#5F5E5A]">
                              {item.product_name_snapshot}
                            </p>
                            {item.modifier_snapshot.length > 0 && (
                              <p className="text-[11px] text-[#5F5E5A]">
                                {item.modifier_snapshot.map((m) => m.name).join(", ")}
                              </p>
                            )}
                            {item.item_note && (
                              <p className="text-[11px] text-[#BA7517] italic">
                                Note: {item.item_note}
                              </p>
                            )}
                          </div>
                          <span className="text-[#0F2B4C] font-medium ml-4 flex-shrink-0">
                            {formatCurrency(Number(item.subtotal), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-[#F1EFE8] pt-3 space-y-1.5 text-[13px]">
                  <div className="flex justify-between text-[#5F5E5A]">
                    <span>Subtotal</span>
                    <span>{formatCurrency(Number(detail.subtotal), currency)}</span>
                  </div>
                  {Number(detail.tax_amount) > 0 && (
                    <div className="flex justify-between text-[#5F5E5A]">
                      <span>Tax</span>
                      <span>{formatCurrency(Number(detail.tax_amount), currency)}</span>
                    </div>
                  )}
                  {Number(detail.discount_amount) > 0 && (
                    <div className="flex justify-between text-[#0D7A5F]">
                      <span>Discount</span>
                      <span>−{formatCurrency(Number(detail.discount_amount), currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium text-[#0F2B4C] text-[15px] pt-1 border-t border-[#F1EFE8]">
                    <span>Total</span>
                    <span>{formatCurrency(Number(detail.total_amount), currency)}</span>
                  </div>
                </div>

                {detail.payments && detail.payments.length > 0 && (
                  <div>
                    <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wide mb-2">
                      Payment
                    </p>
                    {detail.payments.map((p) => (
                      <div key={p.id} className="space-y-1 text-[13px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[#5F5E5A]">Method</span>
                          <span className="font-medium text-[#0F2B4C]">{p.method}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#5F5E5A]">Amount</span>
                          <span className="font-medium text-[#0D7A5F]">
                            {formatCurrency(Number(p.amount), currency)}
                          </span>
                        </div>
                        {p.received_amount != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#5F5E5A]">Received</span>
                            <span className="text-[#0F2B4C]">
                              {formatCurrency(Number(p.received_amount), currency)}
                            </span>
                          </div>
                        )}
                        {p.change_amount != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#5F5E5A]">Change</span>
                            <span className="text-[#0F2B4C]">
                              {formatCurrency(Number(p.change_amount), currency)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canRefund && detail.status === "PAID" && (
                  <div className="border-t border-[#F1EFE8] pt-4">
                    <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wide mb-3">
                      Process Refund
                    </p>
                    <div className="space-y-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder="Refund amount"
                        className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2B4C]/20"
                      />
                      <input
                        type="text"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2B4C]/20"
                      />
                      <button
                        onClick={handleRefund}
                        disabled={refunding || !refundAmount}
                        className="w-full h-9 bg-[#A32D2D] text-white text-[13px] font-medium rounded-lg disabled:opacity-40 hover:bg-[#8a2525] transition"
                      >
                        {refunding ? "Processing…" : "Issue Refund"}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            ) : null}
          </div>
        </div>
      )}

    </div>
  );
}