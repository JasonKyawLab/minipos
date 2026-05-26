// =========================================================
// proxy.ts — Next.js Middleware (runs on every matched request)
//
// ITEM 10 changes
// ───────────────
// The old middleware checked pos_token / kitchen_token but
// had NO awareness of terminal_id. This caused two problems:
//
//   Problem A — False "needs activation" redirect on deep routes
//     A device that has pos_token (staff is logged in) but no
//     terminal_id (never registered) was not redirected — it
//     just hit the terminal page and got a 403 from the API.
//     Now we explicitly redirect /pos/:shopId/terminal and
//     /kitchen/:shopId/display to the top-level login page
//     with ?error=DEVICE_NOT_VERIFIED when terminal_id is
//     missing, so the auto-registration flow can run cleanly.
//
//   Problem B — No distinction between "needs PIN login" and
//     "needs device activation"
//     Previously both cases resulted in the same redirect to
//     /pos/:shopId with no context. Now:
//       • Missing pos_token + has terminal_id  → /pos/:shopId
//         (needs PIN login — normal flow)
//       • Missing terminal_id                  → /pos/:shopId?error=DEVICE_NOT_VERIFIED
//         (needs device activation — auto-reg flow)
//
// ── Route protection summary ──────────────────────────────
//
//   /pos/:shopId                  PUBLIC — auto-registration + PIN login
//   /pos/:shopId/terminal         PROTECTED — requires pos_token
//                                 + terminal_id (redirects with ?error if missing)
//
//   /kitchen/:shopId              PUBLIC — auto-registration + PIN login
//   /kitchen/:shopId/display      PROTECTED — requires kitchen_token
//                                 + terminal_id (redirects with ?error if missing)
//
//   /dashboard, /shops, /admin,
//   /profile                      PROTECTED — requires access_token
//
//   /login                        PUBLIC (redirects to /dashboard if logged in)
//   /qr/**                        PUBLIC — no auth required
//
// ── Cookie reference ──────────────────────────────────────
//
//   access_token      Platform JWT — set on login, cleared on logout
//   pos_token         POS staff JWT — set on PIN login
//   kitchen_token     Kitchen staff JWT — set on PIN login
//   terminal_session  Terminal session — set by /terminal/activate
//   terminal_id       Hardware passport — permanent per device
//                     Set by /terminal/activate on first mode entry.
//                     Its ABSENCE means the device was never activated.
//
// ── Important: middleware does not verify JWTs ────────────
// We only check cookie presence here, not validity. The
// backend API validates every token on every request. If a
// token is expired or tampered, the API returns 401/403 and
// posApi / kitchenApi interceptors handle the redirect.
// =========================================================

import { NextRequest, NextResponse } from "next/server";

// ── Cookie names ─────────────────────────────────────────
const COOKIE_ACCESS_TOKEN    = "access_token";
const COOKIE_POS_TOKEN       = "pos_token";
const COOKIE_KITCHEN_TOKEN   = "kitchen_token";
const COOKIE_TERMINAL_ID     = "terminal_id";

// ── Query param written by middleware ────────────────────
// The login page reads this to show the correct banner.
const ERROR_PARAM_DEVICE_NOT_VERIFIED = "DEVICE_NOT_VERIFIED";

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const accessToken   = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const posToken      = request.cookies.get(COOKIE_POS_TOKEN)?.value;
  const kitchenToken  = request.cookies.get(COOKIE_KITCHEN_TOKEN)?.value;
  const terminalId    = request.cookies.get(COOKIE_TERMINAL_ID)?.value;

  // ═══════════════════════════════════════════════════════
  // POS ROUTES
  // ═══════════════════════════════════════════════════════

  if (pathname.startsWith("/pos/")) {
    const parts = pathname.split("/");
    // parts: ["", "pos", ":shopId", ...rest]
    const shopId  = parts[2];
    const subPath = parts[3]; // "terminal" | undefined

    // /pos/:shopId — top-level login page.
    // This is ALWAYS public. The auto-registration flow,
    // PIN login, and "pending approval" screen all live here.
    // We must NOT redirect away from here even if terminal_id
    // is missing — that is exactly what this page handles.
    if (!subPath) {
      return NextResponse.next();
    }

    // /pos/:shopId/terminal — working POS screen.
    // Requires BOTH pos_token (staff PIN session) AND
    // terminal_id (device has been activated at least once).
    if (subPath === "terminal") {
      // Check terminal_id first — it's the deeper requirement.
      // A device with no terminal_id has never been activated
      // by an owner, so even if somehow it got a pos_token,
      // the API will reject every request with 403.
      if (!terminalId) {
        const url = request.nextUrl.clone();
        url.pathname = `/pos/${shopId}`;
        url.searchParams.set("error", ERROR_PARAM_DEVICE_NOT_VERIFIED);
        return NextResponse.redirect(url);
      }

      // terminal_id exists but no pos_token — staff needs to
      // log in with their PIN. Redirect without an error param
      // so the page shows the normal staff selection screen.
      if (!posToken) {
        const url = request.nextUrl.clone();
        url.pathname = `/pos/${shopId}`;
        url.searchParams.delete("error");
        return NextResponse.redirect(url);
      }

      // Both cookies present — allow through.
      return NextResponse.next();
    }

    // Any other /pos/:shopId/* sub-path — allow through and
    // let the API enforce auth. This covers any future routes
    // we add under the POS tree without needing middleware changes.
    return NextResponse.next();
  }

  // ═══════════════════════════════════════════════════════
  // KITCHEN ROUTES
  // ═══════════════════════════════════════════════════════

  if (pathname.startsWith("/kitchen/")) {
    const parts = pathname.split("/");
    // parts: ["", "kitchen", ":shopId", ...rest]
    const shopId  = parts[2];
    const subPath = parts[3]; // "display" | undefined

    // /kitchen/:shopId — staff selection page. Always public.
    if (!subPath) {
      return NextResponse.next();
    }

    // /kitchen/:shopId/display — working kitchen display.
    // Same protection pattern as POS terminal.
    if (subPath === "display") {
      if (!terminalId) {
        const url = request.nextUrl.clone();
        url.pathname = `/kitchen/${shopId}`;
        url.searchParams.set("error", ERROR_PARAM_DEVICE_NOT_VERIFIED);
        return NextResponse.redirect(url);
      }

      if (!kitchenToken) {
        const url = request.nextUrl.clone();
        url.pathname = `/kitchen/${shopId}`;
        url.searchParams.delete("error");
        return NextResponse.redirect(url);
      }

      return NextResponse.next();
    }

    // Any other /kitchen/:shopId/* sub-path — allow through.
    return NextResponse.next();
  }

  // ═══════════════════════════════════════════════════════
  // PLATFORM ROUTES — require access_token
  // ═══════════════════════════════════════════════════════

  const protectedPrefixes = ["/dashboard", "/shops", "/admin", "/profile"];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (isProtected && !accessToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ═══════════════════════════════════════════════════════
  // LOGIN PAGE — skip if already authenticated
  // ═══════════════════════════════════════════════════════

  if (pathname === "/login" && accessToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// ── Matcher ───────────────────────────────────────────────
// Only run middleware on routes that need it.
// Excludes _next/static, _next/image, favicon, api routes, etc.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/shops/:path*",
    "/admin/:path*",
    "/profile/:path*",
    "/pos/:path*",
    "/kitchen/:path*",
    "/login",
  ],
};