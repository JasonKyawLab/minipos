"use client";

import React, { useState, useEffect } from "react";
import Link                         from "next/link";
import Image                        from "next/image";
import { usePathname, useRouter }   from "next/navigation";
import { clsx }                     from "clsx";
import { useAuth }                  from "@/context/AuthContext";
import { useShop }                  from "@/context/ShopContext";
import { ModeGate }                 from "@/components/mode/ModeGate";
import { ShopType, ShopRole }       from "@/types";
import api                          from "@/lib/api";
import toast                        from "react-hot-toast";

type PendingMode = "POS" | "KITCHEN" | null;

const PENDING_DEVICE_POLL_MS = 20_000;

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ReactNode;
  roles: ShopRole[];
  badgeCount?: number;
}

function buildNavItems(shopId: string, shopType: ShopType, pendingDeviceCount: number): NavItem[] {
  const items: NavItem[] = [
    { href: `/shops/${shopId}/dashboard`, label: "Dashboard", icon: <DashIcon />, roles: ["OWNER", "MANAGER"] },
    { href: `/shops/${shopId}/orders`,    label: "Orders",    icon: <OrderIcon />, roles: ["OWNER", "MANAGER"] },
    { href: `/shops/${shopId}/products`,  label: "Products",  icon: <ProductIcon />, roles: ["OWNER", "MANAGER"] },
    { href: `/shops/${shopId}/staff`,     label: "Staff",     icon: <StaffIcon />, roles: ["OWNER", "MANAGER"] },
    { href: `/shops/${shopId}/reports`,   label: "Reports",   icon: <ReportIcon />, roles: ["OWNER", "MANAGER"] },
    {
      href:  `/shops/${shopId}/worklog`,
      label: "Work Log",
      icon:  <WorkLogIcon />,
      roles: ["OWNER", "MANAGER", "CASHIER", "CHEF"],
    },
    { href: `/shops/${shopId}/settings`, label: "Settings", icon: <SettingsIcon />, roles: ["OWNER", "MANAGER"] },
    {
      href:  `/shops/${shopId}/permission`,
      label: "Permissions",
      icon:  <PermIcon />,
      roles: ["OWNER"],
      badgeCount: pendingDeviceCount,
    },
  ];

  if (shopType === "RESTAURANT") {
    items.splice(3, 0, {
      href:  `/shops/${shopId}/tables`,
      label: "Tables",
      icon:  <TableIcon />,
      roles: ["OWNER", "MANAGER"],
    });
  }

  return items;
}

