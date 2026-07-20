"use client";

import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface PlanLimit {
  plan: string;
  max_shops: number;
  max_products: number;
  max_staff: number;
  max_tables: number;
  order_history_days: number;
}

interface EditState {
  max_shops: string;
  max_products: string;
  max_staff: string;
  max_tables: string;
  order_history_days: string;
}

export default function AdminPlansPage() {
  const [limits, setLimits]     = useState<PlanLimit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<PlanLimit | null>(null);
  const [form, setForm]         = useState<EditState | null>(null);
  const [saving, setSaving]     = useState(false);

  async function load() {
    try {
      const { data } = await api.get<{ limits: PlanLimit[] }>("/api/plan/limits");
      setLimits(data.limits);
    } catch {
      toast.error("Failed to load plan limits.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openEdit(plan: PlanLimit) {
    setEditing(plan);
    setForm({
      max_shops:          String(plan.max_shops),
      max_products:       String(plan.max_products),
      max_staff:          String(plan.max_staff),
      max_tables:         String(plan.max_tables),
      order_history_days: String(plan.order_history_days),
    });
  }

  async function handleSave() {
    if (!editing || !form) return;
    setSaving(true);
    try {
      await api.patch(`/api/plan/limits/${editing.plan}`, {
        max_shops:          parseInt(form.max_shops),
        max_products:       parseInt(form.max_products),
        max_staff:          parseInt(form.max_staff),
        max_tables:         parseInt(form.max_tables),
        order_history_days: parseInt(form.order_history_days),
      });
      toast.success(`${editing.plan} plan limits updated.`);
      setEditing(null);
      load();
    } catch {
      toast.error("Failed to save limits.");
    } finally {
      setSaving(false);
    }
  }

  const FIELDS: { key: keyof EditState; label: string; hint: string }[] = [
    { key: "max_shops",          label: "Max shops",            hint: "Per user" },
    { key: "max_products",       label: "Max products",         hint: "Per shop" },
    { key: "max_staff",          label: "Max staff",            hint: "Per shop (non-owner)" },
    { key: "max_tables",         label: "Max tables",           hint: "Per shop" },
    { key: "order_history_days", label: "Order history (days)", hint: "-1 = unlimited" },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-medium text-[#0F2B4C]">Plans</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">View and edit limits per plan tier.</p>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={3} cols={6} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {limits.map((plan) => (
            <div key={plan.plan} className="bg-white border border-[#D3D1C7] rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`text-[12px] font-semibold px-2.5 py-0.5 rounded uppercase tracking-wide ${
                    plan.plan === "pro"
                      ? "bg-[#EEEDFE] text-[#534AB7]"
                      : "bg-[#F1EFE8] text-[#5F5E5A]"
                  }`}>
                    {plan.plan}
                  </span>
                </div>
                <button
                  onClick={() => openEdit(plan)}
                  className="text-[12px] text-[#0D7A5F] hover:underline font-medium"
                >
                  Edit limits
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { label: "Shops",         value: plan.max_shops },
                  { label: "Products/shop", value: plan.max_products },
                  { label: "Staff/shop",    value: plan.max_staff },
                  { label: "Tables/shop",   value: plan.max_tables },
                  { label: "Order history", value: plan.order_history_days === -1 ? "Unlimited" : `${plan.order_history_days} days` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-[13px]">
                    <span className="text-[#5F5E5A]">{label}</span>
                    <span className="font-medium text-[#0F2B4C]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.plan} plan limits`}>
        {form && (
          <div className="space-y-4">
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="space-y-1">
                <label className="text-[13px] font-medium text-[#0F2B4C]">
                  {label}
                  <span className="ml-1 text-[11px] font-normal text-[#9CA3AF]">({hint})</span>
                </label>
                <input
                  type="number"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full h-9 px-3 border border-[#D3D1C7] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
