"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { RestaurantTable } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";
import { ConfirmModal } from "@/components/ui/Modal";

export default function TablesPage() {
  const { shopId, shopType, userRole } = useShop();
  const canWrite = ["OWNER", "MANAGER"].includes(userRole);

  const [tables, setTables]   = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd]   = useState(false);
  const [tableNo, setTableNo]   = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving]     = useState(false);

  const [editTarget, setEditTarget]       = useState<RestaurantTable | null>(null);
  const [editTableNo, setEditTableNo]     = useState("");
  const [editCapacity, setEditCapacity]   = useState("");
  const [editSaving, setEditSaving]       = useState(false);

  const [qrPreview, setQrPreview] = useState<RestaurantTable | null>(null);

  const [rotateTarget, setRotateTarget]     = useState<RestaurantTable | null>(null);
  const [rotateSaving, setRotateSaving]     = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tableNumber: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RestaurantTable[]>(`/api/shops/${shopId}/tables`);
      setTables(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!tableNo.trim()) { toast.error("Table number is required."); return; }
    setSaving(true);
    try {
      await api.post(`/api/shops/${shopId}/tables`, {
        table_number: tableNo.trim(),
        capacity: capacity ? Number(capacity) : undefined,
      });
      toast.success("Table added.");
      setTableNo(""); setCapacity(""); setShowAdd(false);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setSaving(false); }
  }

  function openEdit(table: RestaurantTable) {
    setEditTarget(table);
    setEditTableNo(table.table_number);
    setEditCapacity(table.capacity != null ? String(table.capacity) : "");
  }

  function closeEdit() {
    setEditTarget(null);
    setEditTableNo("");
    setEditCapacity("");
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editTableNo.trim()) { toast.error("Table number is required."); return; }

    const payload: Record<string, unknown> = {};
    if (editTableNo.trim() !== editTarget.table_number) {
      payload.table_number = editTableNo.trim();
    }
    const newCap = editCapacity ? Number(editCapacity) : null;
    if (newCap !== (editTarget.capacity ?? null)) {
      payload.capacity = newCap ?? undefined;
    }

    if (Object.keys(payload).length === 0) {
      toast("No changes to save.");
      closeEdit();
      return;
    }

    setEditSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}/tables/${editTarget.id}`, payload);
      toast.success("Table updated.");
      closeEdit();
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setEditSaving(false); }
  }

  async function handleToggleActive(table: RestaurantTable) {
    try {
      await api.patch(`/api/shops/${shopId}/tables/${table.id}`, {
        is_active: !table.is_active,
      });
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/shops/${shopId}/tables/${deleteTarget.id}`);
      toast.success("Table deleted.");
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleRotateQr() {
    if (!rotateTarget) return;
    setRotateSaving(true);
    try {
      await api.post(`/api/shops/${shopId}/tables/${rotateTarget.id}/rotate-qr`);
      toast.success("QR code rotated. Old QR links are now invalid.");
      setRotateTarget(null);
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setRotateSaving(false); }
  }

  function getQrUrl(token: string) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/qr/${token}`;
  }

  function handlePrintQr(table: RestaurantTable) {
    const url = getQrUrl(table.qr_token);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Table ${table.table_number} QR</title>
      <style>body{font-family:system-ui;text-align:center;padding:40px}h2{margin-bottom:8px}p{color:#666;font-size:13px;margin-bottom:20px}img{width:200px;height:200px}</style>
      </head><body>
      <h2>Table ${table.table_number}</h2>
      <p>Scan to view menu & place order</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" />
      <p style="margin-top:16px;font-size:11px;color:#999">${url}</p>
      </body></html>`);
    win.document.close();
    win.print();
  }

  if (shopType !== "RESTAURANT") {
    return (
      <div className="max-w-xl animate-fade-in">
        <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-3">Tables</h1>
        <div className="bg-[#FAEEDA] border border-[#BA7517] rounded-lg p-5">
          <p className="text-[14px] text-[#BA7517] font-medium mb-1">Restaurant shops only</p>
          <p className="text-[13px] text-[#BA7517]">
            Table management is only available for shops configured as Restaurant type.
            Update your shop type in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl animate-fade-in">

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Tables</h1>
        {canWrite && (
          <button
            onClick={() => setShowAdd(true)}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
          >
            + Add table
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : tables.length === 0 ? (
        <EmptyState
          title="No tables yet"
          description="Add tables so customers can scan QR codes and order."
        />
      ) : (
        <Table className="min-w-[640px]">
          <TableHead>
            <Th>Table</Th>
            <Th>Capacity</Th>
            <Th>Status</Th>
            <Th align="right">Actions</Th>
          </TableHead>
          <TableBody>
            {tables.map((t) => (
              <Tr key={t.id}>

                <Td className="font-medium text-[#0F2B4C]">Table {t.table_number}</Td>
                <Td className="text-[#5F5E5A]">{t.capacity != null ? t.capacity : "—"}</Td>
                <Td>
                  <span className={`text-[12px] font-medium px-2 py-0.5 rounded ${
                    t.is_active ? "bg-[#E1F5EE] text-[#0D7A5F]" : "bg-[#F1EFE8] text-[#5F5E5A]"
                  }`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </Td>

                <Td align="right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setQrPreview(t)}
                      className="text-[12px] text-[#534AB7] hover:underline"
                    >
                      View QR
                    </button>
                    <button
                      onClick={() => handlePrintQr(t)}
                      className="text-[12px] text-[#5F5E5A] hover:underline"
                    >
                      Print
                    </button>
                    {canWrite && (
                      <>
                        <button
                          onClick={() => openEdit(t)}
                          className="text-[12px] text-[#0F2B4C] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(t)}
                          className="text-[12px] text-[#BA7517] hover:underline"
                        >
                          {t.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => setRotateTarget(t)}
                          className="text-[12px] text-[#534AB7] hover:underline"
                        >
                          Rotate QR
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: t.id, tableNumber: t.table_number })}
                          className="text-[12px] text-[#A32D2D] hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </Td>

              </Tr>
            ))}
          </TableBody>
        </Table>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-4">Add table</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-[#5F5E5A] mb-1">Table number *</label>
                <input
                  value={tableNo}
                  onChange={(e) => setTableNo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                  placeholder="e.g. A1, 12, VIP"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#5F5E5A] mb-1">Capacity (optional)</label>
                <input
                  type="number" min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                  placeholder="4"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50"
              >
                {saving && <Spinner size={14} />} Add table
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">
              Edit table
            </h3>
            <p className="text-[12px] text-[#5F5E5A] mb-4">
              Currently: Table {editTarget.table_number}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-[#5F5E5A] mb-1">Table number *</label>
                <input
                  value={editTableNo}
                  onChange={(e) => setEditTableNo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                  placeholder="e.g. A1, 12, VIP"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#5F5E5A] mb-1">Capacity (optional)</label>
                <input
                  type="number" min="1"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                  className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                  placeholder="e.g. 4"
                />
                {editCapacity === "" && editTarget.capacity != null && (
                  <p className="text-[11px] text-[#5F5E5A] mt-1">
                    Leave empty to clear capacity.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={closeEdit}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={editSaving}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50"
              >
                {editSaving && <Spinner size={14} />} Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {rotateTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-sm shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-2">Rotate QR code?</h3>
            <p className="text-[13px] text-[#5F5E5A] mb-1">
              Table <span className="font-medium text-[#0F2B4C]">{rotateTarget.table_number}</span>
            </p>
            <p className="text-[13px] text-[#A32D2D] mb-5">
              This will invalidate the current QR code. Any printed copies will stop working. Print a new QR after rotating.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRotateTarget(null)}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRotateQr}
                disabled={rotateSaving}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#A32D2D] rounded-lg disabled:opacity-50"
              >
                {rotateSaving && <Spinner size={14} />} Rotate QR
              </button>
            </div>
          </div>
        </div>
      )}

      {qrPreview && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setQrPreview(null)}
        >
          <div
            className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-xs shadow-md animate-fade-in text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-1">Table {qrPreview.table_number}</h3>
            <p className="text-[12px] text-[#5F5E5A] mb-4">Scan to open the menu</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getQrUrl(qrPreview.qr_token))}`}
              alt={`QR code for table ${qrPreview.table_number}`}
              className="w-48 h-48 mx-auto mb-3"
            />
            <p className="text-[10px] text-[#5F5E5A] break-all mb-4">{getQrUrl(qrPreview.qr_token)}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setQrPreview(null)}
                className="flex-1 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
              >
                Close
              </button>
              <button
                onClick={() => handlePrintQr(qrPreview)}
                className="flex-1 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete table"
        message={`Delete table ${deleteTarget?.tableNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

    </div>
  );
}