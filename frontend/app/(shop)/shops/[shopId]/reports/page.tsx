"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/formatCurrency";
import { toISODate } from "@/utils/formatDate";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/states";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";
import type { SalesSummary } from "@/types";

// ── Types matching backend response shapes ────────────────

interface SalesByProductRow {
  product_model_id: string | null;
  product_name: string;
  item_name: string;
  total_qty_sold: number;
  total_revenue: number;
  order_count: number;
}

interface SalesByOrderTypeRow {
  order_type: string;
  order_count: number;
  total_revenue: number;
  percentage: number;
}

interface RefundSummary {
  period_from: string;
  period_to: string;
  total_refund_transactions: number;
  total_amount_refunded: number;
  refund_rate: number;
  top_refunded_items: {
    item_name: string;
    product_name: string;
    refund_count: number;
    refund_qty: number;
  }[];
}

// ── Date range presets ────────────────────────────────────

type Range = "TODAY" | "WEEK" | "MONTH";

function getDateRange(range: Range): { from: string; to: string } {
  const today = new Date();
  const to = toISODate(today);

  if (range === "TODAY") return { from: to, to };

  const d = new Date(today);
  if (range === "WEEK") d.setDate(today.getDate() - 6);
  else d.setDate(today.getDate() - 29);

  return { from: toISODate(d), to };
}

// ── Main component ────────────────────────────────────────

