"use client";
// =========================================================
// app/(admin)/admin/shops/page.tsx
// Platform admin: view all shops, hard-delete if needed.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatDateTime } from "@/utils/formatDate";
import toast from "react-hot-toast";
import type { Shop } from "@/types";
import { EmptyState } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

const TYPE_LABELS: Record<string, string> = {
  RETAIL: "Retail", RESTAURANT: "Restaurant", ONLINE_SHOP: "Online",
};

export default function AdminShopsPage() {
  const [shops, setShops]     = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Shop[]>("/api/admin/shops");
      setShops(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(shop: Shop) {
    if (!confirm(`Permanently delete shop "${shop.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/admin/shops/${shop.id}/hard`);
      toast.success("Shop permanently deleted.");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  const filtered = shops.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Shops</h1>
        <span className="text-[12px] text-[#5F5E5A]">{shops.length} total</span>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          placeholder="Search by shop name…"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No shops found" description={search ? "Try a different search." : "No shops registered yet."} />
      ) : (
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                <th className="text-left px-5 py-3 font-medium">Shop name</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Currency</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shop) => (
                <tr key={shop.id} className={`border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40 ${shop.is_deleted ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#0F2B4C]">{shop.name}</span>
                      {shop.is_deleted && (
                        <span className="text-[11px] px-1.5 py-0.5 bg-[#FCEBEB] text-[#A32D2D] rounded">Deleted</span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5F5E5A] font-mono">{shop.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-3 text-[#5F5E5A]">{TYPE_LABELS[shop.shop_type] ?? shop.shop_type}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#0F2B4C]">{shop.currency}</span>
                  </td>
                  <td className="px-4 py-3 text-[#5F5E5A]">{formatDateTime(shop.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {!shop.is_deleted && (
                        <Link
                          href={`/shops/${shop.id}/dashboard`}
                          className="text-[12px] text-[#534AB7] hover:underline"
                        >
                          View
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(shop)}
                        className="text-[12px] text-[#A32D2D] hover:underline"
                      >
                        Hard delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}