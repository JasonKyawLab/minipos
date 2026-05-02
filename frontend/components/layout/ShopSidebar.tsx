"use client";

import React, { useState }         from "react";
import Link                         from "next/link";
import { usePathname, useRouter }   from "next/navigation";
import { clsx }                     from "clsx";
import { useAuth }                  from "@/context/AuthContext";
import { useShop }                  from "@/context/ShopContext";
import { ModeGate }                 from "@/components/mode/ModeGate";
import { ShopType, ShopRole }       from "@/types";
import toast                        from "react-hot-toast";

type PendingMode = "POS" | "KITCHEN" | null;

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ReactNode;
  /** Which roles can see this nav item */
  roles: ShopRole[];
}

function buildNavItems(shopId: string, shopType: ShopType): NavItem[] {
  const items: NavItem[] = [
    {
      href:  `/shops/${shopId}/dashboard`,
      label: "Dashboard",
      icon:  <DashIcon />,
      // FIX: Added CHEF — chefs can see the dashboard
      roles: ["OWNER", "MANAGER", "CASHIER", "CHEF"],
    },
    {
      href:  `/shops/${shopId}/orders`,
      label: "Orders",
      icon:  <OrderIcon />,
      roles: ["OWNER", "MANAGER", "CASHIER"],
    },
    {
      href:  `/shops/${shopId}/products`,
      label: "Products",
      icon:  <ProductIcon />,
      roles: ["OWNER", "MANAGER", "CASHIER"],
    },
    {
      href:  `/shops/${shopId}/staff`,
      label: "Staff",
      icon:  <StaffIcon />,
      roles: ["OWNER", "MANAGER"],
    },
    {
      href:  `/shops/${shopId}/reports`,
      label: "Reports",
      icon:  <ReportIcon />,
      roles: ["OWNER", "MANAGER"],
    },
    {
      // FIX: "Work Log" — friendly name visible to ALL roles.
      // CHEF and CASHIER only see their own shifts.
      // OWNER and MANAGER see all staff shifts.
      href:  `/shops/${shopId}/worklog`,
      label: "Work Log",
      icon:  <WorkLogIcon />,
      roles: ["OWNER", "MANAGER", "CASHIER", "CHEF"],
    },
    {
      href:  `/shops/${shopId}/settings`,
      label: "Settings",
      icon:  <SettingsIcon />,
      roles: ["OWNER", "MANAGER"],
    },
    {
      href:  `/shops/${shopId}/permission`,
      label: "Permissions",
      icon:  <PermIcon />,
      roles: ["OWNER"],
    },
  ];

  // Tables only for restaurants
  if (shopType === "RESTAURANT") {
    // Insert after Orders
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

  const navItems     = buildNavItems(shopId, shopType);
  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  // OWNER and MANAGER activate modes from the sidebar (password gate).
  // CHEF goes directly to kitchen login (they don't own the device).
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

  // CHEF clicks Kitchen Mode → skip the password gate and go directly
  // to the staff selection screen (they use a PIN there instead).
  function handleKitchenClick() {
    if (userRole === "CHEF") {
      router.push(`/kitchen/${shopId}`);
    } else {
      setPendingMode("KITCHEN");
    }
  }

  return (
    <>
      <aside className="w-[180px] shrink-0 bg-white border-r border-ui-greyBorder flex flex-col h-full">

        {/* Shop name + role */}
        <div className="px-4 py-4 border-b border-ui-greyBorder">
          <p className="text-[11px] text-ui-grey uppercase tracking-wide mb-0.5">MiniPOS</p>
          <p className="text-[14px] font-semibold text-brand-navy leading-tight truncate">
            {shopName}
          </p>
          <RolePill role={userRole} />
        </div>

        {/* Mode buttons */}
        {(canEnterPosMode || canEnterKitchenMode) && (
          <div className="px-3 py-2 border-b border-ui-greyBorder space-y-1">
            {/* POS Mode — OWNER and MANAGER only */}
            {canEnterPosMode && (
              <button
                onClick={() => setPendingMode("POS")}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-brand-navy text-white text-[13px] font-medium hover:bg-brand-navy/90 transition-colors"
              >
                <PosIcon />
                POS Mode
              </button>
            )}

            {/* Kitchen Mode — OWNER, MANAGER, and CHEF */}
            {canEnterKitchenMode && shopType === "RESTAURANT" && (
              <button
                onClick={handleKitchenClick}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-[#1C2B3A] text-white text-[13px] font-medium hover:bg-[#253646] transition-colors"
                >
                  <KitchenIcon />
                  Kitchen Mode
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

        {/* Back + logout */}
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

      {/* Password gate — only for POS/KITCHEN mode entry by OWNER/MANAGER */}
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
  // FIX: Added CHEF style — was missing, causing TypeScript error
  const styles: Record<ShopRole, string> = {
    OWNER:   "bg-[#EEEDFE] text-[#534AB7]",
    MANAGER: "bg-[#FAEEDA] text-[#BA7517]",
    CASHIER: "bg-[#E1F5EE] text-[#0D7A5F]",
    CHEF:    "bg-[#0F2B4C]/10 text-[#0F2B4C]",
  };
  return (
    <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-medium rounded ${styles[role]}`}>
      {role}
    </span>
  );
}

// ── Icons ─────────────────────────────────────────────────

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
const PermIcon     = () => mk("M8 2l-5 3v4c0 3 2.5 5.5 5 6.5 2.5-1 5-3.5 5-6.5V5L8 2zM6 8l1.5 1.5L10 6");
const PosIcon      = () => mk("M2 3h12v8H2V3zM5 14h6M8 11v3");
const KitchenIcon  = () => mk("M4 2h8l1 6H3L4 2zM2 8h12v6H2V8z");
const BackIcon     = () => mk("M10 4L6 8l4 4");
const LogoutIcon   = () => mk("M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6");
// FIX: Added WorkLogIcon — clock with a checkmark feel
const WorkLogIcon  = () => mk("M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3.5l2.5 1.5");