import { useState, useCallback, useEffect } from "react";
import posApi from "@/lib/posApi";
import type { RestaurantMode, TableStatus } from "@/types/pos";

export function useTableStatuses(
  shopId:        string,
  isRestaurant:  boolean,
  restaurantMode: RestaurantMode
) {
  const [data, setData]       = useState<TableStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isRestaurant) return;
    setLoading(true);
    try {
      const { data: rows } = await posApi.get<TableStatus[]>(
        `/api/shops/${shopId}/pos-auth/tables/status`
      );
      setData(Array.isArray(rows) ? rows : []);
    } catch {
      // Non-fatal — cashier can retry via the Refresh button
    } finally {
      setLoading(false);
    }
  }, [shopId, isRestaurant]);

  useEffect(() => {
    if (restaurantMode === "tables") load();
  }, [restaurantMode, load]);

  return { data, loading, load };
}
