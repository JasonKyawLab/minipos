// components/ui/Table.tsx
// Reusable table shell with consistent header/body styling.
// Wraps the raw <table> element in the MiniPOS card style.

import React from "react";
import { clsx } from "clsx";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-white border border-[#D3D1C7] rounded-lg overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
        {children}
      </tr>
    </thead>
  );
}

interface ThProps {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export function Th({ children, align = "left", className }: ThProps) {
  return (
    <th
      className={clsx(
        "px-4 py-3 font-medium whitespace-nowrap",
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

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

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

interface TdProps {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
  className?: string;
}

export function Td({ children, align = "left", colSpan, className }: TdProps) {
  return (
    <td
      colSpan={colSpan}
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