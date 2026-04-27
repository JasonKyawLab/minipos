"use client";
// =========================================================
// app/(shop)/shops/[shopId]/staff/page.tsx
// View staff, invite by email, change roles, remove.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { StaffMember, ShopRole } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

const ROLE_LABELS: Record<ShopRole, string> = {
  OWNER:   "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

const ROLE_COLOURS: Record<ShopRole, string> = {
  OWNER:   "bg-[#EEEDFE] text-[#534AB7]",
  MANAGER: "bg-[#FAEEDA] text-[#BA7517]",
  CASHIER: "bg-[#E1F5EE] text-[#0D7A5F]",
};

export default function StaffPage() {
  const { shopId, userRole } = useShop();
  const isOwner = userRole === "OWNER";

  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<ShopRole>("CASHIER");
  const [inviting, setInviting]       = useState(false);

  // PIN reset
  const [pinTarget, setPinTarget]   = useState<StaffMember | null>(null);
  const [pinValue, setPinValue]     = useState("");
  const [settingPin, setSettingPin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<StaffMember[]>(`/api/shops/${shopId}/staff`);
      setStaff(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite() {
    if (!inviteEmail.trim()) { toast.error("Email is required."); return; }
    setInviting(true);
    try {
      await api.post(`/api/shops/${shopId}/staff/invite`, {
        email: inviteEmail.trim(),
        role:  inviteRole,
      });
      toast.success("Staff member added.");
      setInviteEmail(""); setShowInvite(false);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setInviting(false); }
  }

  async function handleRoleChange(memberId: string, newRole: ShopRole) {
    try {
      await api.patch(`/api/shops/${shopId}/staff/${memberId}/role`, { role: newRole });
      toast.success("Role updated.");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleRemove(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from this shop?`)) return;
    try {
      await api.delete(`/api/shops/${shopId}/staff/${memberId}`);
      toast.success("Staff member removed.");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleSetPin() {
    if (!pinValue || pinValue.length < 4 || pinValue.length > 6 || !/^\d+$/.test(pinValue)) {
      toast.error("PIN must be 4–6 digits."); return;
    }
    if (!pinTarget) return;
    setSettingPin(true);
    try {
      await api.post(`/api/shops/${shopId}/staff/${pinTarget.id}/pin`, { pin: pinValue });
      toast.success("PIN set successfully.");
      setPinTarget(null); setPinValue("");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setSettingPin(false); }
  }

  function getInitials(name: string) {
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Staff</h1>
        {isOwner && (
          <button
            onClick={() => setShowInvite(true)}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
          >
            + Add staff
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : staff.length === 0 ? (
        <EmptyState title="No staff yet" description="Add staff members to let them use the POS." />
      ) : (
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                {isOwner && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0">
                        {getInitials(member.name)}
                      </div>
                      <span className="font-medium text-[#0F2B4C]">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#5F5E5A]">{member.email}</td>
                  <td className="px-4 py-3">
                    {isOwner && member.role !== "OWNER" ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as ShopRole)}
                        className={`text-[12px] font-medium px-2 py-0.5 rounded border-0 cursor-pointer ${ROLE_COLOURS[member.role]}`}
                      >
                        <option value="MANAGER">Manager</option>
                        <option value="CASHIER">Cashier</option>
                      </select>
                    ) : (
                      <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${ROLE_COLOURS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {member.role !== "OWNER" && (
                          <>
                            <button
                              onClick={() => { setPinTarget(member); setPinValue(""); }}
                              className="text-[12px] text-[#534AB7] hover:underline"
                            >
                              Set PIN
                            </button>
                            <span className="text-[#D3D1C7]">·</span>
                            <button
                              onClick={() => handleRemove(member.id, member.name)}
                              className="text-[12px] text-[#A32D2D] hover:underline"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-4">Add staff member</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-[#5F5E5A] mb-1">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                  placeholder="staff@example.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#5F5E5A] mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as ShopRole)}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white"
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowInvite(false)} className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition">Cancel</button>
              <button onClick={handleInvite} disabled={inviting} className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50">
                {inviting && <Spinner size={14} />} Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set PIN modal */}
      {pinTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">Set POS PIN</h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">Setting PIN for <strong>{pinTarget.name}</strong></p>
            <div>
              <label className="block text-[12px] text-[#5F5E5A] mb-1">PIN (4–6 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] tracking-[0.3em]"
                placeholder="••••"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setPinTarget(null)} className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition">Cancel</button>
              <button onClick={handleSetPin} disabled={settingPin} className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50">
                {settingPin && <Spinner size={14} />} Save PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}