"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface PlanLimits {
  plan: string;
  max_shops: number;
  max_products: number;
  max_staff: number;
  max_tables: number;
  order_history_days: number;
}

interface Usage {
  plan: string;
  shops: { used: number; max: number };
}

export default function PlanPage() {
  const { user } = useAuth();
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [usage,  setUsage]  = useState<Usage | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ limits: PlanLimits[] }>("/api/plan/limits"),
      api.get<Usage>("/api/plan/usage"),
    ]).then(([limRes, usageRes]) => {
      const currentPlan = usageRes.data.plan;
      const match = limRes.data.limits.find(l => l.plan === currentPlan);
      setLimits(match ?? null);
      setUsage(usageRes.data);
    }).catch(() => {});
  }, []);

  const currentPlan = (user as any)?.plan ?? "free";

  const FEATURES = [
    { label: "Shops",              free: "3",    pro: "TBC" },
    { label: "Products per shop",  free: "200",  pro: "TBC" },
    { label: "Staff per shop",     free: "10",   pro: "TBC" },
    { label: "Tables per shop",    free: "20",   pro: "TBC" },
    { label: "Order history",      free: "Unlimited", pro: "TBC" },
    { label: "Multi-currency",     free: "✓",    pro: "✓" },
    { label: "QR ordering",        free: "✓",    pro: "✓" },
    { label: "Kitchen display",    free: "✓",    pro: "✓" },
    { label: "Reports & analytics",free: "✓",    pro: "✓" },
    { label: "Priority support",   free: "—",    pro: "✓" },
  ];

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#0F2B4C]">Plan & Billing</h1>
        <p className="text-[13px] text-[#5F5E5A] mt-0.5">Your current plan and what's included.</p>
      </div>

      {/* Current plan card */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-[#5F5E5A] uppercase tracking-wide font-medium mb-1">Current plan</p>
            <div className="flex items-center gap-2">
              <span className="text-[20px] font-semibold text-[#0F2B4C] capitalize">{currentPlan}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#E1F5EE] text-[#0D7A5F] uppercase tracking-wide">
                Active
              </span>
            </div>
            {usage && (
              <p className="text-[13px] text-[#5F5E5A] mt-1">
                {usage.shops.used} / {usage.shops.max} shops used
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[24px] font-bold text-[#0F2B4C]">$0</p>
            <p className="text-[12px] text-[#5F5E5A]">/ month</p>
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden mb-6">
        <div className="grid grid-cols-3 bg-[#F9F8F5] border-b border-[#D3D1C7]">
          <div className="px-4 py-3 text-[12px] font-medium text-[#5F5E5A]">Feature</div>
          <div className="px-4 py-3 text-center">
            <span className="text-[12px] font-semibold text-[#0F2B4C]">Free</span>
            {currentPlan === "free" && (
              <span className="ml-1.5 text-[10px] font-medium text-[#0D7A5F] bg-[#E1F5EE] px-1.5 py-0.5 rounded">current</span>
            )}
          </div>
          <div className="px-4 py-3 text-center">
            <span className="text-[12px] font-semibold text-[#534AB7]">Pro</span>
            {currentPlan === "pro" && (
              <span className="ml-1.5 text-[10px] font-medium text-[#534AB7] bg-[#EEEDFE] px-1.5 py-0.5 rounded">current</span>
            )}
          </div>
        </div>

        {FEATURES.map((f, i) => (
          <div
            key={f.label}
            className={`grid grid-cols-3 border-b border-[#D3D1C7] last:border-b-0 ${i % 2 === 0 ? "" : "bg-[#FAFAF8]"}`}
          >
            <div className="px-4 py-3 text-[13px] text-[#5F5E5A]">{f.label}</div>
            <div className={`px-4 py-3 text-center text-[13px] font-medium ${currentPlan === "free" ? "text-[#0F2B4C]" : "text-[#9CA3AF]"}`}>
              {f.free}
            </div>
            <div className={`px-4 py-3 text-center text-[13px] font-medium ${currentPlan === "pro" ? "text-[#534AB7]" : "text-[#9CA3AF]"}`}>
              {f.pro}
            </div>
          </div>
        ))}
      </div>

      {/* Upgrade CTA */}
      {currentPlan === "free" && (
        <div className="bg-[#F4F3FF] border border-[#C8C5F5] rounded-lg p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-semibold text-[#2D2A7A]">Pro plan coming soon</p>
            <p className="text-[13px] text-[#5F5E5A] mt-0.5">
              Get early access — contact us at{" "}
              <a href="mailto:support@minipos.site" className="text-[#0D7A5F] underline">
                support@minipos.site
              </a>
            </p>
          </div>
          <a
            href="mailto:support@minipos.site"
            className="shrink-0 px-4 py-2 rounded-lg bg-[#534AB7] text-white text-[13px] font-medium hover:bg-[#4340A0] transition-colors"
          >
            Get early access
          </a>
        </div>
      )}
    </div>
  );
}
