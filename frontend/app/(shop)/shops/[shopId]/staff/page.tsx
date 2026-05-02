"use client";

// =========================================================
// app/(shop)/shops/[shopId]/staff/page.tsx
// =========================================================
// CHANGES:
//   - Added CHEF to role badge colours and labels
//   - Add staff modal now shows CHEF as a selectable role
//   - CHEF role description explains kitchen-only access
//   - Force logout added for CHEF (same as CASHIER)
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { StaffMember, ShopRole } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

// ── Role display config ───────────────────────────────────

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
  CHEF:    "bg-[#0F2B4C]/10 text-[#0F2B4C]",  // navy tint — kitchen theme
};

// ── Role descriptions shown in the add staff modal ───────
const ROLE_DESCRIPTIONS: Record<"MANAGER" | "CASHIER" | "CHEF", string> = {
  MANAGER: "Can do everything a Cashier can, plus manage products, staff, and view reports.",
  CASHIER: "Can view orders, process sales, and use the POS terminal.",
  CHEF:    "Kitchen display access only. Can view and update order tickets in Kitchen Mode. Cannot access POS or management pages.",
};

type AddableRole = "MANAGER" | "CASHIER" | "CHEF";

export default function StaffPage() {
  const { shopId, userRole } = useShop();
  const canManage = ["OWNER", "MANAGER"].includes(userRole);

  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add staff modal ───────────────────────────────────────
  const [showAdd, setShowAdd]               = useState(false);
  const [addEmail, setAddEmail]             = useState("");
  const [addRole, setAddRole]               = useState<AddableRole>("CASHIER");
  const [adding, setAdding]                 = useState(false);
  const [addEmailError, setAddEmailError]   = useState("");

  // ── Set PIN modal ─────────────────────────────────────────
  const [pinTarget, setPinTarget]   = useState<StaffMember | null>(null);
  const [pinValue, setPinValue]     = useState("");
  const [settingPin, setSettingPin] = useState(false);

  // ── Force logout ──────────────────────────────────────────
  const [forceLogoutTarget, setForceLogoutTarget] = useState<StaffMember | null>(null);
  const [forcingLogout, setForcingLogout]         = useState(false);

  // ── Reset lock ────────────────────────────────────────────
  const [resetLockTarget, setResetLockTarget] = useState<StaffMember | null>(null);
  const [resettingLock, setResettingLock]     = useState(false);

  // ─────────────────────────────────────────────────────────
  // Load staff list
  // ─────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  // Add staff by email
  // POST /api/shops/:shopId/staff/invite
  // ─────────────────────────────────────────────────────────
  async function handleAdd() {
    setAddEmailError("");

    if (!addEmail.trim()) {
      setAddEmailError("Email is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addEmail.trim())) {
      setAddEmailError("Enter a valid email address.");
      return;
    }

    setAdding(true);
    try {
      await api.post(`/api/shops/${shopId}/staff/invite`, {
        email: addEmail.trim().toLowerCase(),
        role:  addRole,
      });
      toast.success("Staff member added.");
      setAddEmail("");
      setAddRole("CASHIER");
      setShowAdd(false);
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

  // ─────────────────────────────────────────────────────────
  // Remove staff
  // ─────────────────────────────────────────────────────────
  async function handleRemove(member: StaffMember) {
    if (!confirm(`Remove ${member.name} from this shop? They will lose access immediately.`)) return;
    try {
      await api.delete(`/api/shops/${shopId}/staff/${member.id}`);
      toast.success(`${member.name} removed.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  // ─────────────────────────────────────────────────────────
  // Set POS PIN (for CASHIER / MANAGER own PIN)
  // POST /api/shops/:shopId/pos-auth/pin
  // ─────────────────────────────────────────────────────────
  async function handleSetPin() {
    if (!pinValue || !/^\d{4,6}$/.test(pinValue)) {
      toast.error("PIN must be 4–6 digits.");
      return;
    }
    setSettingPin(true);
    try {
      await api.post(`/api/shops/${shopId}/pos-auth/pin`, { pin: pinValue });
      toast.success("PIN set successfully.");
      setPinTarget(null);
      setPinValue("");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setSettingPin(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Force logout from POS
  // POST /api/shops/:shopId/pos-auth/force-logout/:userId
  // ─────────────────────────────────────────────────────────
  async function handleForceLogout(member: StaffMember) {
    setForceLogoutTarget(member);
    setForcingLogout(true);
    try {
      await api.post(`/api/shops/${shopId}/pos-auth/force-logout/${member.id}`);
      toast.success(`${member.name} has been logged out.`);
      setForceLogoutTarget(null);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setForcingLogout(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Reset PIN lock
  // PATCH /api/shops/:shopId/pos-auth/reset-lock/:userId
  // ─────────────────────────────────────────────────────────
  async function handleResetLock(member: StaffMember) {
    setResetLockTarget(member);
    setResettingLock(true);
    try {
      await api.patch(`/api/shops/${shopId}/pos-auth/reset-lock/${member.id}`);
      toast.success(`${member.name}'s PIN lock cleared.`);
      setResetLockTarget(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setResettingLock(false);
    }
  }

  function getInitials(name: string) {
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  }

  // CHEF cannot set a POS pin (kitchen pin is set separately)
  const canSetPosPin = (role: ShopRole) =>
    ["MANAGER", "CASHIER"].includes(role);

  return (
    <div className="max-w-3xl animate-fade-in">

      {/* ── Page header ──────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-medium text-[#0F2B4C]">Staff</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">
            {staff.length} member{staff.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setShowAdd(true);
              setAddEmail("");
              setAddEmailError("");
            }}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
          >
            + Add staff
          </button>
        )}
      </div>

      {/* ── Staff table ───────────────────────────────────── */}
      {loading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add staff members so they can log in to the POS or Kitchen with a PIN."
        />
      ) : (
        <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                {canManage && (
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40"
                >
                  {/* Name + avatar */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0">
                        {getInitials(member.name)}
                      </div>
                      <span className="font-medium text-[#0F2B4C]">{member.name}</span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-4 py-3 text-[#5F5E5A] text-[12px]">
                    {member.email}
                  </td>

                  {/* Role badge */}
                  <td className="px-4 py-3">
                    <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${ROLE_COLOURS[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  </td>

                  {/* Actions */}
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      {member.role !== "OWNER" ? (
                        <div className="flex items-center justify-end gap-3">
                          {/* Set PIN — only for POS-eligible roles */}
                          {canSetPosPin(member.role) && (
                            <>
                              <button
                                onClick={() => {
                                  setPinTarget(member);
                                  setPinValue("");
                                }}
                                className="text-[12px] text-[#534AB7] hover:underline"
                              >
                                Set PIN
                              </button>
                              <span className="text-[#D3D1C7] select-none">·</span>
                            </>
                          )}

                          {/* Force logout */}
                          <button
                            onClick={() => handleForceLogout(member)}
                            disabled={forcingLogout && forceLogoutTarget?.id === member.id}
                            className="text-[12px] text-[#BA7517] hover:underline disabled:opacity-40"
                          >
                            {forcingLogout && forceLogoutTarget?.id === member.id
                              ? "Logging out…"
                              : "Force logout"
                            }
                          </button>

                          <span className="text-[#D3D1C7] select-none">·</span>

                          {/* Remove */}
                          <button
                            onClick={() => handleRemove(member)}
                            className="text-[12px] text-[#A32D2D] hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#D3D1C7]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reset lock panel ──────────────────────────────── */}
      {canManage && staff.some(m => m.role !== "OWNER") && (
        <div className="mt-4 bg-[#F1EFE8] border border-[#D3D1C7] rounded-lg px-4 py-3">
          <p className="text-[12px] text-[#5F5E5A] mb-2">
            <span className="font-medium text-[#0F2B4C]">PIN lockout?</span>{" "}
            Reset a staff member's PIN lock:
          </p>
          <div className="flex flex-wrap gap-2">
            {staff
              .filter(m => m.role !== "OWNER")
              .map(member => (
                <button
                  key={member.id}
                  onClick={() => handleResetLock(member)}
                  disabled={resettingLock && resetLockTarget?.id === member.id}
                  className="h-7 px-3 text-[11px] font-medium text-[#5F5E5A] border border-[#D3D1C7] rounded-md hover:bg-white hover:border-[#0D7A5F] hover:text-[#0D7A5F] transition disabled:opacity-40"
                >
                  {resettingLock && resetLockTarget?.id === member.id
                    ? "Resetting…"
                    : `Reset ${member.name.split(" ")[0]}`
                  }
                </button>
              ))
            }
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL: Add staff by email
      ══════════════════════════════════════════════════════ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">
              Add staff member
            </h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">
              Enter the staff member's MiniPOS account email. They must already
              have an account registered.
            </p>

            <div className="space-y-3">
              {/* Email input */}
              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                  Email address <span className="text-[#A32D2D]">*</span>
                </label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => {
                    setAddEmail(e.target.value);
                    setAddEmailError("");
                  }}
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

              {/* Role selector */}
              <div>
                <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                  Role
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as AddableRole)}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white"
                >
                  <option value="CASHIER">Cashier — POS terminal access</option>
                  <option value="CHEF">Chef — Kitchen display access</option>
                  <option value="MANAGER">Manager — Full shop access</option>
                </select>
              </div>

              {/* Role description */}
              <div className="bg-[#F1EFE8] rounded-lg px-3 py-2.5 text-[12px] text-[#5F5E5A]">
                <span className="font-medium text-[#0F2B4C]">
                  {ROLE_LABELS[addRole]}
                </span>{" — "}
                {ROLE_DESCRIPTIONS[addRole]}
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setAddEmail("");
                  setAddEmailError("");
                }}
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

      {/* ══════════════════════════════════════════════════════
          MODAL: Set POS PIN
      ══════════════════════════════════════════════════════ */}
      {pinTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">
              Set POS PIN
            </h3>

            <div className="bg-[#FAEEDA] border border-[#BA7517]/30 rounded-lg px-3 py-2.5 mb-4">
              <p className="text-[12px] text-[#BA7517] font-medium mb-0.5">
                You are setting your own PIN
              </p>
              <p className="text-[12px] text-[#BA7517]">
                This sets the PIN for your own account. Each staff member must
                log in themselves to set their own PIN.
              </p>
            </div>

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
                onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
                className="w-full h-10 px-3 text-[16px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] tracking-[0.5em] text-center"
                placeholder="••••"
                autoFocus
              />
              <p className="text-[11px] text-[#5F5E5A] mt-1.5">
                Use 4–6 digits. Avoid simple patterns like 1234 or 0000.
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setPinTarget(null); setPinValue(""); }}
                disabled={settingPin}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetPin}
                disabled={settingPin || pinValue.length < 4}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
              >
                {settingPin && <Spinner size={14} />}
                Save PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}