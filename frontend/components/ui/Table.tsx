// components/ui/Table.tsx
// Reusable table shell with consistent header/body styling.
// Wraps the raw <table> element in the MiniPOS card style.

import React from "react";
import { clsx } from "clsx";

// ── Table container ───────────────────────────────────────

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-white border border-[#D3D1C7] rounded-lg overflow-hidden", className)}>
      <table className="w-full text-[13px]">
        {children}
      </table>
    </div>
  );
}

// ── Table header ──────────────────────────────────────────

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
        {children}
      </tr>
    </thead>
  );
}

// ── Table header cell ─────────────────────────────────────

interface ThProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export function Th({ children, align = "left", className }: ThProps) {
  return (
    <th
      className={clsx(
        "px-4 py-3 font-medium",
        align === "left"   && "text-left",
        align === "right"  && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  );
}

// ── Table body ────────────────────────────────────────────

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

// ── Table row ─────────────────────────────────────────────

interface TrProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Tr({ children, onClick, className }: TrProps) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        "border-b border-[#F1EFE8] last:border-0 transition-colors",
        onClick && "cursor-pointer hover:bg-[#F1EFE8]/40",
        className
      )}
    >
      {children}
    </tr>
  );
}

// ── Table data cell ───────────────────────────────────────

interface TdProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export function Td({ children, align = "left", className }: TdProps) {
  return (
    <td
      className={clsx(
        "px-4 py-3",
        align === "left"   && "text-left",
        align === "right"  && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}