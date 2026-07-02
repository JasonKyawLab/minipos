import React from "react";
import { ScreenSizeGate } from "@/components/mode/ScreenSizeGate";

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <ScreenSizeGate minWidth={640} minHeight={420} bg="bg-[#0A0A0A]">
        {children}
      </ScreenSizeGate>
    </div>
  );
}