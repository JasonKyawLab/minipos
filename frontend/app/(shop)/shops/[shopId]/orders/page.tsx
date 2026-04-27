"use client";
// =========================================================
// app/(shop)/shops/[shopId]/orders/page.tsx
// Order list with date filter, status filter, and detail
// modal showing items, payment, and refund actions.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/utils/formatCurrency";
import { formatDateTime, getDefaultDateRange, toISODate } from "@/utils/formatDate";
import toast from "react-hot-toast";
import type { Order, OrderStatus, Payment } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

const STATUS_STYLES: Record<OrderStatus, string> = {
  OPEN:      "bg-[#F1EFE8] text-[#5F5E5A]",
  CONFIRMED: "bg-[#FAEEDA] text-[#BA7517]",
  PAID:      "bg-[#E1F5EE] text-[#0D7A5F]",
  CANCELLED: "bg-[#FCEBEB] text-[#A32D2D]",
  REFUNDED:  "bg-[#EEEDFE] text-[#534AB7]",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: "Open", CONFIRMED: "Confirmed", PAID: "Paid",
  CANCELLED: "Cancelled", REFUNDED: "Refunded",
};

interface OrderDetail extends Order {
  items: NonNullable<Order["items"]>;
  payments?: Payment[];
}

export default function OrdersPage() {
  const { shopId, currency, userRole } = useShop();
  const canRefund = ["OWNER", "MANAGER"].includes(userRole);

  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const limit = 30;

  const { from: defFrom, to: defTo } = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defFrom);
  const [dateTo, setDateTo]     = useState(defTo);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");

  // Detail modal
  const [detail, setDetail]       = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Refund
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding]       = useState(false);

