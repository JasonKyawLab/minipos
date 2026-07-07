"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { useSessionGuard } from '@/context/SessionGuardContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isChecking, sessionType } = useSessionGuard();
  const pathname = usePathname();

  const isPublic = pathname === '/' || pathname === '/login' || pathname.startsWith('/qr');
  const showSpinner = !isPublic && (isChecking || sessionType === 'UNKNOWN');

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