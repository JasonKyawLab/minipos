"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import kitchenApi, { cancelKitchenTicket } from "@/lib/kitchenApi";
import { ModeGate } from "@/components/mode/ModeGate";
import { VoidTicketModal } from "@/components/kitchen/VoidTicketModal";
import { KitchenHeader } from "@/components/kitchen/KitchenHeader";
import { KitchenShiftSummaryModal } from "@/components/kitchen/KitchenShiftSummaryModal";
import { TicketColumn, type ColumnDef } from "@/components/kitchen/TicketColumn";
import { deriveTicketStatus } from "@/components/kitchen/TicketCard";
import { useKitchenTickets } from "@/hooks/kitchen/useKitchenTickets";
import { useKitchenSocket } from "@/hooks/kitchen/useKitchenSocket";
import type { KitchenTicket, KitchenTicketItem, KitchenRole } from "@/types/kitchen";
import { NEXT_ITEM_STATUS } from "@/types/kitchen";

const SHIFT_START_KEY = "minipos_kitchen_shift_start";

const COLUMNS: ColumnDef[] = [
  { status: "QUEUED",      label: "Queued",      colour: "border-[#D97706] text-[#D97706]" },
  { status: "IN_PROGRESS", label: "In Progress", colour: "border-[#534AB7] text-[#534AB7]" },
  { status: "READY",       label: "Ready",       colour: "border-[#0D7A5F] text-[#0D7A5F]" },
];

function getStoredKitchenRole(shopId: string): KitchenRole {
  if (typeof window === "undefined") return "CHEF";
  const stored = sessionStorage.getItem(`minipos_kitchen_role_${shopId}`);
  if (stored === "OWNER" || stored === "MANAGER" || stored === "CHEF") return stored;
  return "CHEF";
}

function getStoredKitchenName(shopId: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(`minipos_kitchen_name_${shopId}`) ?? "";
}

function getStoredShopName(shopId: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(`minipos_kitchen_shop_name_${shopId}`) ?? "";
}

