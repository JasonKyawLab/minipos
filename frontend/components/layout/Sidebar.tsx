"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "My Shops",
    exact: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 6l6-4 6 4v8H2V6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M6 14v-4h4v4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/login");
  };

  return (
    <aside
      className={clsx(
        "shrink-0 bg-white border-r border-ui-greyBorder flex flex-col h-full overflow-hidden",
        "transition-[width] duration-200 ease-in-out",
        expanded ? "w-[220px]" : "w-14"
      )}
    >
      {/* Top: hamburger (collapsed) / brand + close (expanded) */}
      <div className="h-12 flex items-center border-b border-ui-greyBorder shrink-0">
        {expanded ? (
          <div className="w-full px-3 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-brand-navy whitespace-nowrap">MiniPOS</span>
            <button
              onClick={() => setExpanded(false)}
              aria-label="Close menu"
              className="p-1.5 rounded-md text-ui-grey hover:bg-ui-greyLight shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            aria-label="Open menu"
            className="w-full h-full flex items-center justify-center text-ui-grey hover:bg-ui-greyLight transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* User info */}
      <div className="px-3 py-3 border-b border-ui-greyBorder shrink-0">
        <div className={clsx("flex items-center gap-2", !expanded && "justify-center")}>
          <div className="w-8 h-8 rounded-full bg-brand-teal flex items-center justify-center shrink-0">
            <span className="text-white text-[12px] font-semibold">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </span>
          </div>
          {expanded && (
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ui-nearBlack truncate">{user?.name}</p>
              <p className="text-[11px] text-ui-grey">{user?.role}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors mb-0.5 whitespace-nowrap",
                !expanded && "justify-center",
                isActive
                  ? "bg-ui-greyLight text-brand-navy font-medium [&>svg]:text-brand-teal"
                  : "text-ui-grey hover:bg-ui-greyLight hover:text-brand-navy"
              )}
            >
              <span className={clsx("shrink-0", isActive && "text-brand-teal")}>
                {item.icon}
              </span>
              {expanded && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 py-3 border-t border-ui-greyBorder shrink-0">
        <button
          onClick={handleLogout}
          title="Log out"
          className={clsx(
            "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-ui-grey hover:bg-ui-greyLight hover:text-status-red transition-colors whitespace-nowrap",
            !expanded && "justify-center"
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {expanded && "Log out"}
        </button>
      </div>
    </aside>
  );
}