export function ShopSidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { logout } = useAuth();
  const { shopId, shopName, shopType, userRole } = useShop();
  const [pendingMode, setPendingMode] = useState<PendingMode>(null);
  const [pendingDeviceCount, setPendingDeviceCount] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (userRole !== "OWNER") return;

    let cancelled = false;

    async function fetchCount() {
      try {
        const { data } = await api.get<{ count: number }>(
          `/api/shops/${shopId}/devices/pending-count`
        );
        if (!cancelled) setPendingDeviceCount(data.count);
      } catch {
        // Silent — a missed badge update for one tick isn't worth a toast.
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, PENDING_DEVICE_POLL_MS);

    window.addEventListener("device-permission-changed", fetchCount);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("device-permission-changed", fetchCount);
    };
  }, [shopId, userRole]);

  const navItems     = buildNavItems(shopId, shopType, pendingDeviceCount);
  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  const canEnterPosMode     = userRole === "OWNER" || userRole === "MANAGER";
  const canEnterKitchenMode = userRole === "OWNER" || userRole === "MANAGER" || userRole === "CHEF";

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/login");
  };

  function handleGateSuccess() {
    setPendingMode(null);
    if (pendingMode === "POS") {
      router.push(`/pos/${shopId}`);
    } else if (pendingMode === "KITCHEN") {
      router.push(`/kitchen/${shopId}`);
    }
  }

  function handleKitchenClick() {
    if (userRole === "CHEF") {
      router.push(`/kitchen/${shopId}`);
    } else {
      setPendingMode("KITCHEN");
    }
  }

  return (
    <>
      <aside
        className={clsx(
          "shrink-0 bg-white border-r border-ui-greyBorder flex flex-col h-full overflow-hidden",
          "transition-[width] duration-200 ease-in-out",
          expanded ? "w-[220px]" : "w-14"
        )}
      >
        {/* Top: hamburger (collapsed) / shop name + close (expanded) */}
        <div className="h-12 flex items-center border-b border-ui-greyBorder shrink-0">
          {expanded ? (
            <div className="w-full px-3 flex items-center justify-between">
              <div className="min-w-0">
                <Image src="/logo.png" alt="MiniPOS" width={90} height={24} className="object-contain mb-0.5" />
                <p className="text-[14px] font-semibold text-brand-navy leading-tight truncate">{shopName}</p>
              </div>
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

        {/* Role */}
        <div className={clsx("px-4 py-2 border-b border-ui-greyBorder shrink-0", !expanded && "flex justify-center px-0")}>
          {expanded ? (
            <RolePill role={userRole} />
          ) : (
            <p className="text-[11px] font-semibold text-brand-navy">{userRole.charAt(0)}</p>
          )}
        </div>

        {/* Mode buttons */}
        {/*
          CHANGED: icons inside these two buttons now render larger
          (20px instead of 16px) when the sidebar is collapsed.
          When collapsed, these buttons shrink to icon-only squares
          and the previous fixed 16px icon looked visually small and
          cramped inside the solid-color box compared to the regular
          nav icons below (which sit on a transparent background and
          read fine small). Padding also shifts slightly in the
          collapsed state (py-2 -> py-2.5) so the larger icon has
          proper breathing room instead of touching the button edges.
        */}
        {(canEnterPosMode || canEnterKitchenMode) && (
          <div className="px-3 py-2 border-b border-ui-greyBorder space-y-1 shrink-0">
            {canEnterPosMode && (
              <button
                onClick={() => setPendingMode("POS")}
                title="POS Mode"
                className={clsx(
                  "flex items-center gap-2 w-full rounded-md bg-brand-navy text-white text-[13px] font-medium hover:bg-brand-navy/90 transition-colors whitespace-nowrap",
                  expanded ? "px-3 py-2" : "px-2 py-2.5 justify-center"
                )}
              >
                <PosIcon large={!expanded} />
                {expanded && "POS Mode"}
              </button>
            )}
            {canEnterKitchenMode && shopType === "RESTAURANT" && (
              <button
                onClick={handleKitchenClick}
                title="Kitchen Mode"
                className={clsx(
                  "flex items-center gap-2 w-full rounded-md bg-[#1C2B3A] text-white text-[13px] font-medium hover:bg-[#253646] transition-colors whitespace-nowrap",
                  expanded ? "px-3 py-2" : "px-2 py-2.5 justify-center"
                )}
              >
                <KitchenIcon large={!expanded} />
                {expanded && "Kitchen Mode"}
              </button>
            )}
          </div>
        )}

        {/* Nav items — filtered by role */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={clsx(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors mb-0.5 whitespace-nowrap",
                  !expanded && "justify-center",
                  isActive
                    ? "bg-ui-greyLight text-brand-navy font-medium"
                    : "text-ui-grey hover:bg-ui-greyLight hover:text-brand-navy"
                )}
              >
                <span className={clsx("shrink-0 relative", isActive && "text-brand-teal")}>
                  {item.icon}
                  {!expanded && !!item.badgeCount && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-status-red" />
                  )}
                </span>
                {expanded && item.label}
                {expanded && !!item.badgeCount && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-status-red text-white text-[10px] font-semibold leading-none">
                    {item.badgeCount > 9 ? "9+" : item.badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Back + logout */}
        <div className="px-2 py-3 border-t border-ui-greyBorder space-y-0.5 shrink-0">
          <Link
            href="/dashboard"
            title="All Shops"
            className={clsx(
              "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-ui-grey hover:bg-ui-greyLight hover:text-brand-navy transition-colors whitespace-nowrap",
              !expanded && "justify-center"
            )}
          >
            <BackIcon />
            {expanded && "All Shops"}
          </Link>
          <button
            onClick={handleLogout}
            title="Log out"
            className={clsx(
              "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-ui-grey hover:bg-ui-greyLight hover:text-status-red transition-colors whitespace-nowrap",
              !expanded && "justify-center"
            )}
          >
            <LogoutIcon />
            {expanded && "Log out"}
          </button>
        </div>
      </aside>

      {pendingMode && (
        <ModeGate
          shopId={shopId}
          shopName={shopName}
          mode={pendingMode}
          action="enter"
          allowCancel={true}
          onSuccess={handleGateSuccess}
          onCancel={() => setPendingMode(null)}
        />
      )}
    </>
  );
}

// ── Role pill ─────────────────────────────────────────────

function RolePill({ role }: { role: ShopRole }) {
  const styles: Record<ShopRole, string> = {
    OWNER:   "bg-[#EEEDFE] text-[#534AB7]",
    MANAGER: "bg-[#FAEEDA] text-[#BA7517]",
    CASHIER: "bg-[#E1F5EE] text-[#0D7A5F]",
    CHEF:    "bg-[#0F2B4C]/10 text-[#0F2B4C]",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded ${styles[role]}`}>
      {role}
    </span>
  );
}

// ── Icons ─────────────────────────────────────────────────

// CHANGED: mk() now accepts an optional `size` (defaults to 16,
// unchanged for every existing call site). Only PosIcon/KitchenIcon
// pass a custom size, via their new `large` prop.
const mk = (d: string, size: number = 16) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 6l6-4 6 4v8H2V6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M6 14v-4h4v4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);
const OrderIcon    = () => mk("M3 2h10v12H3V2zM5 6h6M5 9h4");
const ProductIcon  = () => mk("M8 2l5 3v6L8 14 3 11V5L8 2z");
const StaffIcon    = () => mk("M8 7a3 3 0 100-6 3 3 0 000 6zM2 14c0-3.3 2.7-6 6-6s6 2.7 6 6");
const TableIcon    = () => mk("M2 5h12M5 5v8M11 5v8M2 13h12");
const ReportIcon   = () => mk("M2 14h12M4 14V8M8 14V4M12 14v-6");
const SettingsIcon = () => mk("M8 10a2 2 0 100-4 2 2 0 000 4zM8 2v2M8 12v2M2 8h2M12 8h2");
const PermIcon     = () => mk("M8 2l-5 3v4c0 3 2.5 5.5 5 6.5 2.5-1 5-3.5 5-6.5V5L8 2zM6 8l1.5 1.5L10 6");

// CHANGED: PosIcon/KitchenIcon now take a `large` flag. Passed as
// `large={!expanded}` from the buttons above, so the icon renders
// at 20px when the sidebar is collapsed (icon-only button) and the
// normal 16px when expanded (icon sits next to a text label).
const PosIcon      = ({ large = false }: { large?: boolean }) =>
  mk("M2 3h12v8H2V3zM5 14h6M8 11v3", large ? 20 : 16);
const KitchenIcon  = ({ large = false }: { large?: boolean }) =>
  mk("M4 2h8l1 6H3L4 2zM2 8h12v6H2V8z", large ? 20 : 16);

const BackIcon     = () => mk("M10 4L6 8l4 4");
const LogoutIcon   = () => mk("M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6");
const WorkLogIcon  = () => mk("M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3.5l2.5 1.5");