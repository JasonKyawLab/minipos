// app/(platform)/dashboard/loading.tsx
// Automatically shown by Next.js App Router while the page is loading.
// Matches the shape of the real dashboard so there's no layout shift.

import { PageSkeleton } from "@/components/states";

export default function DashboardLoading() {
  return <PageSkeleton />;
}