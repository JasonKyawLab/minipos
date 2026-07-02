"use client";

import React from "react";
import type { KitchenTicket, KitchenTicketItem, KitchenTicketStatus, KitchenRole } from "@/types/kitchen";
import { TicketCard } from "./TicketCard";

export interface ColumnDef {
  status: KitchenTicketStatus;
  label:  string;
  colour: string; // Tailwind border + text classes
}

interface Props {
  column:       ColumnDef;
  tickets:      KitchenTicket[];
  loading:      boolean;
  fetchError:   string | null;
  bumpingItems: Set<string>;
  completingIds: Set<string>;
  currentRole:  KitchenRole;
  onBumpItem:   (ticket: KitchenTicket, item: KitchenTicketItem) => void;
  onComplete:   (ticket: KitchenTicket) => void;
  onVoidTicket: (ticket: KitchenTicket) => void;
  onRetry:      () => void;
}

export function TicketColumn({
  column,
  tickets,
  loading,
  fetchError,
  bumpingItems,
  completingIds,
  currentRole,
  onBumpItem,
  onComplete,
  onVoidTicket,
  onRetry,
}: Props) {
  const textColour = column.colour.split(" ")[1]; // second class is the text colour

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${column.colour}`}>
        <span className={`text-[13px] font-semibold ${textColour}`}>{column.label}</span>
        <span className={`text-[11px] ${textColour} opacity-60`}>({tickets.length})</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <p className="text-white/20 text-[12px] text-center py-8">Loading…</p>
        ) : fetchError ? (
          <div className="text-center py-8">
            <p className="text-red-400/70 text-[12px]">{fetchError}</p>
            <button
              onClick={onRetry}
              className="mt-2 text-[11px] text-white/30 hover:text-white/60 transition"
            >
              Retry
            </button>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              bumpingItems={bumpingItems}
              completing={completingIds.has(ticket.id)}
              currentRole={currentRole}
              onBumpItem={onBumpItem}
              onComplete={onComplete}
              onVoidTicket={onVoidTicket}
            />
          ))
        )}
      </div>
    </div>
  );
}
