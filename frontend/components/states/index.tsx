// =========================================================
// components/states/LoadingSkeleton.tsx
// =========================================================

import React from "react";
import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={clsx("skeleton-shimmer rounded-md", className)}
      style={{ width, height: height ?? "16px" }}
    />
  );
}

/** Page-level skeleton: metric cards + table rows */
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metric cards row */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-ui-greyLight rounded-lg p-4 space-y-2">
            <Skeleton width="60%" />
            <Skeleton height="28px" width="80%" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-white rounded-lg border border-ui-greyBorder overflow-hidden">
        <div className="h-10 bg-ui-greyLight border-b border-ui-greyBorder" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-3 py-3 border-b border-ui-greyBorder last:border-b-0"
          >
            <Skeleton width="100px" />
            <Skeleton width="80px" />
            <Skeleton width="120px" />
            <Skeleton className="ml-auto" width="60px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** List skeleton for sidebar-style lists */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="rounded-full shrink-0" width="32px" height="32px" />
          <div className="flex-1 space-y-1.5">
            <Skeleton width="60%" />
            <Skeleton width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

// =========================================================
// components/states/ErrorState.tsx
// =========================================================

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-10 h-10 rounded-full bg-status-redLight flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 7v4M10 13h.01M3.5 16.5h13a1 1 0 00.87-1.5l-6.5-11a1 1 0 00-1.74 0l-6.5 11a1 1 0 00.87 1.5z"
            stroke="#A32D2D"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="text-[14px] text-ui-grey text-center max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[13px] text-brand-teal hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// =========================================================
// components/states/EmptyState.tsx
// =========================================================

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      {icon ?? (
        <div className="w-12 h-12 rounded-full bg-ui-greyLight flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="#D3D1C7" strokeWidth="1.5" />
            <path d="M8 12h8M12 8v8" stroke="#D3D1C7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
      <p className="text-[16px] font-medium text-ui-nearBlack">{title}</p>
      {description && (
        <p className="text-[13px] text-ui-grey text-center max-w-xs">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

// ── PageLoader ────────────────────────────────────────────

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F1EFE8]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={28} />
        <p className="text-[13px] text-[#5F5E5A]">Loading…</p>
      </div>
    </div>
  );
}