"use client";
// =========================================================
// context/SessionGuardContext.tsx
//
// Checks the session type on mount and on tab focus, then
// routes the user to the correct area of the app.
//
// ── FIX: Back navigation after logout (bfcache) ──────────
//
// PROBLEM:
//   When you click logout, the cookie is cleared and the app
//   navigates to /login. But pressing the browser back button
//   restores the previous page from the bfcache (Back/Forward
//   Cache) — a browser optimisation that snapshots the page
//   in memory and replays it instantly without re-running any
//   JavaScript. The result: the page renders with stale React
//   state (user data, shop data), looks broken, then crashes
//   when it tries to make authenticated API calls.
//
// ROOT CAUSE:
//   router.push('/login') only does a client-side navigation.
//   It does not prevent the browser from caching the previous
//   page. The bfcache restores the page snapshot exactly as
//   it was — including all component state — but the httpOnly
//   cookie is gone, so every API call returns 401.
//
// FIX — Two layers:
//
//   Layer 1: `pageshow` event listener
//     The browser fires `pageshow` with `event.persisted = true`
//     when a page is restored from bfcache. We listen for this
//     and immediately call checkSession(). If the cookie is gone,
//     sessionType resolves to 'NONE' and the guard redirects to
//     /login — this happens fast enough that the user sees the
//     login page, not a crashed dashboard.
//
//   Layer 2: sessionType-based redirect guard
//     checkSession() already redirects when session is NONE and
//     the current path is not public. Together with the pageshow
//     listener, this catches the bfcache case on every restore.
//
// WHY NOT window.location.href on logout?
//   Using window.location.href would work but forces a full page
//   reload on every logout — that clears the bfcache entry and
//   prevents the problem. However it also resets all React state
//   and re-runs the session check unnecessarily on the login page.
//   The pageshow listener approach is cleaner: let the browser do
//   its caching optimisation; we just re-validate on restore.
//
// ── The stuck loading bug (fixed previously) ─────────────
//   After ModeGate does window.location.href = "/pos/:shopId",
//   the browser performs a full page reload. On mount:
//     1. State initialises to { sessionType: 'UNKNOWN', isChecking: true }
//     2. AppShell shows a full-screen spinner (correct)
//     3. checkSession() fires → /api/auth/session-type returns TERMINAL
//     4. isOnTerminalPath = true → no router.replace() call
//     5. setState({ isChecking: false }) → spinner disappears → page renders
//
// ── Tab focus re-check ────────────────────────────────────
//   We skip showing the spinner on re-checks (tab focus / bfcache
//   restore) so users who switch tabs don't see a flash. Only the
//   very first mount check shows the full-screen loader.
// =========================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';

type SessionType = 'TERMINAL' | 'PLATFORM' | 'NONE' | 'UNKNOWN';

interface SessionGuardState {
  sessionType:    SessionType;
  isChecking:     boolean;
  terminalMode:   'POS' | 'KITCHEN' | null;
  terminalShopId: string | null;
}

interface SessionGuardContextValue extends SessionGuardState {
  recheck: () => Promise<void>;
}

const SessionGuardContext = createContext<SessionGuardContextValue | null>(null);

const TERMINAL_PATHS   = ['/pos', '/kitchen'];
// Mirror exactly what the middleware protects — only redirect from these.
const PROTECTED_PATHS  = ['/dashboard', '/shops', '/admin', '/profile'];

