import { useState, useCallback, useEffect, useRef } from "react";
import kitchenApi from "@/lib/kitchenApi";
import type { KitchenTicket, KitchenTicketStatus } from "@/types/kitchen";
import { ACTIVE_STATUSES } from "@/types/kitchen";

export function useKitchenTickets(shopId: string) {
  const [tickets, setTickets]     = useState<KitchenTicket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchingRef               = useRef(false);

  const refetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setFetchError(null);
      const { data } = await kitchenApi.get<KitchenTicket[]>(
        `/api/shops/${shopId}/kitchen/tickets`,
        { params: { status: ACTIVE_STATUSES.join(",") } }
      );
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      setFetchError("Failed to load orders. Check your connection.");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [shopId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { tickets, setTickets, loading, fetchError, refetch };
}
