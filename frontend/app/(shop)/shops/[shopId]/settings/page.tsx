"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import type { ShopType, Currency } from "@/types";
import { Spinner } from "@/components/states";

// ── Network Tab ───────────────────────────────────────────────────────────────

type CheckStatus = "idle" | "running" | "done" | "error";

interface CheckResult {
  latency: number | null;
  downloadKbps: number | null;
  websocket: boolean | null;
}

function NetworkTab() {
  const [status,  setStatus]  = useState<CheckStatus>("idle");
  const [result,  setResult]  = useState<CheckResult>({ latency: null, downloadKbps: null, websocket: null });
  const abortRef = useRef<AbortController | null>(null);

  async function runChecks() {
    setStatus("running");
    setResult({ latency: null, downloadKbps: null, websocket: null });
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      // 1. Latency — average of 3 pings to /api/health
      const pings: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await fetch("/api/health", { signal, cache: "no-store" });
        pings.push(performance.now() - t0);
      }
      const latency = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);

      // 2. Download speed — not meaningful with a tiny health payload;
      // derive a rough estimate from average ping instead
      // (round-trip latency is a good proxy for connection quality)
      const downloadKbps = latency < 100 ? 800 : latency < 300 ? 300 : latency < 600 ? 80 : 15;

      // 3. WebSocket reachability — connect via Socket.IO polling endpoint
      const wsProto = location.protocol === "https:" ? "wss" : "ws";
      const wsUrl   = `${wsProto}://${location.host}/socket.io/?EIO=4&transport=websocket`;
      const websocket = await new Promise<boolean>((resolve) => {
        try {
          const ws = new WebSocket(wsUrl);
          const timer = setTimeout(() => { ws.close(); resolve(false); }, 5000);
          ws.onopen  = () => { clearTimeout(timer); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        } catch { resolve(false); }
      });

      setResult({ latency, downloadKbps, websocket });
      setStatus("done");
    } catch {
      if (!signal.aborted) setStatus("error");
    }
  }

  function getLatencyLabel(ms: number) {
    if (ms < 100) return { label: "Excellent", color: "text-[#0D7A5F]" };
    if (ms < 300) return { label: "Good",      color: "text-[#0D7A5F]" };
    if (ms < 600) return { label: "Moderate",  color: "text-amber-600" };
    return { label: "Slow", color: "text-red-600" };
  }

  function getSpeedLabel(kbps: number) {
    if (kbps > 500)  return { label: "Fast",     color: "text-[#0D7A5F]" };
    if (kbps > 100)  return { label: "Normal",   color: "text-[#0D7A5F]" };
    if (kbps > 20)   return { label: "Slow",     color: "text-amber-600" };
    return { label: "Very slow", color: "text-red-600" };
  }

  const overallOk =
    result.latency !== null &&
    result.latency < 600 &&
    result.websocket === true;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-medium text-[#0F2B4C]">Network Diagnostics</h2>
            <p className="text-[12px] text-[#5F5E5A] mt-0.5">Tests your device's connection to the MiniPOS server.</p>
          </div>
          <button
            onClick={runChecks}
            disabled={status === "running"}
            className="px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition flex items-center gap-2"
          >
            {status === "running" && <Spinner size={13} />}
            {status === "running" ? "Running…" : status === "done" ? "Run again" : "Run check"}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-3">
          <CheckRow
            label="Server latency (ping)"
            status={status}
            value={result.latency !== null ? `${result.latency} ms` : null}
            badge={result.latency !== null ? getLatencyLabel(result.latency) : null}
          />
          <CheckRow
            label="Connection quality"
            status={status}
            value={result.downloadKbps !== null ? getSpeedLabel(result.downloadKbps).label : null}
            badge={result.downloadKbps !== null ? getSpeedLabel(result.downloadKbps) : null}
            hideValue
          />
          <CheckRow
            label="WebSocket connection"
            status={status}
            value={result.websocket !== null ? (result.websocket ? "Connected" : "Failed") : null}
            badge={result.websocket !== null
              ? (result.websocket
                  ? { label: "OK",     color: "text-[#0D7A5F]" }
                  : { label: "Failed", color: "text-red-600" })
              : null}
          />
        </div>

        {/* Summary */}
        {status === "done" && (
          <div className={`mt-4 px-4 py-3 rounded-lg text-[13px] font-medium ${
            overallOk
              ? "bg-[#E1F5EE] text-[#0D7A5F]"
              : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}>
            {overallOk
              ? "✓ Connection looks good. POS and kitchen display should work normally."
              : "⚠ Connection issues detected. Real-time features like kitchen display may be affected."}
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 px-4 py-3 rounded-lg text-[13px] bg-red-50 border border-red-200 text-red-700">
            Could not reach the server. Check your internet connection and try again.
          </div>
        )}
      </div>
    </div>
  );
}

function CheckRow({
  label, status, value, badge, hideValue,
}: {
  label: string;
  status: CheckStatus;
  value: string | null;
  badge: { label: string; color: string } | null;
  hideValue?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#F1EFE8] last:border-0">
      <span className="text-[13px] text-[#5F5E5A]">{label}</span>
      <div className="flex items-center gap-2">
        {status === "running" && value === null ? (
          <span className="text-[12px] text-[#9CA3AF]">Checking…</span>
        ) : value !== null ? (
          <>
            {!hideValue && <span className="text-[13px] font-medium text-[#0F2B4C]">{value}</span>}
            {badge && <span className={`text-[13px] font-semibold ${badge.color}`}>{badge.label}</span>}
          </>
        ) : (
          <span className="text-[12px] text-[#9CA3AF]">—</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] text-[#5F5E5A] mb-1">{label}</label>
      {children}
    </div>
  );
}
import { SkeletonText } from "@/components/ui/Skeleton";
import { ConfirmModal } from "@/components/ui/Modal";

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
  const { shopId, shopName, shopType, currency, userRole } = useShop();
  const isOwner = userRole === "OWNER";
  const router = useRouter();

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

  // Tracks the shop type as last saved, so we know when the
  // dropdown represents a real change worth confirming.
  const [initialShopType, setInitialShopType] = useState<ShopType>(shopType as ShopType);

  const [confirmShopTypeChange, setConfirmShopTypeChange] = useState(false);

  // ── Delete modal state ─────────────────────────────────────
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
      setInitialShopType(data.shop_type ?? shopType);
    } catch {
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

    if (form.shop_type !== initialShopType) {
      setConfirmShopTypeChange(true);
      return;
    }

    await doSave();
  }

  async function doSave() {
    const shopTypeChanged = form.shop_type !== initialShopType;
    setSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}`, {
        name:     form.name.trim(),
        currency: form.currency,
        shopType: form.shop_type,
        taxRate:  Number(form.tax_rate),
        timezone: form.timezone,
      });

      // pin_max_attempts has its own validated endpoint — not part
      // of the generic shop update.
      await api.patch(`/api/shops/${shopId}/pos-auth/settings`, {
        pin_max_attempts: Number(form.pin_max_attempts),
      });

      toast.success("Settings saved.");
      if (shopTypeChanged) setInitialShopType(form.shop_type);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete shop ────────────────────────────────────────────
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
      setDeleting(false);
    }
  }

  function openDeleteModal() {
    setDeleteConfirm("");
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setDeleteConfirm("");
  }

  const confirmationMatches = deleteConfirm === shopName;
  const [activeTab, setActiveTab] = useState<"general" | "network">("general");

  const inputCls = "w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="max-w-xl animate-fade-in">
      <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-4">Shop Settings</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 border-b border-[#D3D1C7]">
        {(["general", "network"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-medium capitalize border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? "border-[#0D7A5F] text-[#0D7A5F]"
                : "border-transparent text-[#5F5E5A] hover:text-[#0F2B4C]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "network" && <NetworkTab />}

      {activeTab === "general" && loading ? (
        <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
          <SkeletonText lines={6} />
        </div>
      ) : activeTab === "general" && (
        <form onSubmit={handleSave} className="space-y-4">

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

      {activeTab === "general" && isOwner && !loading && (
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

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md animate-fade-in">

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

            <div className="bg-[#F1EFE8] rounded-lg px-4 py-3 mb-4">
              <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide mb-0.5">
                Shop to delete
              </p>
              <p className="text-[14px] font-semibold text-[#0F2B4C]">{shopName}</p>
            </div>

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
                {deleting && <Spinner size={14} />}
                Delete shop
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmShopTypeChange}
        onClose={() => setConfirmShopTypeChange(false)}
        onConfirm={() => { setConfirmShopTypeChange(false); doSave(); }}
        title="Change shop type"
        message={`Change shop type from ${initialShopType} to ${form.shop_type}? Existing tables and kitchen stations won't be deleted, but they'll disappear from the dashboard until you switch back to ${initialShopType}.`}
        confirmLabel="Change type"
      />
    </div>
  );
}