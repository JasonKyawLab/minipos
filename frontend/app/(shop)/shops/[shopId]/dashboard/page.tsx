"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/utils/formatCurrency";
import { formatDateTime, toISODate } from "@/utils/formatDate";
import toast from "react-hot-toast";
import type { Order, SalesSummary } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";

type Range = "TODAY" | "WEEK" | "MONTH";

interface TopProductRow {
  product_name:   string;
  item_name:      string;
  total_qty_sold: number;
  total_revenue:  number;
  order_count:    number;
}

interface OrderTypeRow {
  order_type:    string;
  order_count:   number;
  total_revenue: number;
  percentage:    number;
}

interface PeakHourRow {
  hour:          number;
  order_count:   number;
  total_revenue: number;
}

function getDateRange(range: Range): { from: string; to: string } {
  const today = new Date();
  const to    = toISODate(today);

  if (range === "TODAY") return { from: to, to };

  if (range === "WEEK") {
    const d = new Date(today);
    d.setDate(today.getDate() - 6);
    return { from: toISODate(d), to };
  }

  const d = new Date(today);
  d.setDate(today.getDate() - 29);
  return { from: toISODate(d), to };
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN:    "Dine-in",
  TAKEAWAY:   "Takeaway",
  RETAIL:     "Retail",
  QR:         "QR Order",
  ONLINE:     "Online",
  DELIVERY:   "Delivery",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  DINE_IN:  "#0D7A5F",
  TAKEAWAY: "#534AB7",
  RETAIL:   "#0F2B4C",
  QR:       "#BA7517",
  ONLINE:   "#1E4FBF",
  DELIVERY: "#A32D2D",
};

