"use client";
// =========================================================
// components/layout/AdminSidebar.tsx
// Path: frontend/components/layout/AdminSidebar.tsx
//
// Dedicated sidebar for the ADMIN role. Kept separate from the
// owner's Sidebar on purpose — admin is a platform-operator role,
// not a "super owner" role, so it should never show shop-scoped
// nav (Orders, Products, Tables, Settings, Reports).
//
// FIXED: added z-50 so this sidebar always renders above any
// content that scrolls horizontally in <main> (e.g. wide tables).
// Without an explicit z-index, a fixed sidebar with no stacking
// context can end up visually underneath scrolled content that
// has its own (even implicit) stacking context.
// =========================================================
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Users", href: "/admin/users" },
  { label: "Shops", href: "/admin/shops" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-[180px] h-screen bg-[#0F2B4C] text-white flex flex-col fixed left-0 top-0 z-50">
      <div className="px-4 py-5 border-b border-white/10">
        <p className="text-[11px] uppercase tracking-wide text-white/50">
          Platform Admin
        </p>
        <p className="text-[13px] font-medium truncate">{user?.name}</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-[13px] transition ${
                active ? "bg-white/15 font-medium" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-4 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-white/70 hover:bg-white/10 transition"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}