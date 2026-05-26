// =========================================================
// app/(pos)/pos/[shopId]/login/page.tsx
//
// ITEM 9 — Dead route redirect.
//
// This route (/pos/:shopId/login) is no longer used.
// The active POS PIN login page lives at /pos/:shopId/page.tsx.
//
// WHY this file still exists instead of being deleted:
//   Deleting it is the cleanest option, but Next.js App
//   Router has no built-in "redirect all sub-paths" at the
//   filesystem level without a file. Keeping a thin redirect
//   here is safer than a dangling route that renders a blank
//   or broken page if a user hits an old bookmark.
//
// WHY the old page was wrong:
//   The old /login page called getOrCreateDeviceKey() from
//   posApi (old pattern) and used the x-device-key header
//   model. The new flow uses the terminal_session HttpOnly
//   cookie and the device_key is sent only during device
//   registration (POST /devices/register), not on every
//   request. The old page was confusing because it had its
//   own staff fetch / PIN submit logic duplicated from the
//   main /pos/:shopId page, meaning two divergent code paths
//   for the same thing.
//
// WHAT this file does now:
//   Immediately redirects to /pos/:shopId (no flash, no JS
//   needed) using Next.js server-side redirect. The active
//   page handles everything the old one did, correctly.
// =========================================================

import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ shopId: string }>;
}

export default async function PosLoginRedirectPage({ params }: Props) {
  const { shopId } = await params;
  // 308 Permanent Redirect — browsers and crawlers will
  // update cached references to this URL.
  redirect(`/pos/${shopId}`);
}