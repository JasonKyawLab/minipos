"use client";
// =========================================================
// app/(shop)/shops/[shopId]/permission/page.tsx
//
// CHANGE: Device key is now fully visible via an expandable
// details panel that opens inline under each table row.
//
// WHY not show the full key in the table cell:
//   A device_key is a UUID (36 chars). Showing it inline
//   in the Device column would either overflow the cell or
//   force the table to be very wide. Both are bad on a
//   dashboard that needs to fit other columns comfortably.
//
// WHY an inline expand instead of a modal:
//   The owner often needs to compare the device key shown
//   on the pending screen against the key in this table.
//   An inline panel keeps both the row context (name,
//   status) and the full key visible at the same time.
//   A modal hides the row and makes comparison harder.
//
// What the expanded panel shows:
//   - Full device_key with a one-click copy button
//   - IP address (where the device registered from)
//   - Registered date (when it first appeared)
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
  id:           string;
  device_name:  string | null;
  device_key:   string;
  status:       DeviceStatus;
  current_mode: string | null;
  last_seen_at: string | null;
  created_at:   string;
  ip_address:   string | null;
}

const STATUS_STYLES: Record<DeviceStatus, string> = {
  PENDING:  "bg-[#FAEEDA] text-[#BA7517]",
  APPROVED: "bg-[#E1F5EE] text-[#0D7A5F]",
  REVOKED:  "bg-[#FCEBEB] text-[#A32D2D]",
};

export default function PermissionsPage() {
  const { shopId, userRole } = useShop();
  const router = useRouter();

  useEffect(() => {
    if (userRole !== "OWNER") {
      router.replace(`/shops/${shopId}/dashboard`);
    }
  }, [userRole, shopId, router]);

  const [devices, setDevices]   = useState<ShopDevice[]>([]);
  const [loading, setLoading]   = useState(true);

  const [renaming, setRenaming]         = useState<ShopDevice | null>(null);
  const [renameValue, setRenameValue]   = useState("");
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
  const message =
    device.status === "PENDING"
      ? `Remove the device "${device.device_name ?? device.id.slice(0, 8)}"? It hasn't been approved, so this has no effect on access.`
      : `Permanently remove this device record? Only revoked or pending devices can be deleted.`;
  if (!confirm(message)) return;
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

  const pending  = devices.filter(d => d.status === "PENDING");
  const approved = devices.filter(d => d.status === "APPROVED");
  const revoked  = devices.filter(d => d.status === "REVOKED");

  return (
    <div className="max-w-3xl animate-fade-in space-y-6">

      <div>
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Device Permissions</h1>
        <p className="text-[13px] text-[#5F5E5A] mt-1">
          Manage which tablets and devices can access POS and Kitchen modes.
          A device must be approved before it can activate any mode.
        </p>
      </div>

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
  title:        string;
  titleColour?: string;
  description?: string;
  children:     React.ReactNode;
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
  // Track which row is expanded. Clicking the same row again collapses it.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

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
          {devices.map((device) => {
            const isExpanded = expandedId === device.id;

            return (
              <React.Fragment key={device.id}>
                {/* ── Main row ─────────────────────────────── */}
                <tr className={`border-b border-[#F1EFE8] last:border-0 ${isExpanded ? "bg-[#F1EFE8]/50" : "hover:bg-[#F1EFE8]/30"}`}>

                  {/* Device name + truncated key + expand toggle */}
                  <td className="px-5 py-3">
                    <p className="font-medium text-[#0F2B4C]">
                      {device.device_name ?? (
                        <span className="text-[#5F5E5A] italic">Unnamed device</span>
                      )}
                    </p>
                    {/* Truncated key with Details toggle on the same line */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[11px] text-[#5F5E5A] font-mono">
                        {device.device_key.slice(0, 8)}…
                      </p>
                      <button
                        onClick={() => toggleExpand(device.id)}
                        className="text-[10px] text-[#0D7A5F] hover:underline leading-none"
                      >
                        {isExpanded ? "hide" : "details"}
                      </button>
                    </div>
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
  <>
    <button
      onClick={() => onApprove(device)}
      className="text-[12px] text-[#0D7A5F] font-medium hover:underline"
    >
      Approve
    </button>
    <button
      onClick={() => onDelete(device)}
      className="text-[12px] text-[#A32D2D] hover:underline"
    >
      Delete
    </button>
  </>
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

                {/* ── Expanded detail panel ─────────────────── */}
                {isExpanded && (
                  <tr className="border-b border-[#F1EFE8] last:border-0">
                    {/* colspan=5 so the panel spans the full table width */}
                    <td colSpan={5} className="px-5 py-4 bg-[#F8F7F3]">
                      <div className="space-y-3">

                        {/* Full device key + copy */}
                        <div>
                          <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wider mb-1">
                            Device Key
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-[12px] text-[#0F2B4C] font-mono break-all leading-relaxed flex-1">
                              {device.device_key}
                            </p>
                            <CopyButton value={device.device_key} />
                          </div>
                        </div>

                        {/* IP address + registered date on one row */}
                        <div className="flex gap-8">
                          <div>
                            <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wider mb-0.5">
                              IP Address
                            </p>
                            <p className="text-[12px] text-[#0F2B4C] font-mono">
                              {device.ip_address ?? "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wider mb-0.5">
                              Registered
                            </p>
                            <p className="text-[12px] text-[#0F2B4C]">
                              {formatDateTime(device.created_at)}
                            </p>
                          </div>
                        </div>

                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────
// Self-contained: manages its own "copied" feedback state.

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS) — silently fail
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
        copied
          ? "bg-[#E1F5EE] text-[#0D7A5F] border-[#0D7A5F]/30"
          : "bg-white text-[#5F5E5A] border-[#D3D1C7] hover:bg-[#F1EFE8] hover:text-[#0F2B4C]"
      }`}
      title="Copy device key"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 7.5H1.5A.5.5 0 011 7V1.5A.5.5 0 011.5 1H7a.5.5 0 01.5.5V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}