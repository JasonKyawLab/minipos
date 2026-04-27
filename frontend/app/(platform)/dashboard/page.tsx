"use client";
// =========================================================
// app/(platform)/dashboard/page.tsx
// =========================================================

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { UserShop, ShopType, Currency } from "@/types";
import { getErrorMessage } from "@/utils/errorMessages";
import { PageSkeleton, EmptyState } from "@/components/states";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ShopTypeBadge } from "@/components/ui/Badge";
import { formatCurrency } from "@/utils/formatCurrency";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const router = useRouter();
  const [shops, setShops]       = useState<UserShop[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function loadShops() {
    try {
      const { data } = await api.get<UserShop[]>("/api/users/me/shops");
      setShops(data);
    } catch {
      toast.error("Failed to load shops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadShops(); }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-brand-navy">My Shops</h1>
          <p className="text-[13px] text-ui-grey mt-0.5">
            {shops.length} {shops.length === 1 ? "shop" : "shops"}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} icon={<PlusIcon />}>
          New Shop
        </Button>
      </div>

      {/* Shop grid */}
      {shops.length === 0 ? (
        <EmptyState
          title="No shops yet"
          description="Create your first shop to start managing orders and products."
          action={
            <Button onClick={() => setShowCreate(true)} icon={<PlusIcon />}>
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

          {/* Add new shop card */}
          <button
            onClick={() => setShowCreate(true)}
            className="border-2 border-dashed border-ui-greyBorder rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-ui-grey hover:border-brand-teal hover:text-brand-teal transition-colors group"
          >
            <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center">
              <PlusIcon />
            </div>
            <span className="text-[13px] font-medium">Add new shop</span>
          </button>
        </div>
      )}

      {/* Create shop modal */}
      <CreateShopModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); loadShops(); }}
      />
    </div>
  );
}

// ── Shop card ─────────────────────────────────────────────

function ShopCard({ shop, onClick }: { shop: UserShop; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg border border-ui-greyBorder p-5 text-left hover:border-brand-teal hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-brand-navy flex items-center justify-center">
          <span className="text-white text-[15px] font-semibold">
            {shop.shopName.charAt(0).toUpperCase()}
          </span>
        </div>
        <ShopTypeBadge type={shop.shopType} />
      </div>

      <p className="text-[15px] font-semibold text-brand-navy group-hover:text-brand-teal transition-colors truncate">
        {shop.shopName}
      </p>
      <p className="text-[12px] text-ui-grey mt-1">{shop.currency} · {shop.role}</p>

      <div className="mt-4 pt-3 border-t border-ui-greyBorder flex items-center justify-between">
        <span className="text-[12px] text-ui-grey">Open shop →</span>
      </div>
    </button>
  );
}

// ── Create shop modal ─────────────────────────────────────

function CreateShopModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName]         = useState("");
  const [shopType, setShopType] = useState<ShopType>("RETAIL");
  const [currency, setCurrency] = useState<Currency>("THB");
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});

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
      setName(""); setShopType("RETAIL"); setCurrency("THB"); setErrors({});
      onCreated();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(getErrorMessage(code));
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
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Café"
            maxLength={120}
            className={`w-full h-9 px-3 border rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-teal ${
              errors.name ? "border-status-red" : "border-ui-greyBorder"
            }`}
          />
          {errors.name && <p className="text-[12px] text-status-red">{errors.name}</p>}
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