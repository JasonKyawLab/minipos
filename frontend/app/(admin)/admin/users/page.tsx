"use client";
// =========================================================
// app/(admin)/admin/users/page.tsx
// Platform admin: view all users, change status, role.
//
// FIXED:
//   - handleToggleStatus was calling PATCH /users/:id/status,
//     which never existed on the backend (404). Backend now
//     has dedicated /suspend and /reactivate endpoints — same
//     pattern as the shop suspend/unsuspend routes — so this
//     calls the correct one based on current status.
//   - Replaced the native browser confirm() popups (the plain
//     "localhost:5173 says..." dialog) with a styled in-app
//     modal matching the rest of MiniPOS, for both the status
//     toggle and the role toggle.
//   - FIXED: a "Shops" <th> header was added but the matching
//     <td> in each row was missing, which misaligned every
//     column after it (Actions ended up under the Shops header).
//     Added the missing cell, showing each user's owned-shop
//     count (from the backend's shop_count, which only counts
//     shops where this user has an OWNER membership and the
//     shop isn't soft-deleted).
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { User, UserStatus, UserRole } from "@/types";
import { EmptyState } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { PaginationMeta } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE:    "bg-[#E1F5EE] text-[#0D7A5F]",
  SUSPENDED: "bg-[#FCEBEB] text-[#A32D2D]",
};

// What the confirm modal is currently asking about.
// Kept as a single piece of state (rather than two booleans)
// so only one confirm modal can ever be open at a time.
type PendingAction =
  | { type: "STATUS"; user: User; newStatus: UserStatus }
  | { type: "ROLE"; user: User; newRole: UserRole }
  | null;

export default function AdminUsersPage() {
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  const [pending, setPending] = useState<PendingAction>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/admin/users?page=${page}&pageSize=20`);
      setUsers(data);
      setMeta(data.pagination);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  function askToggleStatus(user: User) {
    const newStatus: UserStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setPending({ type: "STATUS", user, newStatus });
  }

  function askToggleRole(user: User) {
    const newRole: UserRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    setPending({ type: "ROLE", user, newRole });
  }

  async function confirmPending() {
    if (!pending) return;
    setSubmitting(true);
    try {
      if (pending.type === "STATUS") {
        // Dedicated endpoints (matching the shop suspend/unsuspend
        // pattern) — not a generic PATCH /status, which never
        // existed on the backend.
        const endpoint = pending.newStatus === "SUSPENDED" ? "suspend" : "reactivate";
        await api.patch(`/api/admin/users/${pending.user.id}/${endpoint}`);
        toast.success(`User ${pending.newStatus === "SUSPENDED" ? "suspended" : "reactivated"}.`);
      } else {
        await api.patch(`/api/admin/users/${pending.user.id}/role`, { role: pending.newRole });
        toast.success("Role updated.");
      }
      setPending(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setSubmitting(false);
    }
  }

  function getInitials(name: string) {
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ── Confirm modal copy — varies by action type ──────────
  const modalTitle = pending?.type === "STATUS"
    ? (pending.newStatus === "SUSPENDED" ? "Suspend user" : "Reactivate user")
    : "Change role";

  const modalDescription = pending?.type === "STATUS"
    ? (pending.newStatus === "SUSPENDED"
        ? "They'll immediately lose access to all shops and the platform until reactivated."
        : "They'll regain access immediately.")
    : `This changes ${pending?.user.name}'s platform role between ADMIN and USER.`;

  const confirmLabel = pending?.type === "STATUS"
    ? (pending.newStatus === "SUSPENDED" ? "Suspend" : "Reactivate")
    : "Change role";

  const confirmDanger = pending?.type === "STATUS" && pending.newStatus === "SUSPENDED";

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Users</h1>
        <span className="text-[12px] text-[#5F5E5A]">{users.length} total</span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 px-3 text-[13px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          placeholder="Search by name or email…"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No users found" description={search ? "Try a different search term." : "No users registered yet."} />
      ) : (
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Shops</th>
                <th className="text-right px-5 py-3 font-medium min-w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0">
                        {getInitials(u.name)}
                      </div>
                      <span className="font-medium text-[#0F2B4C]">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#5F5E5A]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${
                      u.role === "ADMIN"
                        ? "bg-[#EEEDFE] text-[#534AB7]"
                        : "bg-[#F1EFE8] text-[#5F5E5A]"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[u.status]}`}>
                      {u.status}
                    </span>
                  </td>
                  {/* Shops owned — counts only OWNER memberships on
                      non-deleted shops (see admin.repository.ts). */}
                  <td className="px-4 py-3 text-[#5F5E5A]">
                    {u.shop_count > 0 ? (
                      <span className="font-medium text-[#0F2B4C]">{u.shop_count}</span>
                    ) : (
                      <span className="text-[#9CA3AF]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">

                      <button
                        onClick={() => askToggleRole(u)}
                       className="text-[12px] text-[#534AB7] hover:underline whitespace-nowrap"
                      >
                        {u.role === "ADMIN" ? "Make User" : "Make Admin"}
                      </button>
                      <button
                        onClick={() => askToggleStatus(u)}
                         className={`text-[12px] hover:underline whitespace-nowrap ${u.status === "ACTIVE" ? "text-[#A32D2D]" : "text-[#0D7A5F]"}`}
                      >
                        {u.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Styled confirm modal — replaces native confirm() ──
          Reuses the same Modal component used across the rest
          of the app, so this matches your design system instead
          of showing the browser's plain "localhost says" popup. */}
      <Modal open={!!pending} onClose={() => setPending(null)} title={modalTitle}>
        <div className="space-y-4">
          <p className="text-[13px] text-[#5F5E5A]">
            {pending?.type === "STATUS" || pending?.type === "ROLE" ? (
              <>
                <span className="font-medium text-[#0F2B4C]">{pending.user.name}</span>
                {" "}({pending.user.email})
              </>
            ) : null}
          </p>
          <p className="text-[13px] text-[#5F5E5A]">{modalDescription}</p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setPending(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmPending}
              loading={submitting}
              className={confirmDanger ? "bg-[#A32D2D] hover:bg-[#A32D2D]/90" : undefined}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}