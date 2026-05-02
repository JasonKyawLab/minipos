"use client";
// =========================================================
// Permissions page — OWNER only.
// Shows all registered devices for this shop, lets the owner
// approve/revoke them, and rename them for clarity.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatDateTime } from "@/utils/formatDate";
import toast from "react-hot-toast";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

type DeviceStatus = "PENDING" | "APPROVED" | "REVOKED";

interface ShopDevice {
  id:               string;
  device_name:      string | null;
  device_key:       string;
  status:           DeviceStatus;
  current_mode:     string | null;
  last_seen_at:     string | null;
  created_at:       string;
  ip_address:       string | null;
}

const STATUS_STYLES: Record<DeviceStatus, string> = {
  PENDING:  "bg-[#FAEEDA] text-[#BA7517]",
  APPROVED: "bg-[#E1F5EE] text-[#0D7A5F]",
  REVOKED:  "bg-[#FCEBEB] text-[#A32D2D]",
};

export default function PermissionsPage() {
  const { shopId, userRole } = useShop();
  const router = useRouter();

  // Guard: only OWNER can access this page
  useEffect(() => {
    if (userRole !== "OWNER") {
      router.replace(`/shops/${shopId}/dashboard`);
    }
  }, [userRole, shopId, router]);

  const [devices, setDevices]   = useState<ShopDevice[]>([]);
  const [loading, setLoading]   = useState(true);

  // Rename modal
  const [renaming, setRenaming]       = useState<ShopDevice | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ShopDevice[]>(`/api/shops/${shopId}/devices`);
      setDevices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(device: ShopDevice) {
    try {
      await api.patch(`/api/shops/${shopId}/devices/${device.id}/approve`);
      toast.success(`${device.device_name ?? "Device"} approved.`);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleRevoke(device: ShopDevice) {
    if (!confirm(`Revoke access for "${device.device_name ?? device.id.slice(0, 8)}"? This will immediately block the device.`)) return;
    try {
      await api.patch(`/api/shops/${shopId}/devices/${device.id}/revoke`);
      toast.success("Device revoked.");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleDelete(device: ShopDevice) {
    if (!confirm("Permanently remove this device record? Only revoked devices can be deleted.")) return;
    try {
      await api.delete(`/api/shops/${shopId}/devices/${device.id}`);
      toast.success("Device removed.");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleRename() {
    if (!renaming || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}/devices/${renaming.id}/rename`, {
        device_name: renameValue.trim(),
      });
      toast.success("Device renamed.");
      setRenaming(null);
      setRenameValue("");
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setRenameSaving(false);
    }
  }

  if (userRole !== "OWNER") return null;

  // Separate by status for easier scanning
  const pending  = devices.filter(d => d.status === "PENDING");
  const approved = devices.filter(d => d.status === "APPROVED");
  const revoked  = devices.filter(d => d.status === "REVOKED");

  return (
    <div className="max-w-3xl animate-fade-in space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Device Permissions</h1>
        <p className="text-[13px] text-[#5F5E5A] mt-1">
          Manage which tablets and devices can access POS and Kitchen modes.
          A device must be approved before it can activate any mode.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-[#E1F5EE] border border-[#0D7A5F]/20 rounded-lg px-4 py-3">
        <p className="text-[13px] text-[#0D7A5F] font-medium mb-1">How device registration works</p>
        <p className="text-[13px] text-[#5F5E5A]">
          When a tablet opens the POS or Kitchen login page for the first time, it automatically
          registers itself as a PENDING device. Approve it here to grant access.
          Revoking a device immediately blocks it from activating any mode.
        </p>
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : devices.length === 0 ? (
        <EmptyState
          title="No devices registered"
          description="Open the POS login page on a tablet to register it. It will appear here as Pending."
        />
      ) : (
        <>
          {/* Pending — shown first, most attention needed */}
          {pending.length > 0 && (
            <Section
              title={`Pending Approval (${pending.length})`}
              titleColour="text-[#BA7517]"
              description="These devices are waiting for your approval."
            >
              <DeviceTable
                devices={pending}
                onApprove={handleApprove}
                onRevoke={handleRevoke}
                onDelete={handleDelete}
                onRename={(d) => { setRenaming(d); setRenameValue(d.device_name ?? ""); }}
              />
            </Section>
          )}

          {/* Approved */}
          {approved.length > 0 && (
            <Section title={`Approved Devices (${approved.length})`}>
              <DeviceTable
                devices={approved}
                onApprove={handleApprove}
                onRevoke={handleRevoke}
                onDelete={handleDelete}
                onRename={(d) => { setRenaming(d); setRenameValue(d.device_name ?? ""); }}
              />
            </Section>
          )}

          {/* Revoked */}
          {revoked.length > 0 && (
            <Section title={`Revoked Devices (${revoked.length})`} titleColour="text-[#A32D2D]">
              <DeviceTable
                devices={revoked}
                onApprove={handleApprove}
                onRevoke={handleRevoke}
                onDelete={handleDelete}
                onRename={(d) => { setRenaming(d); setRenameValue(d.device_name ?? ""); }}
              />
            </Section>
          )}
        </>
      )}

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">Rename device</h3>
            <p className="text-[12px] text-[#5F5E5A] mb-4">
              Give this device a friendly name so you can identify it in the list.
            </p>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] mb-4"
              placeholder="e.g. Counter iPad, Kitchen Display"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRenaming(null)}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={renameSaving || !renameValue.trim()}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50"
              >
                {renameSaving && <Spinner size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────

function Section({
  title,
  titleColour = "text-[#0F2B4C]",
  description,
  children,
}: {
  title: string;
  titleColour?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <h2 className={`text-[14px] font-medium ${titleColour}`}>{title}</h2>
        {description && (
          <p className="text-[12px] text-[#5F5E5A]">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Device table ──────────────────────────────────────────

function DeviceTable({
  devices,
  onApprove,
  onRevoke,
  onDelete,
  onRename,
}: {
  devices:   ShopDevice[];
  onApprove: (d: ShopDevice) => void;
  onRevoke:  (d: ShopDevice) => void;
  onDelete:  (d: ShopDevice) => void;
  onRename:  (d: ShopDevice) => void;
}) {
  return (
    <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
            <th className="text-left px-5 py-3 font-medium">Device</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Mode</th>
            <th className="text-left px-4 py-3 font-medium">Last seen</th>
            <th className="text-right px-5 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id} className="border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/30">
              <td className="px-5 py-3">
                <p className="font-medium text-[#0F2B4C]">
                  {device.device_name ?? (
                    <span className="text-[#5F5E5A] italic">Unnamed device</span>
                  )}
                </p>
                <p className="text-[11px] text-[#5F5E5A] font-mono">
                  {device.device_key.slice(0, 8)}…
                </p>
              </td>
              <td className="px-4 py-3">
                <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[device.status]}`}>
                  {device.status}
                </span>
              </td>
              <td className="px-4 py-3 text-[#5F5E5A]">
                {device.current_mode ?? "—"}
              </td>
              <td className="px-4 py-3 text-[#5F5E5A] text-[12px]">
                {device.last_seen_at ? formatDateTime(device.last_seen_at) : "Never"}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => onRename(device)}
                    className="text-[12px] text-[#5F5E5A] hover:text-[#0F2B4C] hover:underline"
                  >
                    Rename
                  </button>

                  {device.status === "PENDING" && (
                    <button
                      onClick={() => onApprove(device)}
                      className="text-[12px] text-[#0D7A5F] font-medium hover:underline"
                    >
                      Approve
                    </button>
                  )}

                  {device.status === "APPROVED" && (
                    <button
                      onClick={() => onRevoke(device)}
                      className="text-[12px] text-[#A32D2D] hover:underline"
                    >
                      Revoke
                    </button>
                  )}

                  {device.status === "REVOKED" && (
                    <>
                      <button
                        onClick={() => onApprove(device)}
                        className="text-[12px] text-[#0D7A5F] hover:underline"
                      >
                        Re-approve
                      </button>
                      <button
                        onClick={() => onDelete(device)}
                        className="text-[12px] text-[#A32D2D] hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}