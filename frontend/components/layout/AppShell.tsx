"use client";
// =========================================================
// components/layout/AppShell.tsx
//
// FIX: The previous version used a conditional early return
// which caused "Rendered more hooks than during the previous
// render" because Next.js Router calls hooks AFTER AppShell
// in the tree. When AppShell switches between returning a
// spinner vs returning children, the hook count seen by the
// Router changes between renders.
//
// Solution: Always render children. Use CSS visibility to
// hide them during the loading state instead of unmounting.
// This keeps the React tree structure stable across renders.
// =========================================================

import React from 'react';
import { useSessionGuard } from '@/context/SessionGuardContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isChecking, sessionType } = useSessionGuard();

  const showSpinner = isChecking || sessionType === 'UNKNOWN';

  return (
    <>
      {/* Spinner — shown during session check */}
      {showSpinner && (
        <div
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         9999,
            background:     '#F1EFE8',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexDirection:  'column',
            gap:            '12px',
          }}
        >
          <div
            style={{
              width:       '24px',
              height:      '24px',
              border:      '2px solid #D3D1C7',
              borderTop:   '2px solid #0D7A5F',
              borderRadius:'50%',
              animation:   'spin 0.8s linear infinite',
            }}
          />
          <p style={{ fontSize: '13px', color: '#5F5E5A', margin: 0 }}>
            Loading…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/*
        FIX: Children are ALWAYS rendered — never conditionally removed.
        We use visibility + pointer-events to hide them during loading.
        This keeps the React hook tree stable and prevents the
        "Rendered more hooks than during the previous render" error.
      */}
      <div
        style={{
          visibility:    showSpinner ? 'hidden' : 'visible',
          pointerEvents: showSpinner ? 'none'   : 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}