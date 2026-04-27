// Path: frontend/app/(shop)/shops/[shopId]/layout.tsx

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShopProvider } from "@/context/ShopContext";
import { ShopSidebar } from "@/components/layout/ShopSidebar";
import type { ShopType, Currency, ShopRole } from "@/types";

interface ShopMemberData {
  shopId:   string;
  shopName: string;
  shopType: ShopType;
  currency: Currency;
  taxRate:  number;
  userRole: ShopRole;
}

async function getShopContext(shopId: string): Promise<ShopMemberData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  // No token → middleware should have redirected, but guard anyway
  if (!token) return null;

  try {
    const res = await fetch(
      `${process.env.API_URL ?? "http://localhost:3001"}/api/users/me/shops`,
      {
        headers: { Cookie: `access_token=${token}` },
        // No caching — always fetch fresh data so role changes reflect immediately
        cache: "no-store",
      }
    );

    if (!res.ok) return null;

    const shops: Array<{
      shopId:   string;
      shopName: string;
      shopType: ShopType;
      currency: Currency;
      role:     ShopRole;
    }> = await res.json();

    // Find the shop that matches the URL param
    const shop = shops.find((s) => s.shopId === shopId);
    if (!shop) return null;

    return {
      shopId:   shop.shopId,
      shopName: shop.shopName,
      shopType: shop.shopType,
      currency: shop.currency,
      taxRate:  0,     // fetched per-page if needed; layout doesn't need it
      userRole: shop.role,
    };
  } catch (err) {
    // Network error or backend down
    console.error("[ShopLayout] Failed to load shop context:", err);
    return null;
  }
}

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const shopContext = await getShopContext(shopId);

  // Not a member of this shop → send back to shop list
  if (!shopContext) {
    redirect("/dashboard");
  }

  return (
    <ShopProvider value={shopContext}>
      <div className="flex h-screen overflow-hidden bg-[#F1EFE8]">
        <ShopSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 max-w-[1200px]">
            {children}
          </div>
        </main>
      </div>
    </ShopProvider>
  );
}