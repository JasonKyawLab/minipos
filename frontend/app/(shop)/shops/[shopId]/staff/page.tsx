// Path: app/(shop)/shops/[shopId]/staff/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { ShopRole } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

interface StaffMember {
  id:                 string;
  name:               string;
  email:              string;
  role:               ShopRole;
  has_pos_pin:        boolean;
  has_kitchen_pin:    boolean;
  pos_pin_locked:     boolean;
  kitchen_pin_locked: boolean;
}

type AddableRole = "MANAGER" | "CASHIER" | "CHEF";
type PinModalType = "POS" | "KITCHEN" | null;

const ROLE_LABELS: Record<ShopRole, string> = {
  OWNER:   "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  CHEF:    "Chef",
};

const ROLE_COLOURS: Record<ShopRole, string> = {
  OWNER:   "bg-[#EEEDFE] text-[#534AB7]",
  MANAGER: "bg-[#FAEEDA] text-[#BA7517]",
  CASHIER: "bg-[#E1F5EE] text-[#0D7A5F]",
  CHEF:    "bg-[#0F2B4C]/10 text-[#0F2B4C]",
};

const ROLE_DESCRIPTIONS: Record<AddableRole, string> = {
  MANAGER: "Full shop access. Can manage products, staff, reports, and use both POS and Kitchen modes.",
  CASHIER: "POS terminal access only. Can process sales and view orders.",
  CHEF:    "Kitchen Display access only. Can view and bump order tickets. Cannot access POS or the dashboard.",
};

function getAllowedRoleChanges(actorRole: ShopRole, targetCurrentRole: ShopRole): AddableRole[] {
  if (targetCurrentRole === "OWNER") return [];
  if (actorRole === "OWNER") {
    return (["MANAGER", "CASHIER", "CHEF"] as AddableRole[]).filter(r => r !== targetCurrentRole);
  }
  if (actorRole === "MANAGER") {
    if (targetCurrentRole === "MANAGER") return [];
    return (["CASHIER", "CHEF"] as AddableRole[]).filter(r => r !== targetCurrentRole);
  }
  return [];
}

function canHavePosPIN(role: ShopRole): boolean {
  return ["OWNER", "MANAGER", "CASHIER"].includes(role);
}

function canHaveKitchenPIN(role: ShopRole): boolean {
  return ["OWNER", "MANAGER", "CHEF"].includes(role);
}

