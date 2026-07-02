"use client";
// app/(platform)/dashboard/error.tsx
// Automatically shown by Next.js App Router when the page throws.
// Must be a Client Component — receives the Error object as a prop.

import { useEffect } from "react";
import { ErrorState } from "@/components/states";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to your error tracking service here (e.g. Sentry)
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <ErrorState
      message="Failed to load your shops. Please try again."
      onRetry={reset}
    />
  );
}