export default function KitchenDisplayPage() {
  const { shopId } = useParams<{ shopId: string }>();

  const [currentRole, setCurrentRole] = useState<KitchenRole>("CHEF");
  const [staffName,   setStaffName]   = useState("");
  const [shopName,    setShopName]    = useState("");

  useEffect(() => {
    setCurrentRole(getStoredKitchenRole(shopId));
    setStaffName(getStoredKitchenName(shopId));
    setShopName(getStoredShopName(shopId));
  }, [shopId]);

  // ── Ticket state ───────────────────────────────────────
  const { tickets, setTickets, loading, fetchError, refetch } = useKitchenTickets(shopId);

  // ── Action loading state ───────────────────────────────
  const [bumpingItems, setBumpingItems]   = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  // ── Void state ─────────────────────────────────────────
  const [voidingTicket, setVoidingTicket] = useState<KitchenTicket | null>(null);
  const [voidLoading, setVoidLoading]     = useState(false);
  const [voidError, setVoidError]         = useState<string | null>(null);

  // ── Shift / exit state ─────────────────────────────────
  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // ── Socket ─────────────────────────────────────────────
  const handleForceLogout = useCallback(() => {
    kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`).catch(() => {});
    sessionStorage.removeItem(SHIFT_START_KEY);
    window.location.href = `/kitchen/${shopId}`;
  }, [shopId]);

  const { connected } = useKitchenSocket({
    shopId,
    onRefresh: refetch,
    setTickets,
    onForceLogout: handleForceLogout,
  });

  // ── Bump item status ───────────────────────────────────
  async function handleBumpItem(ticket: KitchenTicket, item: KitchenTicketItem) {
    const nextStatus = NEXT_ITEM_STATUS[item.kitchen_status];
    if (!nextStatus) return;

    setBumpingItems((prev) => new Set(prev).add(item.id));
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticket.id) return t;
        const updatedItems  = t.items.map((i) => i.id === item.id ? { ...i, kitchen_status: nextStatus } : i);
        const ticketStatus  = deriveTicketStatus(updatedItems, t.ticket_status);
        return { ...t, ticket_status: ticketStatus, items: updatedItems };
      })
    );

    try {
      await kitchenApi.patch(
        `/api/shops/${shopId}/kitchen/tickets/${ticket.id}/items/${item.id}/status`,
        { kitchen_status: nextStatus }
      );
    } catch {
      refetch();
    } finally {
      setBumpingItems((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
    }
  }

  // ── Complete ticket ────────────────────────────────────
  async function handleCompleteTicket(ticket: KitchenTicket) {
    setCompletingIds((prev) => new Set(prev).add(ticket.id));
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id));

    try {
      await kitchenApi.patch(
        `/api/shops/${shopId}/kitchen/tickets/${ticket.id}/status`,
        { ticket_status: "DONE" }
      );
    } catch {
      refetch();
    } finally {
      setCompletingIds((prev) => { const s = new Set(prev); s.delete(ticket.id); return s; });
    }
  }

  // ── Void ticket (OWNER/MANAGER only — backend enforced) ─
  async function handleConfirmVoid() {
    if (!voidingTicket) return;
    setVoidLoading(true);
    setVoidError(null);
    try {
      await cancelKitchenTicket(shopId, voidingTicket.id);
      setTickets((prev) => prev.filter((t) => t.id !== voidingTicket.id));
      setVoidingTicket(null);
    } catch (err: any) {
      const code = err?.response?.data?.message;
      if (code === "FORBIDDEN") {
        setVoidError("Only an Owner or Manager can void a ticket.");
      } else if (code === "TICKET_ALREADY_CANCELLED" || code === "TICKET_NOT_FOUND") {
        // Stale frontend state — silently drop the card
        setTickets((prev) => prev.filter((t) => t.id !== voidingTicket.id));
        setVoidingTicket(null);
      } else {
        setVoidError("Could not void this ticket. Please try again.");
      }
    } finally {
      setVoidLoading(false);
    }
  }

  // ── Shift / exit ───────────────────────────────────────
  function handleEndShiftClick() {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (startStr) {
      const ms      = Date.now() - new Date(startStr).getTime();
      const hours   = Math.floor(ms / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      setShiftDuration(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }
    setShowShiftSummary(true);
  }

  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try { await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`); } catch {}
    sessionStorage.removeItem(SHIFT_START_KEY);
    sessionStorage.removeItem(`minipos_kitchen_role_${shopId}`);
    sessionStorage.removeItem(`minipos_kitchen_name_${shopId}`);
    sessionStorage.removeItem(`minipos_kitchen_shop_name_${shopId}`);
    window.location.href = `/kitchen/${shopId}`;
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try { await kitchenApi.post(`/api/shops/${shopId}/kitchen-auth/logout`); } catch {}
    sessionStorage.removeItem(SHIFT_START_KEY);
    sessionStorage.removeItem(`minipos_kitchen_role_${shopId}`);
    sessionStorage.removeItem(`minipos_kitchen_name_${shopId}`);
    sessionStorage.removeItem(`minipos_kitchen_shop_name_${shopId}`);
    window.location.href = `/shops/${shopId}/dashboard`;
  }

  // ── Render ─────────────────────────────────────────────

  return (
    <>
      <div className="h-screen bg-[#0A0A0A] flex flex-col overflow-hidden">
        <KitchenHeader
          shopName={shopName}
          staffName={staffName}
          ticketCount={tickets.length}
          socketConnected={connected}
          endingShift={endingShift}
          exitingMode={exitingMode}
          onEndShift={handleEndShiftClick}
          onExitMode={() => setShowExitGate(true)}
        />

        <div className="flex flex-1 overflow-hidden gap-3 p-4">
          {COLUMNS.map((col) => (
            <TicketColumn
              key={col.status}
              column={col}
              tickets={tickets.filter((t) => t.ticket_status === col.status)}
              loading={loading}
              fetchError={col.status === "QUEUED" ? fetchError : null}
              bumpingItems={bumpingItems}
              completingIds={completingIds}
              currentRole={currentRole}
              onBumpItem={handleBumpItem}
              onComplete={handleCompleteTicket}
              onVoidTicket={setVoidingTicket}
              onRetry={refetch}
            />
          ))}
        </div>
      </div>

      <KitchenShiftSummaryModal
        open={showShiftSummary}
        shiftDuration={shiftDuration}
        onConfirm={handleShiftConfirmed}
        onCancel={() => setShowShiftSummary(false)}
      />

      {showExitGate && (
        <ModeGate
          shopId={shopId}
          shopName=""
          mode="KITCHEN"
          action="exit"
          allowCancel={true}
          onSuccess={handleExitConfirmed}
          onCancel={() => setShowExitGate(false)}
        />
      )}

      {voidingTicket && (
        <VoidTicketModal
          orderNo={voidingTicket.order_no}
          isLoading={voidLoading}
          errorMessage={voidError}
          onConfirm={handleConfirmVoid}
          onCancel={() => { setVoidingTicket(null); setVoidError(null); }}
        />
      )}
    </>
  );
}
