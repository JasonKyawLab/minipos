"use client";
// =========================================================
// app/(qr)/qr/[token]/page.tsx
//
// Customer-facing public menu.
// No login required — uses the table QR token to load
// the menu and submit an order.
//
// Layout:
//   - Sticky header: shop name + table number
//   - Sticky category tab bar (horizontal scroll)
//   - Products grouped by category with section headings
//   - Each product card: name, description, variant rows
//   - Customisation bottom sheet for modifiers
//   - Fixed bottom bar: cart count + total + Place Order
//   - Cart drawer (slides up) for review before placing
//
// Why category tabs here (not a sidebar)?
//   This is a mobile page. A left sidebar like POS would
//   eat 40% of the screen width. Horizontal tabs at the top
//   are the standard mobile pattern (e.g. food delivery apps).
//   Tapping a tab smooth-scrolls to that section.
// =========================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/utils/formatCurrency";
import type { PublicMenuItem, PublicMenuItemVariant, PublicModifierGroup, Currency } from "@/types";

// ── Local types ───────────────────────────────────────────

interface CartEntry {
  key: string;           // variantId + mod ids + note — dedup key
  variantId: string;
  productName: string;
  variantName: string;
  unitPrice: number;     // base price + modifier deltas
  qty: number;
  modifiers: { modifier_option_id: string; name: string; price_delta: number }[];
  note: string;
}

interface TableInfo {
  table_number: string;
  shop_name: string;
  currency: Currency;
  menu: PublicMenuItem[];
}

interface CategorySection {
  id: string;            // category_id or "uncategorised"
  label: string;
  color: string | null;
  products: PublicMenuItem[];
}

// ── Cart key helper ───────────────────────────────────────
// Same dedup logic as POS: variant + sorted mod option IDs + note.
function makeCartKey(
  variantId: string,
  modifiers: { modifier_option_id: string }[],
  note: string
): string {
  const modStr = [...modifiers]
    .map((m) => m.modifier_option_id)
    .sort()
    .join(",");
  return `${variantId}|${modStr}|${note}`;
}

// =========================================================
// PAGE
// =========================================================

