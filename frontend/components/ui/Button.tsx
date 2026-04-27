"use client";
// =========================================================
// components/ui/Button.tsx
// =========================================================

import React from "react";
import { clsx } from "clsx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize    = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-teal text-white hover:bg-[#0a6b52] active:bg-[#095e48] border-transparent",
  secondary:
    "bg-white text-brand-navy hover:bg-ui-greyLight active:bg-ui-greyLight border-ui-greyBorder",
  danger:
    "bg-status-redLight text-status-red hover:bg-red-100 active:bg-red-100 border-status-red/30",
  ghost:
    "bg-transparent text-ui-grey hover:bg-ui-greyLight active:bg-ui-greyLight border-transparent",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-9 px-4 text-[13px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 font-medium rounded-md border",
        "transition-colors duration-150 cursor-pointer select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}