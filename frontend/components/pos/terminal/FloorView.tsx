"use client";

import React from "react";
import { formatCurrency } from "@/utils/formatCurrency";
import { Spinner } from "@/components/states";
import type { TableStatus, BillRequest } from "@/types/pos";
import type { Currency } from "@/types";

interface Props {
  tableStatuses: TableStatus[];
  loading:       boolean;
  currency:      Currency;
  onRefresh:     () => void;
  onBillPay:     (req: BillRequest) => void;
  onTableClick:  (table: TableStatus) => void;
}

const LEGEND = [
  { dot: "bg-white/20",  label: "Available" },
  { dot: "bg-[#93C5FD]", label: "Occupied" },
  { dot: "bg-[#D97706]", label: "Bill requested" },
];

export function FloorView({ tableStatuses, loading, currency, onRefresh, onBillPay, onTableClick }: Props) {
  return (
    <main className="flex-1 overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-white text-[18px] font-semibold">Floor View</p>
          <p className="text-white/30 text-[13px] mt-0.5">
            {tableStatuses.filter((t) => t.order_id).length} of {tableStatuses.length} tables occupied
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-[13px] text-white/40 border border-white/10 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
        >
          {loading ? (
            <>
              <Spinner size={12} />
              Refreshing…
            </>
          ) : (
            <>↻ Refresh</>
          )}
        </button>
      </div>

      <div className="flex items-center gap-5 mb-5 px-1">
        {LEGEND.map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
            <span className="text-[13px] text-white/40">{label}</span>
          </div>
        ))}
      </div>

      {loading && tableStatuses.length === 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : tableStatuses.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2">
          <p className="text-white/20 text-[14px]">No tables configured</p>
          <p className="text-white/15 text-[12px]">Add tables from the shop dashboard first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {tableStatuses.map((table) => {
            const isBillRequested = table.bill_requested && table.order_status === "CLOSING";
            const isOccupied      = !!table.order_id && !isBillRequested;
            const totalAmount     = table.total_amount ? parseFloat(table.total_amount) : null;

            const cardBorder  = isBillRequested ? "border-[#D97706]/60" : isOccupied ? "border-[#1E4FBF]/50" : "border-white/8";
            const cardBg      = isBillRequested ? "bg-[#D97706]/10"     : isOccupied ? "bg-[#1E4FBF]/10"     : "bg-white/[0.04]";
            const dotColor    = isBillRequested ? "bg-[#D97706]"        : isOccupied ? "bg-[#93C5FD]"        : "bg-white/20";
            const statusLabel = isBillRequested ? "Bill requested"      : isOccupied ? "Occupied"            : "Available";
            const statusColor = isBillRequested ? "text-[#D97706]"      : isOccupied ? "text-[#93C5FD]"      : "text-white/25";

            return (
              <button
                key={table.table_id}
                onClick={() => {
                  if (isBillRequested && table.order_id) {
                    onBillPay({
                      orderId:     table.order_id,
                      orderNo:     table.order_no ?? "",
                      tableId:     table.table_id,
                      tableNumber: table.table_number,
                      totalAmount: totalAmount ?? 0,
                      timestamp:   table.order_started_at ?? "",
                    });
                  } else {
                    onTableClick(table);
                  }
                }}
                className={`relative flex flex-col gap-2.5 p-4 rounded-xl border text-left transition hover:brightness-125 active:scale-[0.97] cursor-pointer ${cardBorder} ${cardBg}`}
              >
                {isBillRequested && <span className="absolute top-3 right-3 text-[16px]">🔔</span>}
                <p className="text-white font-bold text-[18px] leading-none pr-6">
                  Table {table.table_number}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`text-[13px] font-medium ${statusColor}`}>{statusLabel}</span>
                </div>
                {isBillRequested && totalAmount != null && (
                  <p className="text-[15px] font-bold text-[#D97706] mt-0.5">
                    {formatCurrency(totalAmount, currency)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
