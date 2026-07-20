"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button } from "./Button";

const LIMIT_COPY = {
  shop:    { label: "shop",    title: "Shop limit reached" },
  product: { label: "product", title: "Product limit reached" },
  staff:   { label: "staff",   title: "Staff limit reached" },
  table:   { label: "table",   title: "Table limit reached" },
} as const;

const PLAN_ROWS = [
  { feature: "Shops",           free: "3",    pro: "TBC" },
  { feature: "Products / shop", free: "200",  pro: "TBC" },
  { feature: "Staff / shop",    free: "10",   pro: "TBC" },
  { feature: "Tables / shop",   free: "20",   pro: "TBC" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  limitType: keyof typeof LIMIT_COPY;
  used: number;
  max: number;
}

export function PlanLimitModal({ open, onClose, limitType, used, max }: Props) {
  const router = useRouter();
  const copy = LIMIT_COPY[limitType];

  function goToPlan() {
    onClose();
    router.push("/plan");
  }

  return (
    <Modal open={open} onClose={onClose} title={copy.title}>
      <div className="space-y-4">
        {/* Status line */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-[13px] text-amber-800">
          You're on the <strong>Free plan</strong> ({used}/{max} {copy.label}s used).
          Your existing {copy.label}s are <strong>not affected</strong> — they continue working normally.
        </div>

        {/* Mini comparison table */}
        <div className="border border-[#D3D1C7] rounded-lg overflow-hidden text-[13px]">
          <div className="grid grid-cols-3 bg-[#F9F8F5] border-b border-[#D3D1C7]">
            <div className="px-3 py-2 text-[#5F5E5A] font-medium">Feature</div>
            <div className="px-3 py-2 text-center font-semibold text-[#0F2B4C]">
              Free <span className="text-[11px] font-normal text-[#0D7A5F]">current</span>
            </div>
            <div className="px-3 py-2 text-center font-semibold text-[#534AB7]">Pro</div>
          </div>
          {PLAN_ROWS.map((row, i) => (
            <div key={row.feature} className={`grid grid-cols-3 border-b border-[#D3D1C7] last:border-b-0 ${i % 2 === 1 ? "bg-[#FAFAF8]" : ""}`}>
              <div className="px-3 py-2 text-[#5F5E5A]">{row.feature}</div>
              <div className="px-3 py-2 text-center font-medium text-[#0F2B4C]">{row.free}</div>
              <div className="px-3 py-2 text-center text-[#9CA3AF]">{row.pro}</div>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-[#5F5E5A]">
          Pro plan coming soon. Contact us at{" "}
          <a href="mailto:support@minipos.site" className="text-[#0D7A5F] underline">support@minipos.site</a>{" "}
          for early access.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={goToPlan}>View Full Plan</Button>
        </div>
      </div>
    </Modal>
  );
}
