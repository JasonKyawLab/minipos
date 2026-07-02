import { useState, useEffect } from "react";
import { createFreshSocket } from "@/lib/socket";
import { debugLog } from "@/utils/debugLog";
import type { KitchenTicket, KitchenTicketStatus, KitchenStatus } from "@/types/kitchen";

const EV_TICKET_CREATED = "kitchen:ticket_created";
const EV_TICKET_UPDATED = "kitchen:ticket_updated";
const EV_ITEM_STATUS    = "kitchen:item_status";
const EV_TICKET_READY   = "kitchen:ticket_ready";
const EV_FORCE_LOGOUT   = "kitchen:force_logout";

interface Options {
  shopId:        string;
  onRefresh:     () => void;
  setTickets:    React.Dispatch<React.SetStateAction<KitchenTicket[]>>;
  onForceLogout: () => void;
}

export function useKitchenSocket({ shopId, onRefresh, setTickets, onForceLogout }: Options) {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const socket = createFreshSocket();
    socket.connect();

    socket.on("connect", () => {
      debugLog("[Kitchen Socket] connected, id:", socket.id);
      setConnected(true);
      socket.emit("join_terminal_session", { shopId, mode: "KITCHEN" });
      onRefresh();
    });

    socket.on("disconnect", (reason: string) => {
      debugLog("[Kitchen Socket] disconnected, reason:", reason);
      setConnected(false);
    });

    socket.on("reconnect", () => {
      debugLog("[Kitchen Socket] reconnected");
      socket.emit("join_terminal_session", { shopId, mode: "KITCHEN" });
      onRefresh();
    });

    socket.on("terminal_room_joined", (data: unknown) => {
      debugLog("[Kitchen Socket] joined terminal room:", data);
    });

    socket.on("error", (err: unknown) => {
      debugLog("[Kitchen Socket] Socket error:", err);
    });

    socket.on(EV_TICKET_CREATED, () => {
      debugLog("[Kitchen Socket] ticket_created received — refreshing");
      onRefresh();
    });

    socket.on(EV_TICKET_UPDATED, (payload: {
      ticketId?:     string;
      orderId?:      string;
      ticket_status: KitchenTicketStatus;
    }) => {
      const id = payload.ticketId ?? payload.orderId;
      if (!id) return;
      if (payload.ticket_status === "DONE" || payload.ticket_status === "CANCELLED") {
        setTickets((prev) => prev.filter((t) => t.id !== id && t.order_id !== id));
      } else {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === id || t.order_id === id
              ? { ...t, ticket_status: payload.ticket_status }
              : t
          )
        );
      }
    });

    socket.on(EV_ITEM_STATUS, (payload: {
      ticketId:       string;
      itemId:         string;
      kitchen_status: KitchenStatus;
      ticket_status:  KitchenTicketStatus;
    }) => {
      setTickets((prev) =>
        prev.map((ticket) => {
          if (ticket.id !== payload.ticketId) return ticket;
          return {
            ...ticket,
            ticket_status: payload.ticket_status,
            items: ticket.items.map((item) =>
              item.id === payload.itemId
                ? { ...item, kitchen_status: payload.kitchen_status }
                : item
            ),
          };
        })
      );
    });

    socket.on(EV_TICKET_READY, () => {});

    socket.on(EV_FORCE_LOGOUT, () => onForceLogout());

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("terminal_room_joined");
      socket.off("error");
      socket.off(EV_TICKET_CREATED);
      socket.off(EV_TICKET_UPDATED);
      socket.off(EV_ITEM_STATUS);
      socket.off(EV_TICKET_READY);
      socket.off(EV_FORCE_LOGOUT);
      socket.disconnect();
    };
  // onRefresh and onForceLogout must be stable (useCallback at the call site)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return { connected };
}
