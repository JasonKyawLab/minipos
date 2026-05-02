import { NextRequest, NextResponse } from "next/server";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get("access_token")?.value;
  const posToken    = request.cookies.get("pos_token")?.value;
  const kitchenToken = request.cookies.get("kitchen_token")?.value;

  // ── POS routes ────────────────────────────────────────────
  // /pos/:shopId          → PIN selection page (public, no token needed)
  // /pos/:shopId/terminal → Working terminal (requires pos_token)
  //
  // Rule: only protect sub-paths BELOW /:shopId
  // The PIN page itself must be public, otherwise we loop.
  if (pathname.startsWith("/pos/")) {
    const parts = pathname.split("/"); // ["", "pos", ":shopId", "terminal"]
    const hasSubPath = parts.length > 3 && parts[3] !== "";

    if (hasSubPath && !posToken) {
      // No session → kick back to PIN login page
      const shopId = parts[2];
      return NextResponse.redirect(new URL(`/pos/${shopId}`, request.url));
    }
  }

  // ── Kitchen routes ────────────────────────────────────────
  // /kitchen/:shopId         → Staff selection (public)
  // /kitchen/:shopId/display → KDS working screen (requires kitchen_token)
  if (pathname.startsWith("/kitchen/")) {
    const parts = pathname.split("/");
    const hasSubPath = parts.length > 3 && parts[3] !== "";

    if (hasSubPath && !kitchenToken) {
      const shopId = parts[2];
      return NextResponse.redirect(new URL(`/kitchen/${shopId}`, request.url));
    }
  }

  // ── Platform routes: require access_token ─────────────────
  const protectedPrefixes = ["/dashboard", "/shops", "/admin", "/profile"];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (isProtected && !accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Already logged in: skip /login ────────────────────────
  if (pathname === "/login" && accessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

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