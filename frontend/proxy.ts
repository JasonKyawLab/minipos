// =========================================================
// proxy.ts
// Path: frontend/proxy.ts
//
// Next.js 16 uses "proxy.ts" (not "middleware.ts") for
// request interception. Must have a DEFAULT export function.
//
// This runs on the Edge before every matched request.
// We use it to protect routes — redirect unauthenticated
// users to /login before any page code runs.
//
// Why cookies and not localStorage?
//   Middleware runs server-side on the Edge — localStorage
//   does not exist there. The backend sets access_token as
//   an httpOnly cookie, readable here via request.cookies.
// =========================================================

import { NextRequest, NextResponse } from "next/server";

// DEFAULT export — this is what Next.js 16 requires.
// Named "proxy" export also works, but default is cleaner.
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get("access_token")?.value;
  const posToken    = request.cookies.get("pos_token")?.value;

  // ── POS routes: require pos_token ────────────────────────
  // The /pos/[shopId]/login page itself is public (no token needed).
  // Every other POS page requires a valid pos_token cookie.
  if (pathname.startsWith("/pos/") && !pathname.endsWith("/login")) {
    if (!posToken) {
      const parts  = pathname.split("/");
      const shopId = parts[2];
      const loginUrl = shopId
        ? new URL(`/pos/${shopId}/login`, request.url)
        : new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Platform routes: require access_token ────────────────
  const protectedPrefixes = ["/dashboard", "/shops", "/admin", "/profile"];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (isProtected && !accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Already logged in: skip /login page ──────────────────
  // If user has a valid cookie and tries to go to /login,
  // redirect them to /dashboard instead.
  if (pathname === "/login" && accessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

// Tell Next.js which paths this proxy runs on.
// Excludes _next (static assets) and API routes automatically.
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