// =========================================================
// middleware.ts
// Path: frontend/middleware.ts   ← MUST be this exact name
//
// CRITICAL FIX: This file was previously named proxy.ts.
// Next.js ONLY recognises middleware.ts (or middleware.js)
// at the project root. proxy.ts is treated as a regular
// TypeScript file and is NEVER executed as middleware.
// As a result, ALL cookie-based route protection has been
// silently skipped since the project began.
//
// ACTION REQUIRED:
//   1. Create this file at: frontend/middleware.ts
//   2. DELETE the old file: frontend/proxy.ts
//
// The content is identical to proxy.ts — only the filename
// changes. Once renamed, Next.js will automatically run this
// function on every matched request before the page renders.
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

  const accessToken  = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const posToken     = request.cookies.get(COOKIE_POS_TOKEN)?.value;
  const kitchenToken = request.cookies.get(COOKIE_KITCHEN_TOKEN)?.value;
  const terminalId   = request.cookies.get(COOKIE_TERMINAL_ID)?.value;

  // ═══════════════════════════════════════════════════════
  // POS ROUTES
  // ═══════════════════════════════════════════════════════

  if (pathname.startsWith("/pos/")) {
    const parts   = pathname.split("/");
    // parts: ["", "pos", ":shopId", ...rest]
    const shopId  = parts[2];
    const subPath = parts[3]; // "terminal" | undefined

    // /pos/:shopId — top-level login page.
    // Always public — auto-registration, PIN login, and
    // "pending approval" all live here.
    if (!subPath) {
      return NextResponse.next();
    }

    // /pos/:shopId/terminal — working POS screen.
    // Requires BOTH terminal_id AND pos_token.
    if (subPath === "terminal") {
      // terminal_id missing → device never activated
      if (!terminalId) {
        const url = request.nextUrl.clone();
        url.pathname = `/pos/${shopId}`;
        url.searchParams.set("error", ERROR_PARAM_DEVICE_NOT_VERIFIED);
        return NextResponse.redirect(url);
      }

      // terminal_id present but no pos_token → needs PIN login
      if (!posToken) {
        const url = request.nextUrl.clone();
        url.pathname = `/pos/${shopId}`;
        url.searchParams.delete("error");
        return NextResponse.redirect(url);
      }

      // Both present → allow through
      return NextResponse.next();
    }

    // Any other /pos/:shopId/* sub-path — allow through.
    return NextResponse.next();
  }

  // ═══════════════════════════════════════════════════════
  // KITCHEN ROUTES
  // ═══════════════════════════════════════════════════════

  if (pathname.startsWith("/kitchen/")) {
    const parts   = pathname.split("/");
    const shopId  = parts[2];
    const subPath = parts[3]; // "display" | undefined

    // /kitchen/:shopId — staff selection page. Always public.
    if (!subPath) {
      return NextResponse.next();
    }

    // /kitchen/:shopId/display — working kitchen display.
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
// Only run on routes that need protection.
// Excludes _next/static, _next/image, favicon, and api routes.
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