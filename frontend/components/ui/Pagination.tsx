"use client";

import React from "react";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function Pagination({ meta, onPageChange }: PaginationProps) {
  if (meta.totalCount === 0) return null;

  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.totalCount);

  return (
    <div className="flex items-center justify-between mt-4 text-[13px] text-[#5F5E5A]">
      <span>
        Showing {from}–{to} of {meta.totalCount}
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(meta.page - 1)}
          disabled={!meta.hasPrev}
          className="px-3 h-8 border border-[#D3D1C7] rounded-lg disabled:opacity-40 hover:bg-[#F1EFE8] transition"
        >
          Prev
        </button>
        <span className="px-2">
          Page {meta.page} of {meta.totalPages}
        </span>
        <button
          onClick={() => onPageChange(meta.page + 1)}
          disabled={!meta.hasNext}
          className="px-3 h-8 border border-[#D3D1C7] rounded-lg disabled:opacity-40 hover:bg-[#F1EFE8] transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}