const load = useCallback(async () => {
  setLoading(true);
  try {
    const params: Record<string, string | number> = {
      from: dateFrom, to: dateTo, limit, offset: (page - 1) * limit,
    };
    if (statusFilter) params.status = statusFilter;

    // Backend returns Order[] directly — not { orders, total }
    const { data } = await api.get<Order[]>(
      `/api/shops/${shopId}/orders`, { params }
    );

    setOrders(Array.isArray(data) ? data : []);
    // Backend doesn't return total count — use array length for now
    setTotal(Array.isArray(data) ? data.length : 0);
  } catch (err: any) {
    toast.error(getErrorMessage(err.response?.data?.message));
  } finally {
    setLoading(false);
  }
}, [shopId, dateFrom, dateTo, statusFilter, page]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, statusFilter]);
  useEffect(() => { load(); }, [load]);

  async function openDetail(orderId: string) {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const [orderRes, paymentsRes] = await Promise.all([
        api.get<OrderDetail>(`/api/shops/${shopId}/orders/${orderId}`),
        api.get<Payment[]>(`/api/shops/${shopId}/orders/${orderId}/payments`),
      ]);
      setDetail({ ...orderRes.data, payments: paymentsRes.data });
      setRefundAmount(""); setRefundReason("");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoadingDetail(false); }
  }

  async function handleRefund() {
    if (!detail) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid refund amount."); return; }
    setRefunding(true);
    try {
      await api.post(`/api/shops/${shopId}/orders/${detail.id}/refund`, {
        amount, reason: refundReason.trim() || undefined,
      });
      toast.success("Refund processed.");
      setDetail(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setRefunding(false); }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="animate-fade-in">
      <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-5">Orders</h1>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <input
            type="date" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          />
          <span className="text-[12px] text-[#5F5E5A]">to</span>
          <input
            type="date" value={dateTo} min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-2 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
          className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <span className="text-[12px] text-[#5F5E5A] ml-auto">{total} orders</span>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders found" description="Try adjusting the date range or filters." />
      ) : (
        <>
          <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                  <th className="text-left px-5 py-3 font-medium">Order #</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40 cursor-pointer" onClick={() => openDetail(o.id)}>
                    <td className="px-5 py-3 font-mono text-[#0F2B4C] font-medium">{o.order_no}</td>
                    <td className="px-4 py-3 text-[#5F5E5A]">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-3 text-[#5F5E5A] capitalize">{o.order_type.toLowerCase().replace("_", " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[o.status]}`}>
                        {STATUS_LABELS[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(o.total_amount), currency)}</td>
                    <td className="px-5 py-3 text-right text-[12px] text-[#534AB7]">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg disabled:opacity-40 hover:bg-[#F1EFE8] transition"
              >
                ← Prev
              </button>
              <span className="text-[12px] text-[#5F5E5A]">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg disabled:opacity-40 hover:bg-[#F1EFE8] transition"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Order detail modal */}
      {(detail || loadingDetail) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !loadingDetail && setDetail(null)}>
          <div
            className="bg-white rounded-lg border border-[#D3D1C7] w-full max-w-lg max-h-[85vh] flex flex-col shadow-md animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail ? (
              <div className="p-6 flex items-center justify-center">
                <Spinner size={24} />
              </div>
            ) : detail && (
              <>
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#D3D1C7]">
                  <div>
                    <p className="text-[16px] font-medium text-[#0F2B4C] font-mono">{detail.order_no}</p>
                    <p className="text-[12px] text-[#5F5E5A]">{formatDateTime(detail.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[detail.status]}`}>
                      {STATUS_LABELS[detail.status]}
                    </span>
                    <button onClick={() => setDetail(null)} className="text-[#5F5E5A] hover:text-[#0F2B4C] ml-1 text-[18px] leading-none">×</button>
                  </div>
                </div>

                {/* Modal body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Items */}
                  <div>
                    <p className="text-[12px] text-[#5F5E5A] font-medium mb-2 uppercase tracking-wide">Items</p>
                    <div className="space-y-2">
                      {detail.items?.map((item) => (
                        <div key={item.id} className="flex items-start justify-between text-[13px]">
                          <div>
                            <span className="text-[#0F2B4C]">{item.qty}× {item.item_name_snapshot}</span>
                            {item.modifier_snapshot?.length > 0 && (
                              <p className="text-[11px] text-[#5F5E5A]">
                                {item.modifier_snapshot.map(m => m.name).join(", ")}
                              </p>
                            )}
                            {item.item_note && (
                              <p className="text-[11px] text-[#BA7517] italic">Note: {item.item_note}</p>
                            )}
                          </div>
                          <span className="text-[#0F2B4C] font-medium ml-4 flex-shrink-0">
                            {formatCurrency(Number(item.subtotal), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
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
                    <div className="flex justify-between font-medium text-[#0F2B4C] border-t border-[#F1EFE8] pt-1.5">
                      <span>Total</span>
                      <span>{formatCurrency(Number(detail.total_amount), currency)}</span>
                    </div>
                  </div>

                  {/* Payment info */}
                  {detail.payments && detail.payments.length > 0 && (
                    <div className="border-t border-[#F1EFE8] pt-3">
                      <p className="text-[12px] text-[#5F5E5A] font-medium mb-2 uppercase tracking-wide">Payment</p>
                      {detail.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[13px]">
                          <span className="text-[#5F5E5A]">{p.method}</span>
                          <span className="text-[#0D7A5F] font-medium">{formatCurrency(Number(p.amount), currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Refund section */}
                  {canRefund && detail.status === "PAID" && (
                    <div className="border-t border-[#F1EFE8] pt-3">
                      <p className="text-[12px] text-[#5F5E5A] font-medium mb-2 uppercase tracking-wide">Process Refund</p>
                      <div className="space-y-2">
                        <input
                          type="number" min="0.01" step="0.01"
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          className="w-full h-8 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A32D2D]"
                          placeholder="Refund amount"
                        />
                        <input
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          className="w-full h-8 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A32D2D]"
                          placeholder="Reason (optional)"
                        />
                        <button
                          onClick={handleRefund}
                          disabled={refunding}
                          className="flex items-center gap-2 px-4 h-8 text-[12px] font-medium text-white bg-[#A32D2D] rounded-lg disabled:opacity-50"
                        >
                          {refunding && <Spinner size={12} />} Process refund
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}