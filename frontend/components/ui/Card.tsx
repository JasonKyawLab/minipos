// components/ui/Card.tsx
// Reusable card container with standard/metric/danger variants.
// Used across dashboard, settings, profile, and modals.

import React from "react";
import { clsx } from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "standard" | "metric" | "danger";
  padding?: boolean;
}

export function Card({
  children,
  className,
  variant = "standard",
  padding = true,
}: CardProps) {
  const base = "rounded-lg";
  const variants = {
    standard: "bg-white border border-[#D3D1C7]",
    metric:   "bg-[#F1EFE8]",
    danger:   "bg-[#FCEBEB] border border-[#A32D2D]",
  };

  return (
    <div className={clsx(base, variants[variant], padding && "p-5", className)}>
      {children}
    </div>
  );
}

// ── Card sub-components for common layouts ────────────────

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-[16px] font-medium text-[#0F2B4C]">{title}</h2>
        {subtitle && <p className="text-[13px] text-[#5F5E5A] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardDivider() {
  return <div className="border-t border-[#D3D1C7] my-4" />;
}