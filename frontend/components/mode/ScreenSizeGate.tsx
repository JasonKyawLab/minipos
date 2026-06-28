"use client";
// =========================================================
// components/mode/ScreenSizeGate.tsx
//
// Checks both width and height — a landscape phone can pass
// a width-only check (e.g. 812×375) while still being far too
// short for POS's cart panel + checkout button to be usable.
// Width and height failures get different advice: rotating
// helps a width problem, but does nothing for a height problem
// on a device that's already landscape — that device just isn't
// tall enough, full stop.
// =========================================================

import React, { useEffect, useState } from "react";

interface ScreenSizeGateProps {
  minWidth: number;
  minHeight?: number;
  children: React.ReactNode;
}

export function ScreenSizeGate({ minWidth, minHeight, children }: ScreenSizeGateProps) {
  // null = not measured yet, avoids a flash of the warning on first paint
  const [status, setStatus] = useState<"ok" | "narrow" | "short" | null>(null);

  useEffect(() => {
    function check() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < minWidth) setStatus("narrow");
      else if (minHeight && h < minHeight) setStatus("short");
      else setStatus("ok");
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [minWidth, minHeight]);

  if (status === null) return null;
  if (status === "ok") return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-[#0F2B4C]">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-white/40">
        <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-white text-[16px] font-semibold">Screen too small</p>
      <p className="text-white/50 text-[13px] max-w-[280px]">
        {status === "narrow"
          ? `This screen needs at least ${minWidth}px of width. Please widen your browser window, rotate your device to landscape, or use a larger screen.`
          : `This screen needs at least ${minHeight}px of height. Rotating won't help here — please use a device with a taller display.`}
      </p>
    </div>
  );
}