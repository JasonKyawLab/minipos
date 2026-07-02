import { useState, useEffect, useCallback, useMemo } from "react";
import posApi from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
import type { PublicMenuItem, CategoryTab } from "@/types/pos";

export function useMenu(shopId: string) {
  const [menu, setMenu]               = useState<PublicMenuItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [activeCategory, setCategory] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await posApi.get<PublicMenuItem[]>(
        `/api/shops/${shopId}/pos-auth/menu`
      );
      setMenu(data);
    } catch (err: any) {
      setError(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const { categorisedMenu, categories } = useMemo(() => {
    const map: Record<string, PublicMenuItem[]> = { all: [...menu] };
    const catMeta: Record<string, { name: string; color: string | null; sortOrder: number }> = {};

    for (const product of menu) {
      const catId = product.category_id ?? "uncategorised";
      if (!map[catId]) map[catId] = [];
      map[catId].push(product);
      if (product.category_id && !catMeta[catId]) {
        catMeta[catId] = {
          name:      product.category_name       ?? "Unknown",
          color:     product.category_color      ?? null,
          sortOrder: product.category_sort_order ?? 999,
        };
      }
    }

    const sorted = Object.keys(catMeta).sort(
      (a, b) => catMeta[a].sortOrder - catMeta[b].sortOrder
    );

    const tabs: CategoryTab[] = [
      { id: "all", label: "All", color: null, count: menu.length },
      ...sorted.map((id) => ({
        id,
        label: catMeta[id].name,
        color: catMeta[id].color,
        count: (map[id] ?? []).length,
      })),
    ];

    return { categorisedMenu: map, categories: tabs };
  }, [menu]);

  return {
    menu,
    loading,
    error,
    activeCategory,
    setActiveCategory: setCategory,
    categorisedMenu,
    categories,
    reload: load,
  };
}