export function SessionGuardProvider({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  // Use refs so checkSession never needs to re-create itself
  // when router or pathname change. This prevents the
  // "rendered more hooks than during the previous render" error.
  const routerRef   = useRef(router);
  const pathnameRef = useRef(pathname);

  useEffect(() => { routerRef.current = router;   }, [router]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const [state, setState] = useState<SessionGuardState>({
    sessionType:    'UNKNOWN',
    isChecking:     true,  // true on first render — AppShell shows spinner
    terminalMode:   null,
    terminalShopId: null,
  });

  // ── checkSession ──────────────────────────────────────────
  // Accepts a flag so tab-focus / bfcache re-checks don't show
  // the full-screen spinner. Only the initial mount does.
  const checkSession = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setState(prev => ({ ...prev, isChecking: true }));
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/auth/session-type`,
        { credentials: 'include', cache: 'no-store' }
      );

      if (!res.ok) {
        setState({
          sessionType:    'NONE',
          isChecking:     false,
          terminalMode:   null,
          terminalShopId: null,
        });

        const p = pathnameRef.current || window.location.pathname || '/';
        const onProtectedPage = PROTECTED_PATHS.some(pp => p.startsWith(pp));
        if (onProtectedPage) {
          routerRef.current.replace('/login');
        }
        return;
      }

      const data = await res.json();
      const currentPathname = window.location.pathname;
      const currentRouter   = routerRef.current;

      if (data.type === 'TERMINAL') {
        setState({
          sessionType:    'TERMINAL',
          isChecking:     false,
          terminalMode:   data.mode,
          terminalShopId: data.shopId,
        });

        // Only redirect if we are NOT already on a terminal path.
        const isOnTerminalPath = TERMINAL_PATHS.some(
          p => currentPathname.startsWith(p)
        );
        if (!isOnTerminalPath) {
          currentRouter.replace(data.redirectTo);
        }

      } else if (data.type === 'PLATFORM') {
        setState({
          sessionType:    'PLATFORM',
          isChecking:     false,
          terminalMode:   null,
          terminalShopId: null,
        });

        // A platform user somehow landed on a terminal path (e.g. bookmark).
        // Redirect them back to the dashboard — UNLESS they are on the
        // device pending approval screen.
        //
        // WHY the exception:
        //   When ModeGate sends an unregistered device, the backend returns
        //   202 (AWAITING_APPROVAL) without setting a terminal_session cookie.
        //   ModeGate then navigates to /pos/:shopId?device_pending=xxx via
        //   window.location.href (full reload). On reload, checkSession() fires
        //   and sees sessionType = 'PLATFORM' (the owner's cookie is still
        //   active). Without this exception, the guard fires router.replace
        //   ('/dashboard') immediately, sending the owner to the shop list
        //   instead of showing the "Waiting for Approval" screen.
        //
        //   The ?device_pending param is the signal that this is intentional —
        //   the owner just triggered device registration and is waiting for it
        //   to be approved. We must not redirect in this case.
        const isOnTerminalPath = TERMINAL_PATHS.some(
          p => currentPathname.startsWith(p)
        );
        const isDevicePending = typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).has('device_pending');

        if (isOnTerminalPath && !isDevicePending) {
          currentRouter.replace('/dashboard');
        }

      } else {
        // NONE — no valid session.
        setState({
          sessionType:    'NONE',
          isChecking:     false,
          terminalMode:   null,
          terminalShopId: null,
        });

        const p = pathnameRef.current || window.location.pathname || '/';
        const onProtectedPage = PROTECTED_PATHS.some(pp => p.startsWith(pp));
        if (onProtectedPage) {
          console.log('[SessionGuard] redirecting to /login from', p);
          currentRouter.replace('/login');
        }
      }
    } catch {
      // Network error — clear spinner and let individual pages handle 401s.
      setState({
        sessionType:    'NONE',
        isChecking:     false,
        terminalMode:   null,
        terminalShopId: null,
      });
    }
  }, []); // stable reference — no deps needed because we use refs

  // ── Initial mount: show spinner while checking ────────────
  // Skip the check on public routes — they never need a session to render,
  // and running checkSession on / or /login introduces a potential race
  // between the NONE redirect guard and public-page rendering in Safari.
  useEffect(() => {
    const p = pathnameRef.current || (typeof window !== 'undefined' ? window.location.pathname : '') || '/';
    const isPublic = p === '/' || p === '/login' || p.startsWith('/qr') || p === '/landing';
    if (isPublic) {
      setState(prev => ({ ...prev, sessionType: 'NONE', isChecking: false }));
      return;
    }
    checkSession(true);
  }, [checkSession]);

  // ── Tab focus: silent re-check, no spinner ────────────────
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        checkSession(false); // silent — no spinner flash
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [checkSession]);

  // ── BUG FIX: bfcache restore guard ───────────────────────
  // The `pageshow` event fires every time a page is shown,
  // including when it is restored from the bfcache (back button).
  // `event.persisted = true` means the page came from bfcache.
  //
  // When this fires after a logout:
  //   - The httpOnly cookie is already gone
  //   - checkSession() will hit the !res.ok branch
  //   - That branch now calls router.replace('/login')
  //   - The user sees /login instead of a crashed page
  //
  // This is a separate listener from visibilitychange because
  // bfcache restores do NOT always trigger a visibilitychange
  // event — the browser may restore the page without ever marking
  // it as hidden first (e.g. cmd+[ in Safari).
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        // Page was restored from bfcache — re-validate session silently.
        // No spinner: the page is already visible and re-checking quickly.
        checkSession(false);
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [checkSession]);

  // Public recheck (called by pages that need it)
  const recheck = useCallback(() => checkSession(true), [checkSession]);

  return (
    <SessionGuardContext.Provider value={{ ...state, recheck }}>
      {children}
    </SessionGuardContext.Provider>
  );
}

export function useSessionGuard(): SessionGuardContextValue {
  const ctx = useContext(SessionGuardContext);
  if (!ctx) throw new Error('useSessionGuard must be inside <SessionGuardProvider>');
  return ctx;
}