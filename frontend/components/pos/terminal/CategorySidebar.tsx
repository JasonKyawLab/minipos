"use client";

import React from "react";
import type { CategoryTab } from "@/types/pos";

interface Props {
  categories:     CategoryTab[];
  activeCategory: string;
  onSelect:       (id: string) => void;
}

export function CategorySidebar({ categories, activeCategory, onSelect }: Props) {
  return (
    <aside className="w-[190px] border-r border-white/10 flex flex-col overflow-y-auto shrink-0 py-3 gap-1 px-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition ${
            activeCategory === cat.id
              ? "bg-white/15 text-white"
              : "text-white/40 hover:bg-white/10 hover:text-white/70"
          }`}
        >
          {cat.label}
          <span className="ml-1.5 text-white/25 text-[13px]">({cat.count})</span>
        </button>
      ))}
    </aside>
  );
}
