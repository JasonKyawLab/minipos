// =========================================================
// utils/formatDate.ts
// All date formatting in one place. Uses native Intl API
// to avoid a large date-fns bundle for simple cases.
// =========================================================

/**
 * "15 Apr 2025, 14:30"
 */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * "15 Apr 2025"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * "14:30"
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * ISO date for API queries "2025-04-15"
 */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns today and 30 days ago as ISO date strings.
 */
export function getDefaultDateRange(): { from: string; to: string } {
  const today = toLocalDate(new Date());
  return { from: today, to: today };
}

/**
 * Human-readable relative time: "2 minutes ago", "3 hours ago"
 */
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60)  return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return formatDate(dateStr);
}