export default function StaffPage() {
  const { shopId, userRole } = useShop();
  const canManage = ["OWNER", "MANAGER"].includes(userRole);

  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd]             = useState(false);
  const [addEmail, setAddEmail]           = useState("");
  const [addRole, setAddRole]             = useState<AddableRole>("CASHIER");
  const [adding, setAdding]               = useState(false);
  const [addEmailError, setAddEmailError] = useState("");

  const [pinTarget, setPinTarget]       = useState<StaffMember | null>(null);
  const [pinModalType, setPinModalType] = useState<PinModalType>(null);
  const [pinValue, setPinValue]         = useState("");
  const [pinConfirm, setPinConfirm]     = useState("");
  const [settingPin, setSettingPin]     = useState(false);

  const [roleTarget, setRoleTarget]     = useState<StaffMember | null>(null);
  const [newRole, setNewRole]           = useState<AddableRole>("CASHIER");
  const [changingRole, setChangingRole] = useState(false);

  const [removingId, setRemovingId]                     = useState<string | null>(null);
  const [forceLogoutId, setForceLogoutId]               = useState<string | null>(null);
  const [forceKitchenLogoutId, setForceKitchenLogoutId] = useState<string | null>(null);
  const [resetLockId, setResetLockId]                   = useState<string | null>(null);
  const [removePinId, setRemovePinId]                   = useState<string | null>(null);
  const [removeKitchenPinId, setRemoveKitchenPinId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<StaffMember[]>(`/api/shops/${shopId}/staff`);
      setStaff(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    setAddEmailError("");
    if (!addEmail.trim()) { setAddEmailError("Email is required."); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addEmail.trim())) { setAddEmailError("Enter a valid email address."); return; }

    setAdding(true);
    try {
      await api.post(`/api/shops/${shopId}/staff/invite`, {
        email: addEmail.trim().toLowerCase(),
        role:  addRole,
      });
      toast.success("Staff member added.");
      setAddEmail(""); setAddRole("CASHIER"); setShowAdd(false);
      load();
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code === "USER_ALREADY_ACTIVE") {
        toast.error("This user is already a member of this shop.");
      } else if (code === "USER_NOT_FOUND") {
        setAddEmailError("No MiniPOS account found with this email.");
      } else {
        toast.error(getErrorMessage(code));
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(member: StaffMember) {
    if (!confirm(`Remove ${member.name} from this shop? They will lose access immediately.`)) return;
    setRemovingId(member.id);
    try {
      await api.delete(`/api/shops/${shopId}/staff/${member.id}`);
      toast.success(`${member.name} removed.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRemovingId(null);
    }
  }

  function openPinModal(member: StaffMember, type: "POS" | "KITCHEN") {
    setPinTarget(member);
    setPinModalType(type);
    setPinValue("");
    setPinConfirm("");
  }

  async function handleSetPin() {
    if (!pinTarget || !pinModalType) return;
    if (!/^\d{4,6}$/.test(pinValue)) { toast.error("PIN must be 4–6 digits."); return; }
    if (pinValue !== pinConfirm) { toast.error("PINs do not match. Please re-enter."); return; }

    setSettingPin(true);
    try {
      const endpoint = pinModalType === "POS"
        ? `/api/shops/${shopId}/pos-auth/staff/${pinTarget.id}/pin`
        : `/api/shops/${shopId}/kitchen-auth/staff/${pinTarget.id}/pin`;

      await api.post(endpoint, { pin: pinValue });
      toast.success(`${pinModalType === "POS" ? "POS" : "Kitchen"} PIN set for ${pinTarget.name}.`);
      setPinTarget(null); setPinModalType(null); setPinValue(""); setPinConfirm("");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setSettingPin(false);
    }
  }

  async function handleRemovePosPIN(member: StaffMember) {
    if (!confirm(`Remove POS PIN for ${member.name}? They won't be able to log into POS mode.`)) return;
    setRemovePinId(member.id);
    try {
      await api.delete(`/api/shops/${shopId}/pos-auth/staff/${member.id}/pin`);
      toast.success(`POS PIN removed for ${member.name}.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRemovePinId(null);
    }
  }

  async function handleRemoveKitchenPIN(member: StaffMember) {
    if (!confirm(`Remove Kitchen PIN for ${member.name}? They won't be able to log into Kitchen mode.`)) return;
    setRemoveKitchenPinId(member.id);
    try {
      await api.delete(`/api/shops/${shopId}/kitchen-auth/staff/${member.id}/pin`);
      toast.success(`Kitchen PIN removed for ${member.name}.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRemoveKitchenPinId(null);
    }
  }

  async function handleForceLogout(member: StaffMember) {
    setForceLogoutId(member.id);
    try {
      await api.post(`/api/shops/${shopId}/pos-auth/force-logout/${member.id}`);
      toast.success(`${member.name} has been logged out of POS.`);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setForceLogoutId(null);
    }
  }

  async function handleForceKitchenLogout(member: StaffMember) {
    setForceKitchenLogoutId(member.id);
    try {
      await api.post(`/api/shops/${shopId}/kitchen-auth/force-logout/${member.id}`);
      toast.success(`${member.name} has been logged out of Kitchen mode.`);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setForceKitchenLogoutId(null);
    }
  }

  async function handleResetLock(member: StaffMember) {
    setResetLockId(member.id);
    try {
      await api.patch(`/api/shops/${shopId}/pos-auth/reset-lock/${member.id}`);
      toast.success(`${member.name}'s PIN lock cleared.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setResetLockId(null);
    }
  }

  function openRoleModal(member: StaffMember) {
    const allowed = getAllowedRoleChanges(userRole as ShopRole, member.role);
    if (allowed.length === 0) return;
    setRoleTarget(member);
    setNewRole(allowed[0]);
  }

  async function handleChangeRole() {
    if (!roleTarget) return;
    setChangingRole(true);
    try {
      await api.patch(`/api/shops/${shopId}/staff/${roleTarget.id}/role`, { role: newRole });
      toast.success(`${roleTarget.name}'s role changed to ${ROLE_LABELS[newRole]}.`);
      setRoleTarget(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setChangingRole(false);
    }
  }

  function getInitials(name: string) {
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div className="max-w-4xl animate-fade-in">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-medium text-[#0F2B4C]">Staff</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">
            {staff.length} member{staff.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowAdd(true); setAddEmail(""); setAddEmailError(""); }}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
          >
            + Add staff
          </button>
        )}
      </div>

      {/* ── PIN legend ── */}
      {canManage && (
        <div className="mb-4 bg-[#F1EFE8] border border-[#D3D1C7] rounded-lg px-4 py-3 text-[12px] text-[#5F5E5A]">
          <span className="font-medium text-[#0F2B4C]">PIN guide: </span>
          <span className="inline-flex items-center gap-1 mr-3">
            <span className="w-2 h-2 rounded-full bg-[#0D7A5F] inline-block" />
            POS PIN — Owners, Managers, Cashiers
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#534AB7] inline-block" />
            Kitchen PIN — Owners, Managers, Chefs
          </span>
        </div>
      )}

      {/* ── Staff table ── */}
      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add staff members so they can log in to POS or Kitchen mode with a PIN."
        />
      ) : (
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">POS PIN</th>
                <th className="text-left px-4 py-3 font-medium">Kitchen PIN</th>
                {canManage && (
                  <th className="text-left px-5 py-3 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const allowedRoles = getAllowedRoleChanges(userRole as ShopRole, member.role);
                const canChangeRole = canManage && allowedRoles.length > 0;

                return (
                  <tr
                    key={member.id}
                    className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/30"
                  >

                    {/* ── Name + avatar ── */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0">
                          {getInitials(member.name)}
                        </div>
                        <div>
                          <p className="font-medium text-[#0F2B4C] leading-tight">{member.name}</p>
                          <p className="text-[11px] text-[#5F5E5A]">{member.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* ── Role badge + change link ── */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${ROLE_COLOURS[member.role]}`}>
                          {ROLE_LABELS[member.role]}
                        </span>
                        {canChangeRole && (
                          <button
                            onClick={() => openRoleModal(member)}
                            className="text-[11px] text-[#534AB7] hover:underline whitespace-nowrap"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    </td>

                    {/* ── POS PIN status ── */}
                    <td className="px-4 py-3">
                      {canHavePosPIN(member.role) ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                            member.pos_pin_locked
                              ? "bg-[#FCEBEB] text-[#A32D2D]"
                              : member.has_pos_pin
                              ? "bg-[#E1F5EE] text-[#0D7A5F]"
                              : "bg-[#F1EFE8] text-[#5F5E5A]"
                          }`}>
                            {member.pos_pin_locked ? "Locked" : member.has_pos_pin ? "Set" : "Not set"}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => openPinModal(member, "POS")}
                              className="text-[11px] text-[#0D7A5F] hover:underline"
                            >
                              {member.has_pos_pin ? "Update" : "Set"}
                            </button>
                          )}
                          {canManage && member.has_pos_pin && (
                            <button
                              onClick={() => handleRemovePosPIN(member)}
                              disabled={removePinId === member.id}
                              className="text-[11px] text-[#A32D2D] hover:underline disabled:opacity-40"
                            >
                              {removePinId === member.id ? "…" : "Remove"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#D3D1C7]">N/A</span>
                      )}
                    </td>

                    {/* ── Kitchen PIN status ── */}
                    <td className="px-4 py-3">
                      {canHaveKitchenPIN(member.role) ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                            member.kitchen_pin_locked
                              ? "bg-[#FCEBEB] text-[#A32D2D]"
                              : member.has_kitchen_pin
                              ? "bg-[#EEEDFE] text-[#534AB7]"
                              : "bg-[#F1EFE8] text-[#5F5E5A]"
                          }`}>
                            {member.kitchen_pin_locked ? "Locked" : member.has_kitchen_pin ? "Set" : "Not set"}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => openPinModal(member, "KITCHEN")}
                              className="text-[11px] text-[#534AB7] hover:underline"
                            >
                              {member.has_kitchen_pin ? "Update" : "Set"}
                            </button>
                          )}
                          {canManage && member.has_kitchen_pin && (
                            <button
                              onClick={() => handleRemoveKitchenPIN(member)}
                              disabled={removeKitchenPinId === member.id}
                              className="text-[11px] text-[#A32D2D] hover:underline disabled:opacity-40"
                            >
                              {removeKitchenPinId === member.id ? "…" : "Remove"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#D3D1C7]">N/A</span>
                      )}
                    </td>

                    {/* ── Actions column — stacked vertically ── */}
                    {canManage && (
                      <td className="px-5 py-3">
                        {member.role !== "OWNER" ? (
                          <div className="flex flex-col items-end gap-1.5">

                            {canHavePosPIN(member.role) && (
                              <button
                                onClick={() => handleForceLogout(member)}
                                disabled={forceLogoutId === member.id}
                                className="text-[12px] text-[#BA7517] hover:underline disabled:opacity-40 whitespace-nowrap"
                              >
                                {forceLogoutId === member.id ? "…" : "Logout POS"}
                              </button>
                            )}

                            {canHaveKitchenPIN(member.role) && (
                              <button
                                onClick={() => handleForceKitchenLogout(member)}
                                disabled={forceKitchenLogoutId === member.id}
                                className="text-[12px] text-[#BA7517] hover:underline disabled:opacity-40 whitespace-nowrap"
                              >
                                {forceKitchenLogoutId === member.id ? "…" : "Logout Kitchen"}
                              </button>
                            )}

                            {(member.pos_pin_locked || member.kitchen_pin_locked) && (
                              <button
                                onClick={() => handleResetLock(member)}
                                disabled={resetLockId === member.id}
                                className="text-[12px] text-[#0D7A5F] hover:underline disabled:opacity-40 whitespace-nowrap"
                              >
                                {resetLockId === member.id ? "…" : "Unlock"}
                              </button>
                            )}

                            <button
                              onClick={() => handleRemove(member)}
                              disabled={removingId === member.id}
                              className="text-[12px] text-[#A32D2D] hover:underline disabled:opacity-40"
                            >
                              {removingId === member.id ? "…" : "Remove"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[12px] text-[#D3D1C7]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: Add staff
      ══════════════════════════════════════════════════ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">Add staff member</h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">
              The person must already have a MiniPOS account.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                  Email address <span className="text-[#A32D2D]">*</span>
                </label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => { setAddEmail(e.target.value); setAddEmailError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className={`w-full h-9 px-3 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] ${
                    addEmailError ? "border-[#A32D2D]" : "border-[#D3D1C7]"
                  }`}
                  placeholder="staff@example.com"
                  autoFocus
                />
                {addEmailError && (
                  <p className="text-[11px] text-[#A32D2D] mt-1">{addEmailError}</p>
                )}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">Role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as AddableRole)}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white"
                >
                  <option value="CASHIER">Cashier — POS terminal access</option>
                  <option value="CHEF">Chef — Kitchen display access</option>
                  {userRole === "OWNER" && (
                    <option value="MANAGER">Manager — Full shop access</option>
                  )}
                </select>
              </div>

              <div className="bg-[#F1EFE8] rounded-lg px-3 py-2.5 text-[12px] text-[#5F5E5A]">
                <span className="font-medium text-[#0F2B4C]">{ROLE_LABELS[addRole]} — </span>
                {ROLE_DESCRIPTIONS[addRole]}
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setShowAdd(false); setAddEmail(""); setAddEmailError(""); }}
                disabled={adding}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
              >
                {adding && <Spinner size={14} />}
                Add to shop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: Set PIN (POS or Kitchen)
      ══════════════════════════════════════════════════ */}
      {pinTarget && pinModalType && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">

            <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg ${
              pinModalType === "POS"
                ? "bg-[#E1F5EE] border border-[#0D7A5F]/20"
                : "bg-[#EEEDFE] border border-[#534AB7]/20"
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                pinModalType === "POS" ? "bg-[#0D7A5F]" : "bg-[#534AB7]"
              }`} />
              <p className={`text-[12px] font-medium ${
                pinModalType === "POS" ? "text-[#0D7A5F]" : "text-[#534AB7]"
              }`}>
                Setting {pinModalType === "POS" ? "POS" : "Kitchen"} PIN for{" "}
                <span className="font-bold">{pinTarget.name}</span>
              </p>
            </div>

            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">
              {pinTarget.has_pos_pin && pinModalType === "POS" ? "Update POS PIN" :
               pinTarget.has_kitchen_pin && pinModalType === "KITCHEN" ? "Update Kitchen PIN" :
               `Set ${pinModalType === "POS" ? "POS" : "Kitchen"} PIN`}
            </h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">
              {pinTarget.name} will use this PIN to log into{" "}
              {pinModalType === "POS" ? "POS Mode" : "Kitchen Mode"}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                  New PIN (4–6 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                  className="w-full h-10 px-3 text-[16px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] tracking-[0.5em] text-center"
                  placeholder="••••"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
                  className={`w-full h-10 px-3 text-[16px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] tracking-[0.5em] text-center ${
                    pinConfirm && pinValue !== pinConfirm
                      ? "border-[#A32D2D]"
                      : "border-[#D3D1C7]"
                  }`}
                  placeholder="••••"
                />
                {pinConfirm && pinValue !== pinConfirm && (
                  <p className="text-[11px] text-[#A32D2D] mt-1">PINs do not match.</p>
                )}
              </div>
              <p className="text-[11px] text-[#5F5E5A]">
                Use 4–6 digits. Avoid simple patterns like 1234 or 0000.
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setPinTarget(null); setPinModalType(null); setPinValue(""); setPinConfirm(""); }}
                disabled={settingPin}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetPin}
                disabled={settingPin || pinValue.length < 4 || pinValue !== pinConfirm}
                className={`flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition ${
                  pinModalType === "POS" ? "bg-[#0D7A5F]" : "bg-[#534AB7]"
                }`}
              >
                {settingPin && <Spinner size={14} />}
                Save PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: Change role
      ══════════════════════════════════════════════════ */}
      {roleTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">Change role</h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">
              Changing <span className="font-medium">{roleTarget.name}</span>'s role from{" "}
              <span className={`font-medium px-1.5 py-0.5 rounded text-[12px] ${ROLE_COLOURS[roleTarget.role]}`}>
                {ROLE_LABELS[roleTarget.role]}
              </span>
              .
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">New role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AddableRole)}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white"
                >
                  {getAllowedRoleChanges(userRole as ShopRole, roleTarget.role).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              <div className="bg-[#F1EFE8] rounded-lg px-3 py-2.5 text-[12px] text-[#5F5E5A]">
                {ROLE_DESCRIPTIONS[newRole]}
              </div>

              {(
                (roleTarget.role !== "CHEF" && newRole === "CHEF" && roleTarget.has_pos_pin) ||
                (roleTarget.role === "CHEF" && newRole !== "CHEF" && roleTarget.has_kitchen_pin)
              ) && (
                <div className="bg-[#FAEEDA] border border-[#BA7517]/30 rounded-lg px-3 py-2.5 text-[12px] text-[#BA7517]">
                  <span className="font-medium">Note: </span>
                  {roleTarget.role !== "CHEF" && newRole === "CHEF"
                    ? `${roleTarget.name}'s POS PIN will be cleared. Chefs cannot log into POS mode.`
                    : `${roleTarget.name}'s Kitchen PIN will be cleared. Cashiers cannot log into Kitchen mode.`
                  }
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setRoleTarget(null)}
                disabled={changingRole}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeRole}
                disabled={changingRole}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0F2B4C] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
              >
                {changingRole && <Spinner size={14} />}
                Change role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}