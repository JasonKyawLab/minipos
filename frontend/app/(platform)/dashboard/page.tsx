"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { UserShop, ShopType, Currency } from "@/types";
import { getErrorMessage } from "@/utils/errorMessages";
import { PageSkeleton, EmptyState } from "@/components/states";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PlanLimitModal } from "@/components/ui/PlanLimitModal";
import { ShopTypeBadge } from "@/components/ui/Badge";
import { formatCurrency } from "@/utils/formatCurrency";
import toast from "react-hot-toast";

interface PlanUsage {
  plan: string;
  shops: { used: number; max: number };
  limits: { max_shops: number } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [shops,       setShops]       = useState<UserShop[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [usage,       setUsage]       = useState<PlanUsage | null>(null);

  async function loadShops() {
    try {
      const [shopsRes, usageRes] = await Promise.all([
        api.get<UserShop[]>("/api/users/me/shops"),
        api.get<PlanUsage>("/api/plan/usage"),
      ]);
      setShops(shopsRes.data);
      setUsage(usageRes.data);
    } catch {
      toast.error("Failed to load shops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadShops(); }, []);

  function handleAddShop() {
    if (usage && usage.shops.used >= usage.shops.max) {
      setShowUpgrade(true);
    } else {
      setShowCreate(true);
    }
  }

  const atLimit = usage ? usage.shops.used >= usage.shops.max : false;

  if (loading) return <PageSkeleton />;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-brand-navy">My Shops</h1>
          <p className="text-[13px] text-ui-grey mt-0.5">
            {shops.length} {shops.length === 1 ? "shop" : "shops"}
            {usage && (
              <span className="ml-2 text-[12px] text-ui-grey opacity-70">
                · {usage.shops.used}/{usage.shops.max} used ({usage.plan})
              </span>
            )}
          </p>
        </div>
        <Button onClick={handleAddShop} icon={<PlusIcon />}>
          New Shop
        </Button>
      </div>

      {/* At/over limit banner */}
      {usage && usage.shops.used >= usage.shops.max && (
        <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <span className="text-amber-600 text-[18px]">⚠️</span>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-amber-800">
              You've reached your shop limit ({usage.shops.used}/{usage.shops.max} shops on the {usage.plan} plan).
            </p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              Your existing shops continue working normally.
            </p>
          </div>
          <button
            onClick={() => setShowUpgrade(true)}
            className="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition shrink-0"
          >
            View Plan
          </button>
        </div>
      )}

      {/* Shop grid */}
      {shops.length === 0 ? (
        <EmptyState
          title="No shops yet"
          description="Create your first shop to start managing orders and products."
          action={
            <Button onClick={handleAddShop} icon={<PlusIcon />}>
              Create your first shop
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.map((shop) => (
            <ShopCard
              key={shop.shopId}
              shop={shop}
              onClick={() => router.push(`/shops/${shop.shopId}/dashboard`)}
            />
          ))}

          {/* Add new shop card — greyed out when at limit */}
          <button
            onClick={handleAddShop}
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors group ${
              atLimit
                ? "border-ui-greyBorder text-ui-grey opacity-50 cursor-not-allowed"
                : "border-ui-greyBorder text-ui-grey hover:border-brand-teal hover:text-brand-teal"
            }`}
          >
            <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center">
              {atLimit ? <LockIcon /> : <PlusIcon />}
            </div>
            <span className="text-[13px] font-medium">
              {atLimit ? `Limit reached (${usage?.shops.used}/${usage?.shops.max})` : "Add new shop"}
            </span>
          </button>
        </div>
      )}

      {/* Create shop modal */}
      <CreateShopModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); loadShops(); }}
        onLimitReached={() => { setShowCreate(false); setShowUpgrade(true); }}
        existingShops={shops}
      />

      <PlanLimitModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        limitType="shop"
        used={usage?.shops.used ?? 0}
        max={usage?.shops.max ?? 3}
      />
    </div>
  );
}

// ── Shop card ─────────────────────────────────────────────

function ShopCard({ shop, onClick }: { shop: UserShop; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-ui-greyBorder rounded-lg p-5 text-left hover:border-brand-teal hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-brand-navy group-hover:text-brand-teal transition-colors truncate">
          {shop.shopName}
        </h3>
        <ShopTypeBadge type={shop.shopType} />
      </div>
      <p className="text-[12px] text-ui-grey">
        {formatCurrency(0, shop.currency)} · {shop.role}
      </p>
    </button>
  );
}

// UpgradeModal replaced by shared PlanLimitModal component

// ── Create shop modal ─────────────────────────────────────

function CreateShopModal({
  open, onClose, onCreated, onLimitReached, existingShops,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onLimitReached: () => void;
  existingShops: UserShop[];
}) {
  const [name,     setName]     = useState("");
  const [shopType, setShopType] = useState<ShopType>("RETAIL");
  const [currency, setCurrency] = useState<Currency>("THB");
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<Record<string, string>>({});
  const [nameDupe, setNameDupe] = useState(false);
  const dupeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleNameChange(val: string) {
    setName(val);
    if (dupeTimer.current) clearTimeout(dupeTimer.current);
    dupeTimer.current = setTimeout(() => {
      const trimmed = val.trim().toLowerCase();
      setNameDupe(trimmed.length > 0 && existingShops.some(s => s.shopName.toLowerCase() === trimmed));
    }, 400);
  }

  function resetForm() {
    setName(""); setShopType("RETAIL"); setCurrency("THB"); setErrors({}); setNameDupe(false);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Shop name is required.";
    if (name.trim().length > 120) e.name = "Name must be 120 characters or less.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      await api.post("/api/shops", { name: name.trim(), shopType, currency });
      toast.success("Shop created successfully!");
      resetForm();
      onCreated();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (code === "PLAN_SHOP_LIMIT_REACHED") {
        onLimitReached();
      } else {
        toast.error(getErrorMessage(code));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create New Shop">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[13px] font-medium text-ui-nearBlack">
            Shop name <span className="text-status-red">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Morning Café"
            maxLength={120}
            className={`w-full h-9 px-3 border rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-teal ${
              errors.name ? "border-status-red" : nameDupe ? "border-amber-400" : "border-ui-greyBorder"
            }`}
          />
          {errors.name && <p className="text-[12px] text-status-red">{errors.name}</p>}
          {nameDupe && !errors.name && (
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-[12px] text-amber-800">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>You already have a shop with this name. You can still create it.</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-medium text-ui-nearBlack">
            Shop type <span className="text-status-red">*</span>
          </label>
          <select
            value={shopType}
            onChange={(e) => setShopType(e.target.value as ShopType)}
            className="w-full h-9 px-3 border border-ui-greyBorder rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
          >
            <option value="RETAIL">Retail</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="ONLINE_SHOP">Online Shop</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-medium text-ui-nearBlack">
            Currency <span className="text-status-red">*</span>
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="w-full h-9 px-3 border border-ui-greyBorder rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
          >
            <option value="THB">THB — Thai Baht (฿)</option>
            <option value="USD">USD — US Dollar ($)</option>
            <option value="SGD">SGD — Singapore Dollar (S$)</option>
            <option value="MMK">MMK — Myanmar Kyat (K)</option>
            <option value="EUR">EUR — Euro (€)</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create shop
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
