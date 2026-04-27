"use client";
// =========================================================
// app/(shop)/shops/[shopId]/settings/page.tsx
// Owner can edit shop name, type, currency, tax, etc.
// Also shows POS device list and danger zone.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { Shop, ShopType, Currency } from "@/types";
import { Spinner } from "@/components/states";
import { SkeletonText } from "@/components/ui/Skeleton";

const SHOP_TYPES: { value: ShopType; label: string }[] = [
  { value: "RETAIL",      label: "Retail" },
  { value: "RESTAURANT",  label: "Restaurant" },
  { value: "ONLINE_SHOP", label: "Online Shop" },
];

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "THB", label: "THB — Thai Baht" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "MMK", label: "MMK — Myanmar Kyat" },
  { value: "EUR", label: "EUR — Euro" },
];

const TIMEZONES = [
  "Asia/Bangkok", "Asia/Singapore", "Asia/Yangon",
  "America/New_York", "Europe/London", "UTC",
];

export default function SettingsPage() {
  const { shopId, userRole } = useShop();
  const isOwner = userRole === "OWNER";
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [form, setForm] = useState({
    name: "", shop_type: "RETAIL" as ShopType,
    currency: "THB" as Currency, tax_rate: "0",
    timezone: "Asia/Bangkok", pin_max_attempts: "5",
  });

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Shop>(`/api/shops/${shopId}`);
      setShop(data);
      setForm({
        name: data.name,
        shop_type: data.shop_type,
        currency: data.currency,
        tax_rate: String(data.tax_rate),
        timezone: data.timezone,
        pin_max_attempts: String(data.pin_max_attempts),
      });
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Shop name is required."); return; }
    setSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}`, {
        name: form.name.trim(),
        shop_type: form.shop_type,
        currency: form.currency,
        tax_rate: Number(form.tax_rate),
        timezone: form.timezone,
        pin_max_attempts: Number(form.pin_max_attempts),
      });
      toast.success("Settings saved.");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setSaving(false); }
  }

  async function handleDeleteShop() {
    if (deleteConfirm !== shop?.name) { toast.error("Shop name doesn't match."); return; }
    setDeleting(true);
    try {
      await api.delete(`/api/shops/${shopId}`);
      toast.success("Shop deleted.");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
      setDeleting(false);
    }
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div>
        <label className="block text-[12px] text-[#5F5E5A] mb-1">{label}</label>
        {children}
      </div>
    );
  }

  const inputCls = "w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white";

  return (
    <div className="max-w-xl animate-fade-in">
      <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-5">Shop Settings</h1>

      {loading ? (
        <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
          <SkeletonText lines={6} />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-white border border-[#D3D1C7] rounded-lg p-5 space-y-4">
            <h2 className="text-[15px] font-medium text-[#0F2B4C]">General</h2>

            <Field label="Shop name">
              <input
                value={form.name}
                onChange={(e) => setForm(p => ({...p, name: e.target.value}))}
                disabled={!isOwner}
                className={inputCls}
                placeholder="My Shop"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Shop type">
                <select
                  value={form.shop_type}
                  onChange={(e) => setForm(p => ({...p, shop_type: e.target.value as ShopType}))}
                  disabled={!isOwner}
                  className={inputCls}
                >
                  {SHOP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>

              <Field label="Currency">
                <select
                  value={form.currency}
                  onChange={(e) => setForm(p => ({...p, currency: e.target.value as Currency}))}
                  disabled={!isOwner}
                  className={inputCls}
                >
                  {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tax rate (%)">
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={form.tax_rate}
                  onChange={(e) => setForm(p => ({...p, tax_rate: e.target.value}))}
                  disabled={!isOwner}
                  className={inputCls}
                />
              </Field>

              <Field label="Timezone">
                <select
                  value={form.timezone}
                  onChange={(e) => setForm(p => ({...p, timezone: e.target.value}))}
                  disabled={!isOwner}
                  className={inputCls}
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="bg-white border border-[#D3D1C7] rounded-lg p-5 space-y-4">
            <h2 className="text-[15px] font-medium text-[#0F2B4C]">POS Settings</h2>
            <Field label="Max PIN attempts before lockout">
              <select
                value={form.pin_max_attempts}
                onChange={(e) => setForm(p => ({...p, pin_max_attempts: e.target.value}))}
                disabled={!isOwner}
                className={inputCls}
              >
                {[3,5,10].map(n => <option key={n} value={n}>{n} attempts</option>)}
              </select>
            </Field>
          </div>

          {isOwner && (
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
            >
              {saving && <Spinner size={14} />}
              Save settings
            </button>
          )}
        </form>
      )}

      {/* Danger zone — owner only */}
      {isOwner && !loading && (
        <div className="mt-6 bg-[#FCEBEB] border border-[#A32D2D] rounded-lg p-5">
          <h2 className="text-[15px] font-medium text-[#A32D2D] mb-1">Danger Zone</h2>
          <p className="text-[13px] text-[#A32D2D] mb-3">
            Deleting this shop will remove all data permanently. This cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 h-9 text-[13px] font-medium text-[#A32D2D] bg-[#FCEBEB] border border-[#A32D2D] rounded-lg hover:bg-[#A32D2D] hover:text-white transition"
          >
            Delete shop
          </button>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md animate-fade-in">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-2">Delete shop</h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">
              Type <strong>{shop?.name}</strong> to confirm deletion.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[#A32D2D]"
              placeholder={shop?.name}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition">Cancel</button>
              <button
                onClick={handleDeleteShop}
                disabled={deleting || deleteConfirm !== shop?.name}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#A32D2D] rounded-lg disabled:opacity-50"
              >
                {deleting && <Spinner size={14} />}
                Delete shop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}