export default function ShopDashboardPage() {
  const { shopId, shopName, currency, timezone } = useShop();

  const [range, setRange]               = useState<Range>("TODAY");
  const [summary, setSummary]           = useState<SalesSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts]   = useState<TopProductRow[]>([]);
  const [orderTypes, setOrderTypes]     = useState<OrderTypeRow[]>([]);
  const [peakHours, setPeakHours]       = useState<PeakHourRow[]>([]);

  const [summaryLoading, setSummaryLoading]     = useState(true);
  const [ordersLoading, setOrdersLoading]       = useState(true);
  const [productsLoading, setProductsLoading]   = useState(true);
  const [typesLoading, setTypesLoading]         = useState(true);
  const [peakLoading, setPeakLoading]           = useState(true);

  const { from, to } = getDateRange(range);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const { data } = await api.get<SalesSummary>(
        `/api/shops/${shopId}/reports/sales-summary`,
        { params: { from, to } }
      );
      setSummary(data);
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code !== "FORBIDDEN") toast.error(getErrorMessage(code));
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [shopId, from, to]);

  const loadRecentOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const { data } = await api.get<{ data: Order[] }>(
        `/api/shops/${shopId}/orders`,
        { params: { from, to, pageSize: 10, status: "PAID" } }
      );
      setRecentOrders(Array.isArray(data?.data) ? data.data : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
      setRecentOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [shopId, from, to]);

  const loadTopProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const { data } = await api.get<TopProductRow[]>(
        `/api/shops/${shopId}/reports/sales-by-product`,
        { params: { from, to, limit: 5 } }
      );
      setTopProducts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code !== "FORBIDDEN") toast.error(getErrorMessage(code) || "Failed to load top products.");
      setTopProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [shopId, from, to]);

  const loadOrderTypes = useCallback(async () => {
    setTypesLoading(true);
    try {
      const { data } = await api.get<OrderTypeRow[]>(
        `/api/shops/${shopId}/reports/sales-by-order-type`,
        { params: { from, to } }
      );
      setOrderTypes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code !== "FORBIDDEN") toast.error(getErrorMessage(code) || "Failed to load channel breakdown.");
      setOrderTypes([]);
    } finally {
      setTypesLoading(false);
    }
  }, [shopId, from, to]);

  const loadPeakHours = useCallback(async () => {
    setPeakLoading(true);
    try {
      const { data } = await api.get<PeakHourRow[]>(
        `/api/shops/${shopId}/reports/peak-hours`,
        { params: { from, to, timezone } }
      );
      setPeakHours(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code !== "FORBIDDEN") toast.error(getErrorMessage(code) || "Failed to load peak hours.");
      setPeakHours([]);
    } finally {
      setPeakLoading(false);
    }
  }, [shopId, from, to, timezone]);

  useEffect(() => {
    loadSummary();
    loadRecentOrders();
    loadTopProducts();
    loadOrderTypes();
    loadPeakHours();
  }, [loadSummary, loadRecentOrders, loadTopProducts, loadOrderTypes, loadPeakHours]);

  const RANGES: { key: Range; label: string }[] = [
    { key: "TODAY", label: "Today"      },
    { key: "WEEK",  label: "This week"  },
    { key: "MONTH", label: "This month" },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-medium text-[#0F2B4C]">{shopName}</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">Dashboard overview</p>
        </div>

        <div className="flex items-center gap-1 bg-white border border-[#D3D1C7] rounded-lg p-1">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                range === key
                  ? "bg-[#0F2B4C] text-white"
                  : "text-[#5F5E5A] hover:text-[#0F2B4C]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Net Revenue"
          value={summaryLoading ? null : formatCurrency(summary?.net_revenue ?? 0, currency)}
          sub={summaryLoading ? null : `${summary?.paid_orders ?? 0} paid orders`}
          colour="teal"
        />
        <MetricCard
          label="Total Orders"
          value={summaryLoading ? null : String(summary?.total_orders ?? 0)}
          sub={summaryLoading ? null : `${summary?.cancelled_orders ?? 0} cancelled`}
          colour="navy"
        />
        <MetricCard
          label="Avg Order Value"
          value={summaryLoading ? null : formatCurrency(summary?.average_order_value ?? 0, currency)}
          sub={summaryLoading ? null : "per paid order"}
          colour="purple"
        />
        <MetricCard
          label="Total Refunded"
          value={summaryLoading ? null : formatCurrency(summary?.total_refunded ?? 0, currency)}
          sub={summaryLoading ? null : `${summary?.refunded_orders ?? 0} refunded`}
          colour="red"
        />
      </div>

      {/* Second row: top products + order type breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Top selling products */}
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#D3D1C7]">
            <h2 className="text-[14px] font-medium text-[#0F2B4C]">Top Selling Products</h2>
            <Link href={`/shops/${shopId}/reports`} className="text-[12px] text-[#534AB7] hover:underline">
              Full report →
            </Link>
          </div>

          {productsLoading ? (
            <div className="divide-y divide-[#F1EFE8]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <Skeleton width={20} height={20} className="rounded-full shrink-0" />
                  <Skeleton width={120} height={13} />
                  <Skeleton width={40} height={13} className="ml-auto" />
                </div>
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[#5F5E5A]">No sales in this period.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F1EFE8]">
              {topProducts.map((p, i) => {
                const label = p.item_name !== p.product_name
                  ? `${p.product_name} · ${p.item_name}`
                  : p.product_name;
                return (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-5 h-5 rounded-full bg-[#F1EFE8] text-[11px] font-bold text-[#5F5E5A] flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <p className="flex-1 text-[13px] text-[#0F2B4C] truncate" title={label}>{label}</p>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-semibold text-[#0F2B4C]">×{p.total_qty_sold}</p>
                      <p className="text-[11px] text-[#5F5E5A]">{formatCurrency(p.total_revenue, currency)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sales by channel */}
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[#D3D1C7]">
            <h2 className="text-[14px] font-medium text-[#0F2B4C]">Sales by Channel</h2>
          </div>

          {typesLoading ? (
            <div className="px-5 py-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton width={80} height={12} />
                    <Skeleton width={40} height={12} />
                  </div>
                  <Skeleton height={6} className="rounded-full" />
                </div>
              ))}
            </div>
          ) : orderTypes.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[#5F5E5A]">No sales in this period.</p>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-4">
              {orderTypes.map((t) => {
                const color = ORDER_TYPE_COLORS[t.order_type] ?? "#9CA3AF";
                const label = ORDER_TYPE_LABELS[t.order_type] ?? t.order_type;
                return (
                  <div key={t.order_type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[13px] text-[#0F2B4C]">{label}</span>
                        <span className="text-[11px] text-[#5F5E5A]">{t.order_count} orders</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[12px] font-semibold text-[#0F2B4C]">{formatCurrency(t.total_revenue, currency)}</span>
                        <span className="text-[11px] text-[#5F5E5A] ml-2">{t.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#F1EFE8] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${t.percentage}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Peak hours chart */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-[#D3D1C7]">
          <h2 className="text-[14px] font-medium text-[#0F2B4C]">Peak Hours</h2>
          <p className="text-[11px] text-[#5F5E5A] mt-0.5">Orders by hour of day</p>
        </div>

        {peakLoading ? (
          <div className="px-5 py-4 flex items-end gap-1 h-24">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="flex-1 bg-[#F1EFE8] rounded-sm animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
            ))}
          </div>
        ) : peakHours.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[13px] text-[#5F5E5A]">No sales data in this period.</p>
          </div>
        ) : (
          <PeakHoursChart rows={peakHours} />
        )}
      </div>

      {/* Recent paid orders */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#D3D1C7]">
          <h2 className="text-[14px] font-medium text-[#0F2B4C]">Recent Paid Orders</h2>
          <Link href={`/shops/${shopId}/orders`} className="text-[12px] text-[#534AB7] hover:underline">
            View all →
          </Link>
        </div>

        {ordersLoading ? (
          <div className="divide-y divide-[#F1EFE8]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <Skeleton width={100} height={14} />
                <Skeleton width={80}  height={14} />
                <Skeleton width={60}  height={20} className="rounded-md" />
                <Skeleton width={70}  height={14} className="ml-auto" />
              </div>
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] text-[#5F5E5A]">No paid orders in this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <TableHead>
                <Th>Order #</Th>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
              </TableHead>
              <TableBody>
                {recentOrders.map((order) => (
                  <Tr key={order.id}>
                    <Td className="font-mono font-medium text-[#0F2B4C] text-[12px]">
                      {order.order_no}
                    </Td>
                    <Td className="text-[#5F5E5A]">
                      {formatDateTime(order.created_at)}
                    </Td>
                    <Td className="text-[#5F5E5A] capitalize">
                      {order.order_type.toLowerCase().replace("_", " ")}
                    </Td>
                    <Td>
                      <OrderStatusBadge status={order.status} />
                    </Td>
                    <Td align="right" className="font-medium text-[#0F2B4C]">
                      {formatCurrency(Number(order.total_amount), currency)}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Peak hours bar chart ───────────────────────────────────

function PeakHoursChart({ rows }: { rows: PeakHourRow[] }) {
  const maxCount = Math.max(...rows.map(r => r.order_count), 1);

  // Build a full 0–23 array, filling in zeros for missing hours
  const hourMap = new Map(rows.map(r => [r.hour, r]));
  const peakHour = rows.reduce((best, r) => r.order_count > best.order_count ? r : best, rows[0]);

  function hourLabel(h: number) {
    if (h === 0)  return "12a";
    if (h === 12) return "12p";
    return h < 12 ? `${h}a` : `${h - 12}p`;
  }

  // Show every 3rd hour label to avoid clutter
  const labelHours = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

  return (
    <div className="px-5 pb-4 pt-3">
      <div className="flex items-end gap-[3px] h-20">
        {Array.from({ length: 24 }, (_, h) => {
          const row   = hourMap.get(h);
          const count = row?.order_count ?? 0;
          const pct   = count / maxCount;
          const isPeak = h === peakHour.hour;
          return (
            <div
              key={h}
              className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative"
              title={`${hourLabel(h)}: ${count} orders`}
            >
              <div
                className={`w-full rounded-sm transition-all ${
                  isPeak ? "bg-[#0D7A5F]" : "bg-[#0F2B4C]/20 group-hover:bg-[#0F2B4C]/40"
                }`}
                style={{ height: `${Math.max(pct * 64, count > 0 ? 4 : 0)}px` }}
              />
            </div>
          );
        })}
      </div>

      {/* Hour axis labels */}
      <div className="flex items-center gap-[3px] mt-1">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center">
            {labelHours.has(h) && (
              <span className="text-[9px] text-[#9B9891]">{hourLabel(h)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      {peakHour.order_count > 0 && (
        <p className="text-[11px] text-[#5F5E5A] mt-2">
          Peak: <span className="font-medium text-[#0D7A5F]">{hourLabel(peakHour.hour)}</span>
          {" "}· {peakHour.order_count} orders
        </p>
      )}
    </div>
  );
}

// ── Metric card ────────────────────────────────────────────

type MetricColour = "teal" | "navy" | "purple" | "red";

const METRIC_STYLES: Record<MetricColour, { card: string; value: string }> = {
  teal:   { card: "bg-[#E1F5EE]", value: "text-[#0D7A5F]" },
  navy:   { card: "bg-[#F1EFE8]", value: "text-[#0F2B4C]" },
  purple: { card: "bg-[#EEEDFE]", value: "text-[#534AB7]" },
  red:    { card: "bg-[#FCEBEB]", value: "text-[#A32D2D]" },
};

function MetricCard({
  label, value, sub, colour,
}: {
  label: string;
  value: string | null;
  sub: string | null;
  colour: MetricColour;
}) {
  const styles = METRIC_STYLES[colour];
  return (
    <div className={`${styles.card} rounded-lg p-4`}>
      <p className="text-[12px] text-[#5F5E5A] font-medium mb-1">{label}</p>
      {value === null ? (
        <div className="space-y-1.5">
          <Skeleton height={28} width="70%" />
          <Skeleton height={12} width="50%" />
        </div>
      ) : (
        <>
          <p className={`text-[22px] font-semibold leading-tight ${styles.value}`}>{value}</p>
          {sub && <p className="text-[12px] text-[#5F5E5A] mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}
