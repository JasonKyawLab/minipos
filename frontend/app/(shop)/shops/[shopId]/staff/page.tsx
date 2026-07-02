"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { ShopRole } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { Table, TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";

// ── Types ──────────────────────────────────────────────────

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
type PinType     = "POS" | "KITCHEN";

interface PinModal {
  member:  StaffMember;
  type:    PinType;
  pin:     string;
  confirm: string;
}

// ── Constants ──────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────

function getAllowedRoleChanges(actorRole: ShopRole, targetRole: ShopRole): AddableRole[] {
  if (targetRole === "OWNER") return [];
  if (actorRole === "OWNER")   return (["MANAGER", "CASHIER", "CHEF"] as AddableRole[]).filter(r => r !== targetRole);
  if (actorRole === "MANAGER" && targetRole !== "MANAGER") return (["CASHIER", "CHEF"] as AddableRole[]).filter(r => r !== targetRole);
  return [];
}

function canHavePosPIN(role: ShopRole)     { return ["OWNER", "MANAGER", "CASHIER"].includes(role); }
function canHaveKitchenPIN(role: ShopRole) { return ["OWNER", "MANAGER", "CHEF"].includes(role); }

function getInitials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

// ── PinCell sub-component ──────────────────────────────────

function PinCell({
  type, hasPin, isLocked, canManage, onSet, onRemove,
}: {
  type:      PinType;
  hasPin:    boolean;
  isLocked:  boolean;
  canManage: boolean;
  onSet:     () => void;
  onRemove:  () => void;
}) {
  const isPOS = type === "POS";
  const statusCls = isLocked
    ? "bg-[#FCEBEB] text-[#A32D2D]"
    : hasPin
    ? isPOS ? "bg-[#E1F5EE] text-[#0D7A5F]" : "bg-[#EEEDFE] text-[#534AB7]"
    : "bg-[#F1EFE8] text-[#5F5E5A]";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${statusCls}`}>
        {isLocked ? "Locked" : hasPin ? "Set" : "Not set"}
      </span>
      {canManage && (
        <button
          onClick={onSet}
          className={`text-[11px] hover:underline ${isPOS ? "text-[#0D7A5F]" : "text-[#534AB7]"}`}
        >
          {hasPin ? "Update" : "Set"}
        </button>
      )}
      {canManage && hasPin && (
        <button onClick={onRemove} className="text-[11px] text-[#A32D2D] hover:underline">
          Remove
        </button>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────

export default function StaffPage() {
  const { shopId, userRole } = useShop();
  const canManage = ["OWNER", "MANAGER"].includes(userRole);

  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add modal state ────────────────────────────────────
  const [addModal, setAddModal] = useState({
    open: false, email: "", role: "CASHIER" as AddableRole, emailError: "",
  });
  const [adding, setAdding] = useState(false);

  // ── PIN modal state ────────────────────────────────────
  const [pinModal, setPinModal]   = useState<PinModal | null>(null);
  const [settingPin, setSettingPin] = useState(false);

  // ── Role change state ──────────────────────────────────
  const [roleTarget, setRoleTarget]     = useState<StaffMember | null>(null);
  const [newRole, setNewRole]           = useState<AddableRole>("CASHIER");
  const [changingRole, setChangingRole] = useState(false);

  // ── Simple confirm modal targets ───────────────────────
  const [removeTarget, setRemoveTarget]   = useState<StaffMember | null>(null);
  const [removing, setRemoving]           = useState(false);

  const [logoutTarget, setLogoutTarget] = useState<{ member: StaffMember; mode: PinType } | null>(null);
  const [loggingOut, setLoggingOut]     = useState(false);

  const [removePinTarget, setRemovePinTarget] = useState<{ member: StaffMember; type: PinType } | null>(null);
  const [removingPin, setRemovingPin]         = useState(false);

  const [resetLockId, setResetLockId] = useState<string | null>(null);

  // ── Data loading ───────────────────────────────────────

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

  // ── Handlers ───────────────────────────────────────────

  async function handleAdd() {
    setAddModal(m => ({ ...m, emailError: "" }));
    const email = addModal.email.trim();
    if (!email) { setAddModal(m => ({ ...m, emailError: "Email is required." })); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddModal(m => ({ ...m, emailError: "Enter a valid email address." }));
      return;
    }

    setAdding(true);
    try {
      await api.post(`/api/shops/${shopId}/staff/invite`, { email: email.toLowerCase(), role: addModal.role });
      toast.success("Staff member added.");
      setAddModal({ open: false, email: "", role: "CASHIER", emailError: "" });
      load();
    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code === "USER_ALREADY_ACTIVE") {
        toast.error("This user is already a member of this shop.");
      } else if (code === "USER_NOT_FOUND") {
        setAddModal(m => ({ ...m, emailError: "No MiniPOS account found with this email." }));
      } else {
        toast.error(getErrorMessage(code));
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleSetPin() {
    if (!pinModal) return;
    if (!/^\d{4,6}$/.test(pinModal.pin))        { toast.error("PIN must be 4–6 digits."); return; }
    if (pinModal.pin !== pinModal.confirm)        { toast.error("PINs do not match."); return; }

    setSettingPin(true);
    try {
      const endpoint = pinModal.type === "POS"
        ? `/api/shops/${shopId}/pos-auth/staff/${pinModal.member.id}/pin`
        : `/api/shops/${shopId}/kitchen-auth/staff/${pinModal.member.id}/pin`;
      await api.post(endpoint, { pin: pinModal.pin });
      toast.success(`${pinModal.type === "POS" ? "POS" : "Kitchen"} PIN set for ${pinModal.member.name}.`);
      setPinModal(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setSettingPin(false);
    }
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

  async function handleConfirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/api/shops/${shopId}/staff/${removeTarget.id}`);
      toast.success(`${removeTarget.name} removed.`);
      setRemoveTarget(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRemoving(false);
    }
  }

  async function handleConfirmLogout() {
    if (!logoutTarget) return;
    const { member, mode } = logoutTarget;
    setLoggingOut(true);
    try {
      const endpoint = mode === "POS"
        ? `/api/shops/${shopId}/pos-auth/force-logout/${member.id}`
        : `/api/shops/${shopId}/kitchen-auth/force-logout/${member.id}`;
      await api.post(endpoint);
      toast.success(`${member.name} has been logged out of ${mode === "POS" ? "POS" : "Kitchen"} mode.`);
      setLogoutTarget(null);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleConfirmRemovePin() {
    if (!removePinTarget) return;
    const { member, type } = removePinTarget;
    setRemovingPin(true);
    try {
      const endpoint = type === "POS"
        ? `/api/shops/${shopId}/pos-auth/staff/${member.id}/pin`
        : `/api/shops/${shopId}/kitchen-auth/staff/${member.id}/pin`;
      await api.delete(endpoint);
      toast.success(`${type === "POS" ? "POS" : "Kitchen"} PIN removed for ${member.name}.`);
      setRemovePinTarget(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRemovingPin(false);
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

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="max-w-4xl animate-fade-in">

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-medium text-[#0F2B4C]">Staff</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">
            {staff.length} member{staff.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setAddModal({ open: true, email: "", role: "CASHIER", emailError: "" })}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
          >
            + Add staff
          </button>
        )}
      </div>

      {/* PIN legend */}
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

      {/* Staff table */}
      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add staff members so they can log in to POS or Kitchen mode with a PIN."
        />
      ) : (
        <Table className="min-w-[680px]">
          <TableHead>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>POS PIN</Th>
            <Th>Kitchen PIN</Th>
            {canManage && <Th>Actions</Th>}
          </TableHead>
          <TableBody>
            {staff.map((member) => {
              const allowedRoles  = getAllowedRoleChanges(userRole as ShopRole, member.role);
              const canChangeRole = canManage && allowedRoles.length > 0;

              return (
                <Tr key={member.id}>
                  {/* Name + avatar */}
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0">
                        {getInitials(member.name)}
                      </div>
                      <div>
                        <p className="font-medium text-[#0F2B4C] leading-tight">{member.name}</p>
                        <p className="text-[11px] text-[#5F5E5A]">{member.email}</p>
                      </div>
                    </div>
                  </Td>

                  {/* Role badge */}
                  <Td>
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
                  </Td>

                  {/* POS PIN */}
                  <Td>
                    {canHavePosPIN(member.role) ? (
                      <PinCell
                        type="POS"
                        hasPin={member.has_pos_pin}
                        isLocked={member.pos_pin_locked}
                        canManage={canManage}
                        onSet={() => setPinModal({ member, type: "POS", pin: "", confirm: "" })}
                        onRemove={() => setRemovePinTarget({ member, type: "POS" })}
                      />
                    ) : (
                      <span className="text-[12px] text-[#D3D1C7]">N/A</span>
                    )}
                  </Td>

                  {/* Kitchen PIN */}
                  <Td>
                    {canHaveKitchenPIN(member.role) ? (
                      <PinCell
                        type="KITCHEN"
                        hasPin={member.has_kitchen_pin}
                        isLocked={member.kitchen_pin_locked}
                        canManage={canManage}
                        onSet={() => setPinModal({ member, type: "KITCHEN", pin: "", confirm: "" })}
                        onRemove={() => setRemovePinTarget({ member, type: "KITCHEN" })}
                      />
                    ) : (
                      <span className="text-[12px] text-[#D3D1C7]">N/A</span>
                    )}
                  </Td>

                  {/* Actions */}
                  {canManage && (
                    <Td>
                      {member.role !== "OWNER" ? (
                        <div className="flex flex-col items-end gap-1.5">
                          {canHavePosPIN(member.role) && (
                            <button
                              onClick={() => setLogoutTarget({ member, mode: "POS" })}
                              className="text-[12px] text-[#BA7517] hover:underline whitespace-nowrap"
                            >
                              Logout POS
                            </button>
                          )}
                          {canHaveKitchenPIN(member.role) && (
                            <button
                              onClick={() => setLogoutTarget({ member, mode: "KITCHEN" })}
                              className="text-[12px] text-[#BA7517] hover:underline whitespace-nowrap"
                            >
                              Logout Kitchen
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
                            onClick={() => setRemoveTarget(member)}
                            className="text-[12px] text-[#A32D2D] hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#D3D1C7]">—</span>
                      )}
                    </Td>
                  )}
                </Tr>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* ── Modal: Add staff ── */}
      <Modal
        open={addModal.open}
        onClose={() => setAddModal({ open: false, email: "", role: "CASHIER", emailError: "" })}
        title="Add staff member"
        size="sm"
      >
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
              value={addModal.email}
              onChange={(e) => setAddModal(m => ({ ...m, email: e.target.value, emailError: "" }))}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={`w-full h-9 px-3 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] ${
                addModal.emailError ? "border-[#A32D2D]" : "border-[#D3D1C7]"
              }`}
              placeholder="staff@example.com"
              autoFocus
            />
            {addModal.emailError && (
              <p className="text-[11px] text-[#A32D2D] mt-1">{addModal.emailError}</p>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">Role</label>
            <select
              value={addModal.role}
              onChange={(e) => setAddModal(m => ({ ...m, role: e.target.value as AddableRole }))}
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
            <span className="font-medium text-[#0F2B4C]">{ROLE_LABELS[addModal.role]} — </span>
            {ROLE_DESCRIPTIONS[addModal.role]}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={() => setAddModal({ open: false, email: "", role: "CASHIER", emailError: "" })}
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
      </Modal>

      {/* ── Modal: Set / update PIN ── */}
      <Modal
        open={!!pinModal}
        onClose={() => setPinModal(null)}
        title={
          pinModal
            ? (pinModal.type === "POS" ? (pinModal.member.has_pos_pin ? "Update POS PIN" : "Set POS PIN")
                                        : (pinModal.member.has_kitchen_pin ? "Update Kitchen PIN" : "Set Kitchen PIN"))
            : ""
        }
        size="sm"
      >
        {pinModal && (
          <>
            <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg ${
              pinModal.type === "POS"
                ? "bg-[#E1F5EE] border border-[#0D7A5F]/20"
                : "bg-[#EEEDFE] border border-[#534AB7]/20"
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pinModal.type === "POS" ? "bg-[#0D7A5F]" : "bg-[#534AB7]"}`} />
              <p className={`text-[12px] font-medium ${pinModal.type === "POS" ? "text-[#0D7A5F]" : "text-[#534AB7]"}`}>
                Setting {pinModal.type === "POS" ? "POS" : "Kitchen"} PIN for{" "}
                <span className="font-bold">{pinModal.member.name}</span>
              </p>
            </div>

            <p className="text-[13px] text-[#5F5E5A] mb-4">
              {pinModal.member.name} will use this PIN to log into{" "}
              {pinModal.type === "POS" ? "POS Mode" : "Kitchen Mode"}.
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
                  value={pinModal.pin}
                  onChange={(e) => setPinModal(p => p ? { ...p, pin: e.target.value.replace(/\D/g, "") } : p)}
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
                  value={pinModal.confirm}
                  onChange={(e) => setPinModal(p => p ? { ...p, confirm: e.target.value.replace(/\D/g, "") } : p)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
                  className={`w-full h-10 px-3 text-[16px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] tracking-[0.5em] text-center ${
                    pinModal.confirm && pinModal.pin !== pinModal.confirm
                      ? "border-[#A32D2D]"
                      : "border-[#D3D1C7]"
                  }`}
                  placeholder="••••"
                />
                {pinModal.confirm && pinModal.pin !== pinModal.confirm && (
                  <p className="text-[11px] text-[#A32D2D] mt-1">PINs do not match.</p>
                )}
              </div>
              <p className="text-[11px] text-[#5F5E5A]">
                Use 4–6 digits. Avoid simple patterns like 1234 or 0000.
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setPinModal(null)}
                disabled={settingPin}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetPin}
                disabled={settingPin || pinModal.pin.length < 4 || pinModal.pin !== pinModal.confirm}
                className={`flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition ${
                  pinModal.type === "POS" ? "bg-[#0D7A5F]" : "bg-[#534AB7]"
                }`}
              >
                {settingPin && <Spinner size={14} />}
                Save PIN
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Modal: Change role ── */}
      <Modal
        open={!!roleTarget}
        onClose={() => setRoleTarget(null)}
        title="Change role"
        size="sm"
      >
        {roleTarget && (
          <>
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

              {((roleTarget.role !== "CHEF" && newRole === "CHEF" && roleTarget.has_pos_pin) ||
                (roleTarget.role === "CHEF" && newRole !== "CHEF" && roleTarget.has_kitchen_pin)) && (
                <div className="bg-[#FAEEDA] border border-[#BA7517]/30 rounded-lg px-3 py-2.5 text-[12px] text-[#BA7517]">
                  <span className="font-medium">Note: </span>
                  {roleTarget.role !== "CHEF" && newRole === "CHEF"
                    ? `${roleTarget.name}'s POS PIN will be cleared. Chefs cannot log into POS mode.`
                    : `${roleTarget.name}'s Kitchen PIN will be cleared. Cashiers cannot log into Kitchen mode.`}
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
          </>
        )}
      </Modal>

      {/* ── Confirm: Force logout ── */}
      <ConfirmModal
        open={!!logoutTarget}
        onClose={() => setLogoutTarget(null)}
        onConfirm={handleConfirmLogout}
        title={`Log out of ${logoutTarget?.mode === "POS" ? "POS" : "Kitchen"} mode?`}
        message={`${logoutTarget?.member.name} will be signed out of ${logoutTarget?.mode === "POS" ? "POS" : "Kitchen"} mode immediately. Any unsaved order on their screen may be lost.`}
        confirmLabel="Log out"
        loading={loggingOut}
      />

      {/* ── Confirm: Remove staff ── */}
      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
        title="Remove from shop?"
        message={`${removeTarget?.name} will lose access to this shop immediately, including POS and Kitchen mode.`}
        confirmLabel="Remove"
        danger
        loading={removing}
      />

      {/* ── Confirm: Remove PIN ── */}
      <ConfirmModal
        open={!!removePinTarget}
        onClose={() => setRemovePinTarget(null)}
        onConfirm={handleConfirmRemovePin}
        title={`Remove ${removePinTarget?.type === "POS" ? "POS" : "Kitchen"} PIN?`}
        message={`${removePinTarget?.member.name} won't be able to log into ${removePinTarget?.type === "POS" ? "POS" : "Kitchen"} mode until a new PIN is set.`}
        confirmLabel="Remove PIN"
        danger
        loading={removingPin}
      />
    </div>
  );
}
