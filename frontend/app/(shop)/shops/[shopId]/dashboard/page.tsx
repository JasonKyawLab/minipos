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
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { OrderStatusBadge } from "@/components/ui/Badge";
import { TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";

type Range = "TODAY" | "WEEK" | "MONTH";

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

export default function ShopDashboardPage() {
  const { shopId, shopName, currency } = useShop();

  const [range, setRange]               = useState<Range>("TODAY");
  const [summary, setSummary]           = useState<SalesSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [ordersLoading, setOrdersLoading]   = useState(true);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const { from, to } = getDateRange(range);
      const { data } = await api.get<SalesSummary>(
        `/api/shops/${shopId}/reports/sales-summary`,
        { params: { from, to } }
      );
      setSummary(data);
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code !== "FORBIDDEN") {
        toast.error(getErrorMessage(code));
      }
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [shopId, range]);

  const loadRecentOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const { from, to } = getDateRange(range);
      const { data } = await api.get<Order[]>(
        `/api/shops/${shopId}/orders`,
        { params: { from, to, limit: 10, status: "PAID" } }
      );
      setRecentOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
      setRecentOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [shopId, range]);

  useEffect(() => {
    loadSummary();
    loadRecentOrders();
  }, [loadSummary, loadRecentOrders]);

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

      {/* Recent orders card — header bar + table share this one card,
          so the table below uses overflow-x-auto directly rather than
          the full Table component (which would add a second card). */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#D3D1C7]">
          <h2 className="text-[14px] font-medium text-[#0F2B4C]">Recent Paid Orders</h2>
          <Link
            href={`/shops/${shopId}/orders`}
            className="text-[12px] text-[#534AB7] hover:underline"
          >
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