export default function ReportsPage() {
  const { shopId, currency, userRole } = useShop();

  // Only OWNER and MANAGER can see reports
  const canView = ["OWNER", "MANAGER"].includes(userRole);

  const [range, setRange] = useState<Range>("MONTH");

  const [summary, setSummary]           = useState<SalesSummary | null>(null);
  const [byProduct, setByProduct]       = useState<SalesByProductRow[]>([]);
  const [byOrderType, setByOrderType]   = useState<SalesByOrderTypeRow[]>([]);
  const [refunds, setRefunds]           = useState<RefundSummary | null>(null);

  const [loadingSummary, setLoadingSummary]     = useState(true);
  const [loadingProduct, setLoadingProduct]     = useState(true);
  const [loadingOrderType, setLoadingOrderType] = useState(true);
  const [loadingRefunds, setLoadingRefunds]     = useState(true);

  const loadAll = useCallback(async () => {
    if (!canView) return;

    const { from, to } = getDateRange(range);
    const params = { from, to };

    // Run all four requests in parallel
    setLoadingSummary(true);
    setLoadingProduct(true);
    setLoadingOrderType(true);
    setLoadingRefunds(true);

    const [summaryRes, productRes, orderTypeRes, refundRes] =
      await Promise.allSettled([
        api.get<SalesSummary>(`/api/shops/${shopId}/reports/sales-summary`, { params }),
        api.get<SalesByProductRow[]>(`/api/shops/${shopId}/reports/sales-by-product`, { params: { ...params, limit: 10 } }),
        api.get<SalesByOrderTypeRow[]>(`/api/shops/${shopId}/reports/sales-by-order-type`, { params }),
        api.get<RefundSummary>(`/api/shops/${shopId}/reports/refunds`, { params }),
      ]);

    if (summaryRes.status === "fulfilled") setSummary(summaryRes.value.data);
    else toast.error("Failed to load sales summary.");
    setLoadingSummary(false);

    if (productRes.status === "fulfilled") setByProduct(productRes.value.data);
    else toast.error("Failed to load top products.");
    setLoadingProduct(false);

    if (orderTypeRes.status === "fulfilled") setByOrderType(orderTypeRes.value.data);
    else toast.error("Failed to load sales by order type.");
    setLoadingOrderType(false);

    if (refundRes.status === "fulfilled") setRefunds(refundRes.value.data);
    else toast.error("Failed to load refund summary.");
    setLoadingRefunds(false);
  }, [shopId, range, canView]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-5">Reports</h1>
        <div className="bg-[#FAEEDA] border border-[#BA7517] rounded-lg p-5">
          <p className="text-[14px] text-[#BA7517] font-medium mb-1">
            Access restricted
          </p>
          <p className="text-[13px] text-[#BA7517]">
            Reports are only available to Owners and Managers.
          </p>
        </div>
      </div>
    );
  }

  const RANGES: { key: Range; label: string }[] = [
    { key: "TODAY", label: "Today"      },
    { key: "WEEK",  label: "This week"  },
    { key: "MONTH", label: "This month" },
  ];

  const { from, to } = getDateRange(range);

  return (
    <div className="animate-fade-in space-y-6">

      {/* Header + range picker */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium text-[#0F2B4C]">Reports</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">
            {from} → {to}
          </p>
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

      {/* ── KPI summary cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Net Revenue"
          value={loadingSummary ? null : formatCurrency(summary?.net_revenue ?? 0, currency)}
          sub={loadingSummary ? null : `${summary?.paid_orders ?? 0} paid orders`}
          colour="teal"
        />
        <KpiCard
          label="Gross Revenue"
          value={loadingSummary ? null : formatCurrency(summary?.gross_revenue ?? 0, currency)}
          sub={loadingSummary ? null : `Tax: ${formatCurrency(summary?.tax_collected ?? 0, currency)}`}
          colour="navy"
        />
        <KpiCard
          label="Avg Order Value"
          value={loadingSummary ? null : formatCurrency(summary?.average_order_value ?? 0, currency)}
          sub={loadingSummary ? null : "per paid order"}
          colour="purple"
        />
        <KpiCard
          label="Total Refunded"
          value={loadingSummary ? null : formatCurrency(summary?.total_refunded ?? 0, currency)}
          sub={loadingSummary ? null : `${summary?.refunded_orders ?? 0} refunded orders`}
          colour="red"
        />
      </div>

      {/* ── Order cancellations row ────────────────────────── */}
      {!loadingSummary && summary && (
        <div className="grid grid-cols-3 gap-3">
          <StatRow label="Total Orders"     value={String(summary.total_orders)} />
          <StatRow label="Cancelled"        value={String(summary.cancelled_orders)} />
          <StatRow label="Discounts Given"  value={formatCurrency(summary.discount_given, currency)} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Top products ───────────────────────────────── */}
        <Section title="Top Products by Qty Sold">
          {loadingProduct ? (
            <SkeletonRows count={5} />
          ) : byProduct.length === 0 ? (
            <EmptyState title="No sales yet" description="No paid orders in this period." />
          ) : (
            <Table>
              <TableHead>
                <Th>Product</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Revenue</Th>
              </TableHead>
              <TableBody>
                {byProduct.map((row, i) => (
                  <Tr key={i}>
                    <Td>
                      <p className="text-[#0F2B4C] font-medium">{row.item_name}</p>
                      <p className="text-[11px] text-[#5F5E5A]">{row.product_name}</p>
                    </Td>
                    <Td align="right" className="font-medium text-[#0F2B4C]">
                      {row.total_qty_sold}
                    </Td>
                    <Td align="right" className="font-medium text-[#0D7A5F]">
                      {formatCurrency(Number(row.total_revenue), currency)}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        {/* ── Sales by order type ────────────────────────── */}
        <Section title="Sales by Order Type">
          {loadingOrderType ? (
            <SkeletonRows count={4} />
          ) : byOrderType.length === 0 ? (
            <EmptyState title="No sales yet" description="No paid orders in this period." />
          ) : (
            <div className="space-y-3">
              {byOrderType.map((row) => (
                <div key={row.order_type}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="text-[#0F2B4C] font-medium capitalize">
                      {row.order_type.toLowerCase().replace("_", " ")}
                    </span>
                    <span className="text-[#5F5E5A]">
                      {formatCurrency(Number(row.total_revenue), currency)}
                      <span className="ml-2 text-[11px]">({row.percentage}%)</span>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-[#F1EFE8] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0D7A5F] rounded-full"
                      style={{ width: `${Math.min(row.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Refund summary ─────────────────────────────────── */}
      <Section title="Refund Summary">
        {loadingRefunds ? (
          <SkeletonRows count={3} />
        ) : !refunds ? (
          <EmptyState title="No refund data" description="No refunds in this period." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <StatRow
                label="Total Refund Transactions"
                value={String(refunds.total_refund_transactions)}
              />
              <StatRow
                label="Total Amount Refunded"
                value={formatCurrency(Number(refunds.total_amount_refunded), currency)}
              />
              <StatRow
                label="Refund Rate"
                value={`${refunds.refund_rate}%`}
              />
            </div>
            {refunds.top_refunded_items.length > 0 && (
              <div>
                <p className="text-[12px] text-[#5F5E5A] font-medium uppercase tracking-wide mb-2">
                  Most Refunded Items
                </p>
                <div className="space-y-2">
                  {refunds.top_refunded_items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-[13px]">
                      <div>
                        <p className="text-[#0F2B4C] font-medium">{item.item_name}</p>
                        <p className="text-[11px] text-[#5F5E5A]">{item.product_name}</p>
                      </div>
                      <span className="text-[#A32D2D] font-medium ml-4">
                        {item.refund_qty}× ({item.refund_count} times)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

type KpiColour = "teal" | "navy" | "purple" | "red";

const KPI_STYLES: Record<KpiColour, { card: string; value: string }> = {
  teal:   { card: "bg-[#E1F5EE]", value: "text-[#0D7A5F]" },
  navy:   { card: "bg-[#F1EFE8]", value: "text-[#0F2B4C]" },
  purple: { card: "bg-[#EEEDFE]", value: "text-[#534AB7]" },
  red:    { card: "bg-[#FCEBEB]", value: "text-[#A32D2D]" },
};

function KpiCard({
  label, value, sub, colour,
}: {
  label: string;
  value: string | null;
  sub: string | null;
  colour: KpiColour;
}) {
  const s = KPI_STYLES[colour];
  return (
    <div className={`${s.card} rounded-lg p-4`}>
      <p className="text-[12px] text-[#5F5E5A] font-medium mb-1">{label}</p>
      {value === null ? (
        <div className="space-y-1.5">
          <Skeleton height={28} width="70%" />
          <Skeleton height={12} width="50%" />
        </div>
      ) : (
        <>
          <p className={`text-[22px] font-semibold leading-tight ${s.value}`}>{value}</p>
          {sub && <p className="text-[12px] text-[#5F5E5A] mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#D3D1C7] rounded-lg px-4 py-3 flex items-center justify-between">
      <span className="text-[13px] text-[#5F5E5A]">{label}</span>
      <span className="text-[14px] font-medium text-[#0F2B4C]">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
      <h2 className="text-[14px] font-medium text-[#0F2B4C] mb-4">{title}</h2>
      {children}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Skeleton height={14} width="40%" />
          <Skeleton height={14} width="20%" />
        </div>
      ))}
    </div>
  );
}