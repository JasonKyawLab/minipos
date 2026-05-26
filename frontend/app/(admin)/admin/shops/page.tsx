// app/(admin)/admin/shops/page.tsx
"use client";

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
  const [shops, setShops]         = useState<Shop[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");

  // Deletion modal state
  const [deleteTarget, setDeleteTarget]   = useState<Shop | null>(null);
  const [deleteInput, setDeleteInput]     = useState("");
  const [deleting, setDeleting]           = useState(false);

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

  function openDeleteModal(shop: Shop) {
    setDeleteTarget(shop);
    setDeleteInput("");
  }

  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeleteInput("");
  }

  // The required confirmation string the admin must type exactly.
  // Using the shop name makes accidental deletion nearly impossible
  // because the admin must consciously read and retype the name.
  const requiredConfirmation = deleteTarget?.name ?? "";
  const confirmationMatches  = deleteInput === requiredConfirmation;

  async function handleDelete() {
    if (!deleteTarget || !confirmationMatches) return;
    setDeleting(true);
    try {
      // Calls the existing soft-delete endpoint on the admin router.
      // Hard delete is intentionally not exposed — soft delete is the
      // safe production pattern. Data is preserved for audit purposes.
      await api.delete(`/api/admin/shops/${deleteTarget.id}`);
      toast.success(`Shop "${deleteTarget.name}" deleted.`);
      closeDeleteModal();
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setDeleting(false); }
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
        <EmptyState
          title="No shops found"
          description={search ? "Try a different search." : "No shops registered yet."}
        />
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
                <tr
                  key={shop.id}
                  className={`border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40 ${shop.is_deleted ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#0F2B4C]">{shop.name}</span>
                      {shop.is_deleted && (
                        <span className="text-[11px] px-1.5 py-0.5 bg-[#FCEBEB] text-[#A32D2D] rounded">
                          Deleted
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5F5E5A] font-mono">
                      {shop.id.slice(0, 8)}…
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[#5F5E5A]">
                    {TYPE_LABELS[shop.shop_type] ?? shop.shop_type}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#0F2B4C]">{shop.currency}</span>
                  </td>
                  <td className="px-4 py-3 text-[#5F5E5A]">
                    {formatDateTime(shop.created_at)}
                  </td>
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
                      {!shop.is_deleted && (
                        <button
                          onClick={() => openDeleteModal(shop)}
                          className="text-[12px] text-[#A32D2D] hover:underline"
                        >
                          Delete
                        </button>
                      )}
                      {shop.is_deleted && (
                        <button
                          onClick={async () => {
                            try {
                              await api.patch(`/api/admin/shops/${shop.id}/restore`);
                              toast.success("Shop restored.");
                              load();
                            } catch (err: any) {
                              toast.error(getErrorMessage(err.response?.data?.message));
                            }
                          }}
                          className="text-[12px] text-[#0D7A5F] hover:underline"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md animate-fade-in">

            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#FCEBEB] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 6v4M9 12h.01M3 15.5h12a1 1 0 00.87-1.5l-6-10.5a1 1 0 00-1.74 0L2.13 14a1 1 0 00.87 1.5z"
                    stroke="#A32D2D"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-medium text-[#0F2B4C] leading-tight">
                  Delete shop
                </h3>
                <p className="text-[13px] text-[#5F5E5A] mt-0.5">
                  This will soft-delete the shop. All data is preserved for audit purposes.
                </p>
              </div>
            </div>

            {/* Shop name preview */}
            <div className="bg-[#F1EFE8] rounded-lg px-4 py-3 mb-4">
              <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide mb-0.5">
                Shop to delete
              </p>
              <p className="text-[14px] font-semibold text-[#0F2B4C]">
                {deleteTarget.name}
              </p>
            </div>

            {/* Instruction + input */}
            <div className="mb-5">
              <p className="text-[13px] text-[#5F5E5A] mb-2">
                To confirm, type{" "}
                <span className="font-semibold text-[#A32D2D] font-mono select-all">
                  {deleteTarget.name}
                </span>{" "}
                exactly in the box below:
              </p>
              <input
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmationMatches && handleDelete()}
                className={`w-full h-9 px-3 text-[13px] border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  deleteInput.length > 0 && !confirmationMatches
                    ? "border-[#A32D2D] focus:ring-[#A32D2D]/30"
                    : confirmationMatches
                    ? "border-[#0D7A5F] focus:ring-[#0D7A5F]/30"
                    : "border-[#D3D1C7] focus:ring-[#0D7A5F]/30"
                }`}
                // Placeholder shows the exact string required — removes ambiguity
                placeholder={deleteTarget.name}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {/* Inline validation feedback */}
              {deleteInput.length > 0 && !confirmationMatches && (
                <p className="text-[11px] text-[#A32D2D] mt-1">
                  Doesn't match — type the shop name exactly as shown above.
                </p>
              )}
              {confirmationMatches && (
                <p className="text-[11px] text-[#0D7A5F] mt-1">
                  ✓ Confirmed — you may now delete this shop.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !confirmationMatches}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#A32D2D] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
              >
                {deleting && (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                Delete shop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}