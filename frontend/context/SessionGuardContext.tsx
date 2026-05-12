"use client";
// =========================================================
// context/SessionGuardContext.tsx
//
// Checks the session type on mount and on tab focus, then
// routes the user to the correct area of the app.
//
// ── The stuck loading bug (fixed here) ───────────────────
// After ModeGate does window.location.href = "/pos/:shopId",
// the browser performs a full page reload. On mount:
//
//   1. State initialises to { sessionType: 'UNKNOWN', isChecking: true }
//   2. AppShell shows a full-screen spinner (correct behaviour)
//   3. checkSession() fires → /api/auth/session-type returns TERMINAL
//   4. isOnTerminalPath = true → no router.replace() call
//   5. setState({ isChecking: false }) → spinner disappears → page renders
//
// This is correct. The bug was NOT here — it was in ModeGate
// calling onSuccess() after window.location.href, which caused
// the parent component to try updating state after navigation.
//
// The one real improvement here: we skip setting isChecking: true
// on re-checks (tab focus) so the spinner does not flash for
// users who switch tabs. Only the very first check (mount) shows
// the full-screen loader, which is correct UX.
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

const TERMINAL_PATHS = ['/pos', '/kitchen'];
const PUBLIC_PATHS   = ['/login', '/qr'];

export function SessionGuardProvider({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  // Use refs so checkSession never needs to re-create itself
  // when router or pathname change. This is what prevents the
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
  // Accepts a flag so tab-focus re-checks don't show the
  // full-screen spinner (only the initial mount does).
  const checkSession = useCallback(async (showSpinner = false) => {
    // Only show the spinner on the very first load.
    // Re-checks (tab focus) happen silently in the background.
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
        return;
      }

      const data = await res.json();
      const currentPathname = pathnameRef.current;
      const currentRouter   = routerRef.current;

      if (data.type === 'TERMINAL') {
        setState({
          sessionType:    'TERMINAL',
          isChecking:     false,
          terminalMode:   data.mode,
          terminalShopId: data.shopId,
        });

        // Only redirect if we are NOT already on a terminal path.
        // This is the key guard — if ModeGate already navigated us
        // to /pos/:shopId, we are already on a terminal path and
        // no further redirect is needed. Without this check,
        // router.replace() would fire unnecessarily.
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

        // A platform user somehow landed on a terminal path
        // (e.g. bookmark). Redirect them to the dashboard.
        const isOnTerminalPath = TERMINAL_PATHS.some(
          p => currentPathname.startsWith(p)
        );
        if (isOnTerminalPath) {
          currentRouter.replace('/dashboard');
        }

      } else {
        // NONE — no valid session of any kind.
        setState({
          sessionType:    'NONE',
          isChecking:     false,
          terminalMode:   null,
          terminalShopId: null,
        });
      }
    } catch {
      // Network error — clear spinner and let the page render.
      // Individual pages handle their own 401s via axios interceptors.
      setState({
        sessionType:    'NONE',
        isChecking:     false,
        terminalMode:   null,
        terminalShopId: null,
      });
    }
  }, []); // stable reference — no deps needed because we use refs

  // ── Initial mount: show spinner while checking ────────────
  useEffect(() => {
    checkSession(true); // showSpinner = true on first load
  }, [checkSession]);

  // ── Tab focus: silent re-check, no spinner ────────────────
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        checkSession(false); // showSpinner = false — silent
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
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