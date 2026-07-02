"use client";

import React, { useEffect, useState } from "react";

interface ScreenSizeGateProps {
  minWidth: number;
  minHeight?: number;
  bg?: string;
  children: React.ReactNode;
}

export function ScreenSizeGate({ minWidth, minHeight, bg = "bg-[#0F2B4C]", children }: ScreenSizeGateProps) {
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

  const tooSmall = status === "narrow" || status === "short";

  return (
    <>
      {/* Children stay mounted at all times so sockets/effects are not destroyed on resize */}
      <div style={{ visibility: tooSmall ? "hidden" : undefined }}>
        {children}
      </div>

      {tooSmall && (
        <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 px-6 text-center ${bg}`}>
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
      )}
    </>
  );
}