export default function QrMenuPage() {
  const { token } = useParams<{ token: string }>();
  const router    = useRouter();

  // ── Data ──────────────────────────────────────────────
  const [info, setInfo]       = useState<TableInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // ── Cart ──────────────────────────────────────────────
  const [cart, setCart]         = useState<CartEntry[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing]   = useState(false);
  const [customerName, setCustomerName] = useState("");

  // ── Category tabs ─────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const tabBarRef  = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Customisation sheet ───────────────────────────────
  const [sheetProduct, setSheetProduct]   = useState<PublicMenuItem | null>(null);
  const [sheetVariant, setSheetVariant]   = useState<PublicMenuItemVariant | null>(null);
  const [selectedMods, setSelectedMods]   = useState<Record<string, string[]>>({});
  const [itemNote, setItemNote]           = useState("");

  // ── Fetch menu ────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/menu`
        );
        if (!res.ok) throw new Error((await res.json()).message ?? "NOT_FOUND");
        const data: TableInfo = await res.json();
        setInfo(data);
      } catch (err: any) {
        setError(err.message ?? "Table not found.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // ── Build category sections ───────────────────────────
  // Mirrors the POS categorisedMenu useMemo, adapted for mobile:
  // we produce ordered CategorySection[] instead of a sidebar list.
  const sections = useMemo((): CategorySection[] => {
    if (!info) return [];

    const map = new Map<string, CategorySection>();

    // "All" virtual section — always first
    map.set("all", { id: "all", label: "All", color: null, products: [...info.menu] });

    // Group products by category, preserving category sort_order
    const catOrder: { id: string; sortOrder: number }[] = [];

    for (const product of info.menu) {
      const catId    = product.category_id    ?? "uncategorised";
      const catLabel = product.category_name  ?? "Uncategorised";
      const catColor = product.category_color ?? null;
      const catSort  = product.category_sort_order ?? 999;

      if (!map.has(catId)) {
        map.set(catId, { id: catId, label: catLabel, color: catColor, products: [] });
        catOrder.push({ id: catId, sortOrder: catSort });
      }
      map.get(catId)!.products.push(product);
    }

    // Sort categories by sort_order, uncategorised always last
    catOrder.sort((a, b) => {
      if (a.id === "uncategorised") return 1;
      if (b.id === "uncategorised") return -1;
      return a.sortOrder - b.sortOrder;
    });

    // Build final array: All + sorted categories
    return [
      map.get("all")!,
      ...catOrder.map((c) => map.get(c.id)!),
    ];
  }, [info]);

  // ── Tab click: scroll the section into view ───────────
  function handleTabClick(catId: string) {
    setActiveCategory(catId);

    if (catId === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const el = sectionRefs.current[catId];
    if (el) {
      // Offset for sticky header (56px) + sticky tab bar (44px)
      const offset = 56 + 44 + 8;
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }

    // Scroll the active tab into view in the tab bar
    const tabBar = tabBarRef.current;
    const tabEl  = tabBar?.querySelector<HTMLButtonElement>(`[data-cat="${catId}"]`);
    if (tabEl && tabBar) {
      const left = tabEl.offsetLeft - tabBar.clientWidth / 2 + tabEl.clientWidth / 2;
      tabBar.scrollTo({ left, behavior: "smooth" });
    }
  }

  // ── Update active tab on scroll ───────────────────────
  // IntersectionObserver: whichever section is most visible
  // drives the active tab highlight.
  useEffect(() => {
    if (sections.length <= 1) return;

    const observers: IntersectionObserver[] = [];
    const visibilityMap = new Map<string, number>();

    sections.forEach(({ id }) => {
      if (id === "all") return;
      const el = sectionRefs.current[id];
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          visibilityMap.set(id, entry.intersectionRatio);
          // Pick the most visible section
          let best = "all";
          let bestRatio = 0;
          visibilityMap.forEach((ratio, catId) => {
            if (ratio > bestRatio) { bestRatio = ratio; best = catId; }
          });
          if (bestRatio > 0) setActiveCategory(best);
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1.0], rootMargin: "-100px 0px -40% 0px" }
      );

      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [sections]);

  // ── Customisation sheet ───────────────────────────────
  function openSheet(product: PublicMenuItem, variant: PublicMenuItemVariant) {
    if (!variant.is_active || variant.is_sold_out) return;
    setSheetProduct(product);
    setSheetVariant(variant);
    setSelectedMods({});
    setItemNote("");
  }

  function handleModToggle(group: PublicModifierGroup, optionId: string) {
    setSelectedMods((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max_select === 1) {
        // Radio behaviour
        return { ...prev, [group.id]: [optionId] };
      }
      const already = current.includes(optionId);
      if (already) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= group.max_select) return prev; // at limit
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function isSheetValid(): boolean {
    if (!sheetProduct) return false;
    for (const group of sheetProduct.modifier_groups) {
      if (group.is_required) {
        const chosen = selectedMods[group.id] ?? [];
        if (chosen.length < group.min_select) return false;
      }
    }
    return true;
  }

  function confirmSheet() {
    if (!sheetProduct || !sheetVariant || !isSheetValid()) return;

    const chosenMods = sheetProduct.modifier_groups.flatMap((group) =>
      (selectedMods[group.id] ?? []).map((optId) => {
        const opt = group.options.find((o) => o.id === optId)!;
        return { modifier_option_id: opt.id, name: opt.name, price_delta: opt.price_delta };
      })
    );

    addToCart(sheetProduct, sheetVariant, chosenMods, itemNote.trim());
    setSheetProduct(null);
    setSheetVariant(null);
  }

  // ── Cart helpers ──────────────────────────────────────
  function addToCart(
    product: PublicMenuItem,
    variant: PublicMenuItemVariant,
    modifiers: { modifier_option_id: string; name: string; price_delta: number }[],
    note: string
  ) {
    const unitPrice = variant.price + modifiers.reduce((s, m) => s + m.price_delta, 0);
    const key       = makeCartKey(variant.id, modifiers, note);

    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => l.key === key ? { ...l, qty: l.qty + 1 } : l);
      }
      return [
        ...prev,
        {
          key,
          variantId:   variant.id,
          productName: product.product_name,
          variantName: variant.name,
          unitPrice,
          qty:         1,
          modifiers,
          note,
        },
      ];
    });
  }

  function updateCartQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => l.key === key ? { ...l, qty: l.qty + delta } : l)
        .filter((l) => l.qty > 0)
    );
  }

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const currency  = info?.currency ?? "THB";

  // ── Place order ───────────────────────────────────────
  async function handlePlaceOrder() {
    if (cart.length === 0 || placing) return;
    setPlacing(true);
    try {
      const body = {
        customer_name: customerName.trim() || undefined,
        items: cart.map((l) => ({
          product_item_id: l.variantId,
          qty:             l.qty,
          modifiers:       l.modifiers,
          item_note:       l.note || undefined,
        })),
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/orders`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "ORDER_FAILED");
      }

      const { order_id } = await res.json();
      router.push(`/qr/${token}/table/orders`);
    } catch (err: any) {
      alert(getErrorMessage(err.message));
    } finally {
      setPlacing(false);
    }
  }

  // ── Loading / error states ────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[14px] text-[#5F5E5A]">Loading menu…</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-[18px] font-medium text-[#0F2B4C] mb-2">Table not found</p>
          <p className="text-[13px] text-[#5F5E5A]">
            This QR code may be invalid or the table may be inactive.
          </p>
        </div>
      </div>
    );
  }

  // ── Sections to render (skip "All" — it's tab-only) ──
  const renderSections = sections.filter((s) => s.id !== "all");

  // =========================================================
  // RENDER
  // =========================================================
  return (
    <div className="min-h-screen bg-[#F9F8F5] pb-28">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E8E6E0] px-4 py-3">
        <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wider font-medium">
          {info.shop_name}
        </p>
        <h1 className="text-[17px] font-semibold text-[#0F2B4C]">
          Table {info.table_number}
        </h1>
      </div>

      {/* ── Sticky category tab bar ── */}
      {sections.length > 1 && (
        <div
          ref={tabBarRef}
          className="sticky top-[56px] z-10 bg-white border-b border-[#E8E6E0]
                     flex gap-1 overflow-x-auto px-3 py-2 no-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
          {sections.map((sec) => {
            const isActive = activeCategory === sec.id;
            return (
              <button
                key={sec.id}
                data-cat={sec.id}
                onClick={() => handleTabClick(sec.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition whitespace-nowrap ${
                  isActive
                    ? "bg-[#0F2B4C] text-white"
                    : "bg-[#F1EFE8] text-[#5F5E5A] hover:bg-[#E8E6E0]"
                }`}
              >
                {/* Category colour dot */}
                {sec.color && sec.id !== "all" && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: sec.color }}
                  />
                )}
                {sec.label}
                <span className={`text-[10px] ${isActive ? "text-white/60" : "text-[#9B9891]"}`}>
                  {sec.id === "all" ? info.menu.length : sec.products.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Menu sections ── */}
      <div className="px-4 pt-4 space-y-8">
        {renderSections.map((sec) => (
          <div
            key={sec.id}
            ref={(el) => { sectionRefs.current[sec.id] = el; }}
          >
            {/* Section heading */}
            <div className="flex items-center gap-2 mb-3">
              {sec.color && (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: sec.color }}
                />
              )}
              <h2 className="text-[13px] font-semibold text-[#0F2B4C] uppercase tracking-wide">
                {sec.label}
              </h2>
              <div className="flex-1 h-px bg-[#E8E6E0]" />
            </div>

            {/* Product cards */}
            <div className="space-y-3">
              {sec.products.map((product) => (
                <ProductCard
                  key={product.product_model_id}
                  product={product}
                  currency={currency}
                  onSelectVariant={(variant) => {
                    // If no modifiers and single variant: add directly.
                    // If modifiers exist: open customisation sheet.
                    if (product.modifier_groups.length === 0) {
                      addToCart(product, variant, [], "");
                    } else {
                      openSheet(product, variant);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}

        {renderSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[32px] mb-3">🍽️</p>
            <p className="text-[15px] font-medium text-[#0F2B4C]">Menu coming soon</p>
            <p className="text-[13px] text-[#5F5E5A] mt-1">No items available right now.</p>
          </div>
        )}
      </div>

      {/* ── Fixed bottom cart bar ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-3 bg-gradient-to-t from-white via-white to-transparent">
          <button
            onClick={() => setShowCart(true)}
            className="w-full flex items-center justify-between h-14 px-4 bg-[#0F2B4C] rounded-2xl shadow-lg active:scale-[0.98] transition"
          >
            <span className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-[11px] font-bold">
                {cartCount}
              </span>
              <span className="text-white text-[14px] font-medium">View cart</span>
            </span>
            <span className="text-white text-[14px] font-semibold">
              {formatCurrency(cartTotal, currency)}
            </span>
          </button>
        </div>
      )}

      {/* ── Customisation sheet ── */}
      {sheetProduct && sheetVariant && (
        <BottomSheet onClose={() => setSheetProduct(null)}>
          <div className="px-4 pb-6">
            {/* Sheet header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 pr-3">
                <p className="text-[16px] font-semibold text-[#0F2B4C]">
                  {sheetProduct.product_name}
                </p>
                <p className="text-[13px] text-[#5F5E5A] mt-0.5">
                  {sheetVariant.name} · {formatCurrency(sheetVariant.price, currency)}
                </p>
              </div>
              <button
                onClick={() => setSheetProduct(null)}
                className="w-8 h-8 rounded-full bg-[#F1EFE8] flex items-center justify-center text-[#5F5E5A] shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Modifier groups */}
            {sheetProduct.modifier_groups.map((group) => {
              const chosen = selectedMods[group.id] ?? [];
              return (
                <div key={group.id} className="mb-5">
                  <div className="flex items-baseline gap-2 mb-2">
                    <p className="text-[13px] font-semibold text-[#0F2B4C]">{group.name}</p>
                    <p className="text-[11px] text-[#5F5E5A]">
                      {group.is_required ? "Required" : "Optional"}
                      {group.max_select > 1 ? ` · up to ${group.max_select}` : ""}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {group.options.map((opt) => {
                      const isSelected = chosen.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleModToggle(group, opt.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition ${
                            isSelected
                              ? "border-[#0F2B4C] bg-[#EEF5FF]"
                              : "border-[#D3D1C7] bg-white"
                          }`}
                        >
                          <span className={`text-[13px] font-medium ${isSelected ? "text-[#0F2B4C]" : "text-[#374151]"}`}>
                            {opt.name}
                          </span>
                          <span className="text-[12px] text-[#5F5E5A]">
                            {opt.price_delta > 0 ? `+${formatCurrency(opt.price_delta, currency)}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Optional note */}
            <div className="mb-5">
              <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                Special request (optional)
              </label>
              <input
                type="text"
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                placeholder="e.g. no onions, extra sauce"
                maxLength={120}
                className="w-full h-10 px-3 rounded-xl border border-[#D3D1C7] bg-white text-[13px] text-[#0F2B4C] placeholder-[#9B9891] focus:outline-none focus:border-[#0F2B4C]"
              />
            </div>

            {/* Add to cart */}
            <button
              onClick={confirmSheet}
              disabled={!isSheetValid()}
              className="w-full h-12 rounded-2xl bg-[#0F2B4C] text-white text-[14px] font-semibold transition disabled:opacity-40 active:scale-[0.98]"
            >
              Add to cart
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Cart drawer ── */}
      {showCart && (
        <BottomSheet onClose={() => setShowCart(false)}>
          <div className="px-4 pb-6">
            {/* Drawer header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[16px] font-semibold text-[#0F2B4C]">Your cart</p>
              <button
                onClick={() => setShowCart(false)}
                className="w-8 h-8 rounded-full bg-[#F1EFE8] flex items-center justify-center text-[#5F5E5A]"
              >
                ✕
              </button>
            </div>

            {/* Cart lines */}
            <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto">
              {cart.map((line) => (
                <div key={line.key} className="flex items-start gap-3">
                  {/* Qty stepper */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateCartQty(line.key, -1)}
                      className="w-7 h-7 rounded-full border border-[#D3D1C7] flex items-center justify-center text-[#5F5E5A] text-[14px] font-bold"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-[13px] font-medium text-[#0F2B4C]">
                      {line.qty}
                    </span>
                    <button
                      onClick={() => updateCartQty(line.key, 1)}
                      className="w-7 h-7 rounded-full border border-[#D3D1C7] flex items-center justify-center text-[#5F5E5A] text-[14px] font-bold"
                    >
                      +
                    </button>
                  </div>

                  {/* Item info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#0F2B4C] leading-tight">
                      {line.productName}
                    </p>
                    <p className="text-[11px] text-[#5F5E5A]">{line.variantName}</p>
                    {line.modifiers.length > 0 && (
                      <p className="text-[11px] text-[#5F5E5A]">
                        {line.modifiers.map((m) => m.name).join(", ")}
                      </p>
                    )}
                    {line.note && (
                      <p className="text-[11px] text-[#9B9891] italic">{line.note}</p>
                    )}
                  </div>

                  {/* Line total */}
                  <p className="text-[13px] font-medium text-[#0F2B4C] shrink-0">
                    {formatCurrency(line.unitPrice * line.qty, currency)}
                  </p>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between py-3 border-t border-[#E8E6E0] mb-4">
              <span className="text-[14px] font-semibold text-[#0F2B4C]">Total</span>
              <span className="text-[14px] font-semibold text-[#0F2B4C]">
                {formatCurrency(cartTotal, currency)}
              </span>
            </div>

            {/* Optional name */}
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[#5F5E5A] mb-1">
                Your name (optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="So we can call your order"
                maxLength={60}
                className="w-full h-10 px-3 rounded-xl border border-[#D3D1C7] bg-white text-[13px] text-[#0F2B4C] placeholder-[#9B9891] focus:outline-none focus:border-[#0F2B4C]"
              />
            </div>

            {/* Place order */}
            <button
              onClick={handlePlaceOrder}
              disabled={placing || cart.length === 0}
              className="w-full h-12 rounded-2xl bg-[#0D7A5F] text-white text-[14px] font-semibold transition disabled:opacity-40 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {placing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Placing order…
                </>
              ) : (
                "Place order"
              )}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// =========================================================
// PRODUCT CARD
// =========================================================
// Displays one product model.
// - Single variant: tapping the card adds it directly.
// - Multiple variants: each variant shown as a row button.
// =========================================================

interface ProductCardProps {
  product: PublicMenuItem;
  currency: Currency;
  onSelectVariant: (variant: PublicMenuItemVariant) => void;
}

function ProductCard({ product, currency, onSelectVariant }: ProductCardProps) {
  const activeVariants = product.items.filter((v) => v.is_active);
  const hasModifiers   = product.modifier_groups.length > 0;
  const isSingleActive = activeVariants.length === 1;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E6E0] overflow-hidden">
      <div className="p-4">
        {/* Product name + description */}
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#0F2B4C] leading-tight">
              {product.product_name}
            </p>
            {hasModifiers && (
              <span className="shrink-0 text-[10px] font-medium text-[#0D7A5F] bg-[#E8F5F1] px-2 py-0.5 rounded-full">
                Customisable
              </span>
            )}
          </div>
          {product.description && (
            <p className="text-[12px] text-[#5F5E5A] mt-1 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        {/* Variant rows */}
        <div className="space-y-2">
          {activeVariants.map((variant) => {
            const unavailable = variant.is_sold_out;
            return (
              <button
                key={variant.id}
                onClick={() => !unavailable && onSelectVariant(variant)}
                disabled={unavailable}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition text-left ${
                  unavailable
                    ? "border-[#E8E6E0] bg-[#F9F8F5] opacity-50 cursor-not-allowed"
                    : "border-[#D3D1C7] bg-[#F9F8F5] hover:border-[#0F2B4C] hover:bg-[#EEF5FF] active:scale-[0.98]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Show variant name only when there are multiple variants */}
                  {!isSingleActive && (
                    <span className="text-[13px] font-medium text-[#374151]">
                      {variant.name}
                    </span>
                  )}
                  {isSingleActive && (
                    <span className="text-[13px] text-[#5F5E5A]">
                      {hasModifiers ? "Tap to customise" : "Tap to add"}
                    </span>
                  )}
                  {unavailable && (
                    <span className="text-[11px] text-[#A32D2D] font-medium">Sold out</span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[13px] font-semibold text-[#0F2B4C]">
                    {formatCurrency(variant.price, currency)}
                  </span>
                  {!unavailable && (
                    <span className="w-6 h-6 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white text-[14px] font-bold leading-none">
                      +
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// BOTTOM SHEET
// =========================================================
// Reusable slide-up panel with backdrop.
// Used for both the customisation sheet and the cart drawer.
// =========================================================

function BottomSheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl pt-4 max-h-[90vh] overflow-y-auto">
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-[#D3D1C7]" />
        </div>
        {children}
      </div>
    </div>
  );
}