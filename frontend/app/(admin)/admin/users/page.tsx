"use client";
// =========================================================
// app/(admin)/admin/users/page.tsx
// Platform admin: view all users, change status, role.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatDateTime } from "@/utils/formatDate";
import toast from "react-hot-toast";
import type { User, UserStatus, UserRole } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE:    "bg-[#E1F5EE] text-[#0D7A5F]",
  SUSPENDED: "bg-[#FCEBEB] text-[#A32D2D]",
};

export default function AdminUsersPage() {
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<User[]>("/api/admin/users");
      setUsers(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleStatus(user: User) {
    const newStatus: UserStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const action = newStatus === "SUSPENDED" ? "suspend" : "reactivate";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.name}?`)) return;
    try {
      await api.patch(`/api/admin/users/${user.id}/status`, { status: newStatus });
      toast.success(`User ${action}d.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleToggleRole(user: User) {
    const newRole: UserRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    if (!confirm(`Change ${user.name}'s role to ${newRole}?`)) return;
    try {
      await api.patch(`/api/admin/users/${user.id}/role`, { role: newRole });
      toast.success("Role updated.");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  function getInitials(name: string) {
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

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
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
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
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleToggleRole(u)}
                        className="text-[12px] text-[#534AB7] hover:underline"
                      >
                        {u.role === "ADMIN" ? "Make User" : "Make Admin"}
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`text-[12px] hover:underline ${u.status === "ACTIVE" ? "text-[#A32D2D]" : "text-[#0D7A5F]"}`}
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
    </div>
  );
}