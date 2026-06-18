// =========================================================
// components/ui/Badge.tsx
//
// FIX 1: Added CLOSING to ORDER_STATUS_STYLES.
//        OrderStatus now includes "CLOSING" after the Flow D
//        migration, so the Record<OrderStatus> map must be
//        exhaustive.
//
// FIX 2: Added CHEF to ROLE_STYLES.
//        ShopRole includes "CHEF" in types/index.ts but the
//        Record<ShopRole> map was missing it, causing TS2741.
//        STAFF is not a valid ShopRole value so it is not added.
// =========================================================

import React from "react";
import { clsx } from "clsx";
import { OrderStatus, PaymentStatus, ShopRole, ShopType } from "@/types";

// ── Order Status Badge ─────────────────────────────────────

const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  OPEN:      "bg-status-amberLight text-status-amber",
  CONFIRMED: "bg-status-purpleLight text-status-purple",
  CLOSING:   "bg-status-amberLight text-status-amber",  // same amber — table is almost done
  PAID:      "bg-brand-tealLight text-brand-teal",
  CANCELLED: "bg-status-redLight text-status-red",
  REFUNDED:  "bg-ui-greyLight text-ui-grey",
};

// ── Payment Status Badge ──────────────────────────────────

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  PENDING:            "bg-status-amberLight text-status-amber",
  PAID:               "bg-brand-tealLight text-brand-teal",
  FAILED:             "bg-status-redLight text-status-red",
  REFUNDED:           "bg-ui-greyLight text-ui-grey",
  PARTIALLY_REFUNDED: "bg-status-purpleLight text-status-purple",
};

// ── Role Badge ────────────────────────────────────────────

const ROLE_STYLES: Record<ShopRole, string> = {
  OWNER:   "bg-brand-navy text-white",
  MANAGER: "bg-status-purpleLight text-status-purple",
  CASHIER: "bg-ui-greyLight text-ui-grey",
  CHEF:    "bg-status-amberLight text-status-amber",  // kitchen role — warm colour
};

// ── Shop Type ─────────────────────────────────────────────

const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  RETAIL:      "Retail",
  RESTAURANT:  "Restaurant",
  ONLINE_SHOP: "Online Shop",
};

// ── Base component ────────────────────────────────────────

interface BadgeProps {
  children:   React.ReactNode;
  className?: string;
}

function BaseBadge({ children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-sm text-[12px] font-medium whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Exports ───────────────────────────────────────────────

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <BaseBadge className={ORDER_STATUS_STYLES[status]}>
      {status.replace("_", " ")}
    </BaseBadge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <BaseBadge className={PAYMENT_STATUS_STYLES[status]}>
      {status.replace("_", " ")}
    </BaseBadge>
  );
}

export function RoleBadge({ role }: { role: ShopRole }) {
  return (
    <BaseBadge className={ROLE_STYLES[role]}>{role}</BaseBadge>
  );
}

export function ShopTypeBadge({ type }: { type: ShopType }) {
  return (
    <BaseBadge className="bg-ui-greyLight text-ui-grey">
      {SHOP_TYPE_LABELS[type]}
    </BaseBadge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <BaseBadge
      className={active ? "bg-brand-tealLight text-brand-teal" : "bg-status-redLight text-status-red"}
    >
      {active ? "Active" : "Inactive"}
    </BaseBadge>
  );
}

export function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "teal" | "amber" | "red" | "purple" | "navy";
}) {
  const styles = {
    default: "bg-ui-greyLight text-ui-grey",
    teal:    "bg-brand-tealLight text-brand-teal",
    amber:   "bg-status-amberLight text-status-amber",
    red:     "bg-status-redLight text-status-red",
    purple:  "bg-status-purpleLight text-status-purple",
    navy:    "bg-brand-navy text-white",
  };
  return <BaseBadge className={styles[variant]}>{children}</BaseBadge>;
}