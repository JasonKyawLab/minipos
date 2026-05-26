"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { ShopType, Currency } from "@/types";
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

// The exact string the user must type to confirm deletion.
// Using shop name (not the word "DELETE") because:
//   1. It forces the user to consciously read and retype the name
//   2. Makes accidental deletion nearly impossible
//   3. Consistent with the admin panel delete pattern already in the codebase
const CONFIRM_STRING_HELPER = "the shop name shown above";

export default function SettingsPage() {
  const { shopId, shopName, shopType, currency, userRole } = useShop();
  const isOwner = userRole === "OWNER";
  const router = useRouter();

  // ── Form state initialised from ShopContext ────────────────
  // ShopContext already has name, shopType, currency from the layout.
  // We load the full shop record (tax_rate, timezone, pin_max_attempts)
  // from the API separately — those fields are not in the context.
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [form, setForm] = useState({
    name:             shopName,
    shop_type:        shopType as ShopType,
    currency:         currency as Currency,
    tax_rate:         "0",
    timezone:         "Asia/Bangkok",
    pin_max_attempts: "5",
  });

  // ── Delete modal state ─────────────────────────────────────
  // The confirmation string is the shop NAME (not the word "DELETE").
  // We use shopName from context — always available, never null.
  const [showDeleteModal,  setShowDeleteModal]  = useState(false);
  const [deleteConfirm,    setDeleteConfirm]    = useState("");
  const [deleting,         setDeleting]         = useState(false);

  // ── Load full shop record for extra fields ─────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/shops/${shopId}`);
      setForm({
        name:             data.name             ?? shopName,
        shop_type:        data.shop_type        ?? shopType,
        currency:         data.currency         ?? currency,
        tax_rate:         String(data.tax_rate  ?? 0),
        timezone:         data.timezone         ?? "Asia/Bangkok",
        pin_max_attempts: String(data.pin_max_attempts ?? 5),
      });
    } catch {
      // GET /api/shops/:shopId may not exist yet — fall back to context values.
      // The form is still functional with context data; only tax_rate,
      // timezone, and pin_max_attempts will show defaults.
      setForm(prev => ({
        ...prev,
        name:      shopName,
        shop_type: shopType as ShopType,
        currency:  currency as Currency,
      }));
    } finally {
      setLoading(false);
    }
  }, [shopId, shopName, shopType, currency]);

  useEffect(() => { load(); }, [load]);

  // ── Save settings ──────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Shop name is required."); return; }
    setSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}`, {
        name:             form.name.trim(),
        currency:         form.currency,
        tax_rate:         Number(form.tax_rate),
        timezone:         form.timezone,
        pin_max_attempts: Number(form.pin_max_attempts),
      });
      toast.success("Settings saved.");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete shop ────────────────────────────────────────────
  // Confirmation string = shop name (same pattern as admin panel).
  // We use shopName from context so this works even if the API fetch failed.
  async function handleDeleteShop() {
    if (deleteConfirm !== shopName) {
      toast.error("Shop name doesn't match. Please type it exactly as shown.");
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/api/shops/${shopId}`);
      toast.success("Shop deleted.");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
      setDeleting(false);  // Only reset on error; on success we navigate away
    }
  }

  function openDeleteModal() {
    setDeleteConfirm("");   // Always clear on open so old input never carries over
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setDeleteConfirm("");
  }

  // Whether the typed value exactly matches the shop name
  const confirmationMatches = deleteConfirm === shopName;

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div>
        <label className="block text-[12px] text-[#5F5E5A] mb-1">{label}</label>
        {children}
      </div>
    );
  }

  const inputCls = "w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="max-w-xl animate-fade-in">
      <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-5">Shop Settings</h1>

      {loading ? (
        <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
          <SkeletonText lines={6} />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">

          {/* ── General settings ── */}
          <div className="bg-white border border-[#D3D1C7] rounded-lg p-5 space-y-4">
            <h2 className="text-[15px] font-medium text-[#0F2B4C]">General</h2>

            <Field label="Shop name">
              <input
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                disabled={!isOwner}
                className={inputCls}
                placeholder="My Shop"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Shop type">
                <select
                  value={form.shop_type}
                  onChange={(e) => setForm(p => ({ ...p, shop_type: e.target.value as ShopType }))}
                  disabled={!isOwner}
                  className={inputCls}
                >
                  {SHOP_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Currency">
                <select
                  value={form.currency}
                  onChange={(e) => setForm(p => ({ ...p, currency: e.target.value as Currency }))}
                  disabled={!isOwner}
                  className={inputCls}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tax rate (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.tax_rate}
                  onChange={(e) => setForm(p => ({ ...p, tax_rate: e.target.value }))}
                  disabled={!isOwner}
                  className={inputCls}
                />
              </Field>

              <Field label="Timezone">
                <select
                  value={form.timezone}
                  onChange={(e) => setForm(p => ({ ...p, timezone: e.target.value }))}
                  disabled={!isOwner}
                  className={inputCls}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* ── POS settings ── */}
          <div className="bg-white border border-[#D3D1C7] rounded-lg p-5 space-y-4">
            <h2 className="text-[15px] font-medium text-[#0F2B4C]">POS Settings</h2>
            <Field label="Max PIN attempts before lockout">
              <select
                value={form.pin_max_attempts}
                onChange={(e) => setForm(p => ({ ...p, pin_max_attempts: e.target.value }))}
                disabled={!isOwner}
                className={inputCls}
              >
                {[3, 5, 10].map(n => (
                  <option key={n} value={n}>{n} attempts</option>
                ))}
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

      {/* ── Danger zone — owner only ── */}
      {isOwner && !loading && (
        <div className="mt-6 bg-[#FCEBEB] border border-[#A32D2D] rounded-lg p-5">
          <h2 className="text-[15px] font-medium text-[#A32D2D] mb-1">Danger Zone</h2>
          <p className="text-[13px] text-[#A32D2D] mb-3">
            Deleting this shop will soft-delete all data. This cannot be undone.
          </p>
          <button
            onClick={openDeleteModal}
            className="px-4 h-9 text-[13px] font-medium text-[#A32D2D] bg-[#FCEBEB] border border-[#A32D2D] rounded-lg hover:bg-[#A32D2D] hover:text-white transition"
          >
            Delete shop
          </button>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md animate-fade-in">

            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#FCEBEB] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 6v4M9 12h.01M3 15.5h12a1 1 0 00.87-1.5l-6-10.5a1 1 0 00-1.74 0L2.13 14a1 1 0 00.87 1.5z"
                    stroke="#A32D2D"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-medium text-[#0F2B4C] leading-tight">
                  Delete shop
                </h3>
                <p className="text-[13px] text-[#5F5E5A] mt-0.5">
                  This will soft-delete the shop. All data is preserved for audit purposes.
                </p>
              </div>
            </div>

            {/* Shop name preview */}
            <div className="bg-[#F1EFE8] rounded-lg px-4 py-3 mb-4">
              <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide mb-0.5">
                Shop to delete
              </p>
              <p className="text-[14px] font-semibold text-[#0F2B4C]">{shopName}</p>
            </div>

            {/* Instruction */}
            <div className="mb-5">
              <p className="text-[13px] text-[#5F5E5A] mb-2">
                To confirm, type{" "}
                <span className="font-semibold text-[#A32D2D] font-mono select-all">
                  {shopName}
                </span>{" "}
                exactly in the box below:
              </p>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmationMatches && handleDeleteShop()}
                className={`w-full h-9 px-3 text-[13px] border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  deleteConfirm.length > 0 && !confirmationMatches
                    ? "border-[#A32D2D] focus:ring-[#A32D2D]/30"
                    : confirmationMatches
                    ? "border-[#0D7A5F] focus:ring-[#0D7A5F]/30"
                    : "border-[#D3D1C7] focus:ring-[#0D7A5F]/30"
                }`}
                placeholder={shopName}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {/* Inline feedback */}
              {deleteConfirm.length > 0 && !confirmationMatches && (
                <p className="text-[11px] text-[#A32D2D] mt-1">
                  Doesn't match — type the shop name exactly as shown above.
                </p>
              )}
              {confirmationMatches && (
                <p className="text-[11px] text-[#0D7A5F] mt-1">
                  ✓ Confirmed — you may now delete this shop.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteShop}
                disabled={deleting || !confirmationMatches}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#A32D2D] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
              >
                {deleting && (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                Delete shop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}