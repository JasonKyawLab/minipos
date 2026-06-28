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
import { useSearchParams } from "next/navigation";

const TYPE_LABELS: Record<string, string> = {
  RETAIL: "Retail", RESTAURANT: "Restaurant", ONLINE_SHOP: "Online",
};

export default function AdminShopsPage() {
  const [shops, setShops]         = useState<Shop[]>([]);
  const [loading, setLoading]     = useState(true);
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  // Deletion modal state
  const [deleteTarget, setDeleteTarget]   = useState<Shop | null>(null);
  const [deleteInput, setDeleteInput]     = useState("");
  const [deleting, setDeleting]           = useState(false);

  // Suspend modal state
  const [suspendTarget, setSuspendTarget] = useState<Shop | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending]       = useState(false);

  const [unsuspendingId, setUnsuspendingId] = useState<string | null>(null);

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

  function openSuspendModal(shop: Shop) {
    setSuspendTarget(shop);
    setSuspendReason("");
  }

  function closeSuspendModal() {
    setSuspendTarget(null);
    setSuspendReason("");
  }

  const requiredConfirmation = deleteTarget?.name ?? "";
  const confirmationMatches  = deleteInput === requiredConfirmation;
  const reasonValid = suspendReason.trim().length >= 3;

  async function handleDelete() {
    if (!deleteTarget || !confirmationMatches) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/shops/${deleteTarget.id}`);
      toast.success(`Shop "${deleteTarget.name}" deleted.`);
      closeDeleteModal();
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setDeleting(false); }
  }

  async function handleSuspend() {
    if (!suspendTarget || !reasonValid) return;
    setSuspending(true);
    try {
      await api.patch(`/api/admin/shops/${suspendTarget.id}/suspend`, {
        reason: suspendReason.trim(),
      });
      toast.success(`Shop "${suspendTarget.name}" suspended.`);
      closeSuspendModal();
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setSuspending(false); }
  }

  async function handleUnsuspend(shop: Shop) {
    setUnsuspendingId(shop.id);
    try {
      await api.patch(`/api/admin/shops/${shop.id}/unsuspend`);
      toast.success(`Shop "${shop.name}" unsuspended.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setUnsuspendingId(null); }
  }

  function handleCopyId(id: string) {
    navigator.clipboard.writeText(id);
    toast.success("Shop ID copied.");
  }

  // ── THE ACTUAL FIX ────────────────────────────────────
  // Previously this only checked `s.name`. A search for an owner's
  // email or a pasted shop ID (e.g. from a log line) would find
  // nothing, even though that data exists on each shop object.
  // Now it matches against shop name, shop ID, owner name, AND
  // owner email — one search box, four fields, case-insensitive.
  const query = search.toLowerCase().trim();
  const filtered = shops.filter((s) => {
    if (!query) return true;
    return (
      s.name.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query) ||
      (s.owner_name?.toLowerCase().includes(query) ?? false) ||
      (s.owner_email?.toLowerCase().includes(query) ?? false)
    );
  });

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
          className="w-80 h-8 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          placeholder="Search by shop name, owner, or ID…"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No shops found"
          description={search ? "Try a different search." : "No shops registered yet."}
        />
      ) : (
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[820px]">
              <thead>
                <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                  <th className="text-left px-5 py-3 font-medium">Shop name</th>
                  <th className="text-left px-4 py-3 font-medium">Owner</th>
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
                        {!shop.is_deleted && shop.is_suspended && (
                          <span className="text-[11px] px-1.5 py-0.5 bg-[#FFF3DC] text-[#8A5A00] rounded">
                            Suspended
                          </span>
                        )}
                      </div>
                      {/* Click-to-copy full ID — kept truncated visually so it
                          doesn't clutter the row, but the full UUID is one
                          click away for pasting into a DB query or log search. */}
                      <p
                        className="text-[11px] text-[#5F5E5A] font-mono cursor-pointer hover:text-[#0F2B4C] transition-colors w-fit"
                        title="Click to copy full ID"
                        onClick={() => handleCopyId(shop.id)}
                      >
                        {shop.id.slice(0, 8)}…
                      </p>
                      {!shop.is_deleted && shop.is_suspended && shop.suspended_reason && (
                        <p className="text-[11px] text-[#8A5A00] mt-0.5 max-w-xs truncate" title={shop.suspended_reason}>
                          Reason: {shop.suspended_reason}
                        </p>
                      )}
                    </td>
                    {/* Owner — links back to Users tab pre-filtered to this
                        owner's email, closing the loop between the two tabs. */}
                    <td className="px-4 py-3">
                      {shop.owner_name ? (
                        <Link
                          href={`/admin/users?search=${encodeURIComponent(shop.owner_email ?? "")}`}
                          className="hover:underline"
                        >
                          <p className="font-medium text-[#0F2B4C]">{shop.owner_name}</p>
                          <p className="text-[11px] text-[#5F5E5A]">{shop.owner_email}</p>
                        </Link>
                      ) : (
                        <span className="text-[11px] text-[#A32D2D]">No owner</span>
                      )}
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
                        {/* "View" intentionally removed: it pointed at the
                            owner-only dashboard route, which an admin has
                            no shop_users membership to legitimately enter.
                            Re-add only once a proper scoped, audit-logged
                            "login as" impersonation flow exists — not as
                            a direct link into the live owner UI. */}
                        {!shop.is_deleted && !shop.is_suspended && (
                          <button
                            onClick={() => openSuspendModal(shop)}
                            className="text-[12px] text-[#8A5A00] hover:underline"
                          >
                            Suspend
                          </button>
                        )}
                        {!shop.is_deleted && shop.is_suspended && (
                          <button
                            onClick={() => handleUnsuspend(shop)}
                            disabled={unsuspendingId === shop.id}
                            className="text-[12px] text-[#0D7A5F] hover:underline disabled:opacity-50"
                          >
                            {unsuspendingId === shop.id ? "Unsuspending…" : "Unsuspend"}
                          </button>
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
        </div>
      )}

      {/* ── Suspend confirmation modal ── */}
      {suspendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md animate-fade-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#FFF3DC] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 6v4M9 12h.01" stroke="#8A5A00" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="9" cy="9" r="7" stroke="#8A5A00" strokeWidth="1.3" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-medium text-[#0F2B4C] leading-tight">Suspend shop</h3>
                <p className="text-[13px] text-[#5F5E5A] mt-0.5">
                  Blocks the owner's dashboard, POS, and kitchen access. No data is touched
                  or deleted, and this can be undone any time with "Unsuspend."
                </p>
              </div>
            </div>
            <div className="bg-[#F1EFE8] rounded-lg px-4 py-3 mb-4">
              <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide mb-0.5">Shop to suspend</p>
              <p className="text-[14px] font-semibold text-[#0F2B4C]">{suspendTarget.name}</p>
            </div>
            <div className="mb-5">
              <label className="block text-[13px] text-[#5F5E5A] mb-2">
                Reason (visible in audit log, required):
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8A5A00]/30 resize-none"
                placeholder="e.g. Payment overdue 30+ days, abuse report #482…"
                autoFocus
                spellCheck={false}
              />
              {suspendReason.length > 0 && !reasonValid && (
                <p className="text-[11px] text-[#A32D2D] mt-1">Reason must be at least 3 characters.</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeSuspendModal}
                disabled={suspending}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={suspending || !reasonValid}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#8A5A00] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
              >
                {suspending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                Suspend shop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md animate-fade-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#FCEBEB] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 6v4M9 12h.01M3 15.5h12a1 1 0 00.87-1.5l-6-10.5a1 1 0 00-1.74 0L2.13 14a1 1 0 00.87 1.5z"
                    stroke="#A32D2D" strokeWidth="1.3" strokeLinecap="round"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-medium text-[#0F2B4C] leading-tight">Delete shop</h3>
                <p className="text-[13px] text-[#5F5E5A] mt-0.5">
                  This will soft-delete the shop. All data is preserved for audit purposes.
                </p>
              </div>
            </div>
            <div className="bg-[#F1EFE8] rounded-lg px-4 py-3 mb-4">
              <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide mb-0.5">Shop to delete</p>
              <p className="text-[14px] font-semibold text-[#0F2B4C]">{deleteTarget.name}</p>
            </div>
            <div className="mb-5">
              <p className="text-[13px] text-[#5F5E5A] mb-2">
                To confirm, type{" "}
                <span className="font-semibold text-[#A32D2D] font-mono select-all">{deleteTarget.name}</span>{" "}
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
                placeholder={deleteTarget.name}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {deleteInput.length > 0 && !confirmationMatches && (
                <p className="text-[11px] text-[#A32D2D] mt-1">
                  Doesn't match — type the shop name exactly as shown above.
                </p>
              )}
              {confirmationMatches && (
                <p className="text-[11px] text-[#0D7A5F] mt-1">✓ Confirmed — you may now delete this shop.</p>
              )}
            </div>
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
                {deleting && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                Delete shop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}