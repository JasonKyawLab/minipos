"use client";
// =========================================================
// components/layout/ShopSidebar.tsx — Shop-level sidebar
// =========================================================

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useShop } from "@/context/ShopContext";
import { ShopType } from "@/types";
import toast from "react-hot-toast";
 
function buildNavItems(shopId: string, shopType: ShopType) {
  const base = [
    { href: `/shops/${shopId}/dashboard`, label: "Dashboard", icon: <DashIcon /> },
    { href: `/shops/${shopId}/orders`,    label: "Orders",    icon: <OrderIcon /> },
    { href: `/shops/${shopId}/products`,  label: "Products",  icon: <ProductIcon /> },
    { href: `/shops/${shopId}/staff`,     label: "Staff",     icon: <StaffIcon /> },
    { href: `/shops/${shopId}/reports`,   label: "Reports",   icon: <ReportIcon /> },
    { href: `/shops/${shopId}/settings`,  label: "Settings",  icon: <SettingsIcon /> },
  ];
 
  if (shopType === "RESTAURANT") {
    base.splice(4, 0, {
      href: `/shops/${shopId}/tables`,
      label: "Tables",
      icon: <TableIcon />,
    });
  }
 
  return base;
}
 
export function ShopSidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { logout } = useAuth();
  const { shopId, shopName, shopType } = useShop();
 
  const navItems = buildNavItems(shopId, shopType);
 
  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/login");
  };
 
  return (
    <aside className="w-[180px] shrink-0 bg-white border-r border-ui-greyBorder flex flex-col h-full">
      {/* Shop name */}
      <div className="px-4 py-4 border-b border-ui-greyBorder">
        <p className="text-[13px] text-ui-grey mb-0.5">MiniPOS</p>
        <p className="text-[15px] font-semibold text-brand-navy leading-tight truncate">
          {shopName}
        </p>
      </div>
 
      {/* Mode buttons */}
      <div className="px-3 py-2 border-b border-ui-greyBorder space-y-1">
        {/* POS Mode → /pos/[shopId] (the (pos) route group login page) */}
        <Link
          href={`/pos/${shopId}`}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-brand-navy text-white text-[13px] font-medium hover:bg-brand-navy/90 transition-colors"
        >
          <PosIcon />
          POS Mode
        </Link>
 
        {/* Kitchen Mode → /kitchen/[shopId] (the (kitchen) route group login page) */}
        {shopType === "RESTAURANT" && (
          <Link
            href={`/kitchen/${shopId}`}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-ui-greyLight text-brand-navy text-[13px] font-medium hover:bg-ui-greyBorder transition-colors"
          >
            <KitchenIcon />
            Kitchen Mode
          </Link>
        )}
      </div>
 
      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors mb-0.5",
                isActive
                  ? "bg-ui-greyLight text-brand-navy font-medium"
                  : "text-ui-grey hover:bg-ui-greyLight hover:text-brand-navy"
              )}
            >
              <span className={clsx("shrink-0", isActive && "text-brand-teal")}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
 
      {/* Back to shops + logout */}
      <div className="px-2 py-3 border-t border-ui-greyBorder space-y-0.5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-ui-grey hover:bg-ui-greyLight hover:text-brand-navy transition-colors"
        >
          <BackIcon />
          All Shops
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-ui-grey hover:bg-ui-greyLight hover:text-status-red transition-colors"
        >
          <LogoutIcon />
          Log out
        </button>
      </div>
    </aside>
  );
}
 
// ── Icons ────────────────────────────────────────────────
 
const mk = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
 
const DashIcon     = () => mk("M2 8l6-5 6 5v6H2V8z");
const OrderIcon    = () => mk("M3 2h10v12H3V2zM5 6h6M5 9h4");
const ProductIcon  = () => mk("M8 2l5 3v6L8 14 3 11V5L8 2z");
const StaffIcon    = () => mk("M8 7a3 3 0 100-6 3 3 0 000 6zM2 14c0-3.3 2.7-6 6-6s6 2.7 6 6");
const TableIcon    = () => mk("M2 5h12M5 5v8M11 5v8M2 13h12");
const ReportIcon   = () => mk("M2 14h12M4 14V8M8 14V4M12 14v-6");
const SettingsIcon = () => mk("M8 10a2 2 0 100-4 2 2 0 000 4zM8 2v2M8 12v2M2 8h2M12 8h2");
const PosIcon      = () => mk("M2 3h12v8H2V3zM5 14h6M8 11v3");
const KitchenIcon  = () => mk("M4 2h8l1 6H3L4 2zM2 8h12v6H2V8z");
const BackIcon     = () => mk("M10 4L6 8l4 4");
const LogoutIcon   = () => mk("M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6");
 