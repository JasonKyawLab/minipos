"use client";
// =========================================================
// app/(qr)/qr/[token]/page.tsx
//
// Customer-facing public menu.
// No login required — uses the table QR token to load
// the menu and submit an order.
// Mobile-first layout.
// =========================================================

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/utils/formatCurrency";
import type { PublicMenuItem, PublicMenuItemVariant, PublicModifierGroup, Currency } from "@/types";

interface CartEntry {
  variantId: string;
  productName: string;
  variantName: string;
  price: number;
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

export default function QrMenuPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [info, setInfo]         = useState<TableInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [cart, setCart]         = useState<CartEntry[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing]   = useState(false);

  // Item customisation sheet
  const [customItem, setCustomItem] = useState<PublicMenuItem | null>(null);
  const [customVariant, setCustomVariant] = useState<PublicMenuItemVariant | null>(null);
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [itemNote, setItemNote] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/menu`);
        if (!res.ok) throw new Error((await res.json()).message ?? "NOT_FOUND");
        const data: TableInfo = await res.json();
        setInfo(data);
      } catch (err: any) {
        setError(err.message ?? "Table not found.");
      } finally { setLoading(false); }
    }
    load();
  }, [token]);

  function openCustomise(product: PublicMenuItem, variant: PublicMenuItemVariant) {
    if (!variant.is_active || variant.is_sold_out) return;
    setCustomItem(product);
    setCustomVariant(variant);
    setSelectedMods({});
    setItemNote("");
  }

  function handleModToggle(group: PublicModifierGroup, optionId: string) {
    setSelectedMods(prev => {
      const current = prev[group.id] ?? [];
      if (group.max_select === 1) {
        return { ...prev, [group.id]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter(id => id !== optionId) };
      }
      if (current.length >= group.max_select) return prev; // at max
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function canAddCustomised() {
    if (!customItem || !customVariant) return false;
    for (const group of customItem.modifier_groups) {
      if (group.is_required) {
        const selected = selectedMods[group.id] ?? [];
        if (selected.length < group.min_select) return false;
      }
    }
    return true;
  }

  function handleAddCustomised() {
    if (!customItem || !customVariant) return;
    const modifiers = customItem.modifier_groups.flatMap(g =>
      (selectedMods[g.id] ?? []).map(optId => {
        const opt = g.options.find(o => o.id === optId)!;
        return { modifier_option_id: optId, name: opt.name, price_delta: opt.price_delta };
      })
    );
    const modPrice = modifiers.reduce((s, m) => s + m.price_delta, 0);
    const totalPrice = Number(customVariant.price) + modPrice;

    setCart(prev => [...prev, {
      variantId: customVariant.id,
      productName: customItem.product_name,
      variantName: customVariant.name,
      price: totalPrice,
      qty: 1,
      modifiers,
      note: itemNote.trim(),
    }]);
    setCustomItem(null);
    setCustomVariant(null);
  }

  async function handlePlaceOrder() {
    if (!info || cart.length === 0) return;
    setPlacing(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/qr/${token}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map(c => ({
              product_item_id: c.variantId,
              qty: c.qty,
              modifiers: c.modifiers.map(m => m.modifier_option_id),
              item_note: c.note || undefined,
            })),
          }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).message ?? "ORDER_FAILED");
      const { order_id } = await res.json();
      router.push(`/qr/${token}/orders/${order_id}/status`);
    } catch (err: any) {
      alert(getErrorMessage(err.message));
    } finally { setPlacing(false); }
  }

  const currency = info?.currency ?? "THB";
  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

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
          <p className="text-[13px] text-[#5F5E5A]">This QR code may be invalid or the table may be inactive.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#D3D1C7] px-4 py-3">
        <p className="text-[11px] text-[#5F5E5A] uppercase tracking-wide">{info.shop_name}</p>
        <h1 className="text-[18px] font-medium text-[#0F2B4C]">Table {info.table_number}</h1>
      </div>

      {/* Menu */}
      <div className="px-4 pt-4 space-y-6">
        {info.menu.map((product) => (
          <div key={product.product_model_id}>
            <div className="mb-2">
              <h2 className="text-[15px] font-medium text-[#0F2B4C]">{product.product_name}</h2>
              {product.description && (
                <p className="text-[12px] text-[#5F5E5A]">{product.description}</p>
              )}
            </div>
            <div className="space-y-2">
              {product.items.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => openCustomise(product, variant)}
                  disabled={!variant.is_active || variant.is_sold_out}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition ${
                    !variant.is_active || variant.is_sold_out
                      ? "border-[#F1EFE8] opacity-50 cursor-not-allowed"
                      : "border-[#D3D1C7] hover:border-[#0D7A5F] hover:bg-[#E1F5EE]/20 cursor-pointer active:scale-[0.98]"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-[14px] font-medium text-[#0F2B4C]">{variant.name}</p>
                    {variant.is_sold_out && <p className="text-[11px] text-[#A32D2D]">Sold out</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[#0D7A5F]">
                      {formatCurrency(Number(variant.price), currency)}
                    </span>
                    {!variant.is_sold_out && variant.is_active && (
                      <span className="w-6 h-6 rounded-full bg-[#0D7A5F] text-white text-[16px] flex items-center justify-center leading-none">+</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-20">
          <button
            onClick={() => setShowCart(true)}
            className="w-full h-14 bg-[#0F2B4C] text-white rounded-2xl flex items-center justify-between px-5 shadow-lg active:scale-[0.98] transition"
          >
            <span className="w-7 h-7 bg-[#0D7A5F] rounded-full text-[13px] font-medium flex items-center justify-center">
              {cartCount}
            </span>
            <span className="text-[15px] font-medium">View order</span>
            <span className="text-[15px] font-medium">{formatCurrency(cartTotal, currency)}</span>
          </button>
        </div>
      )}

      {/* Cart modal */}
      {showCart && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end">
          <div className="bg-white rounded-t-2xl w-full max-h-[80vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#D3D1C7]">
              <h2 className="text-[16px] font-medium text-[#0F2B4C]">Your order</h2>
              <button onClick={() => setShowCart(false)} className="text-[#5F5E5A] text-[20px] leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {cart.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between text-[13px]">
                  <div>
                    <p className="font-medium text-[#0F2B4C]">{item.qty}× {item.variantName}</p>
                    {item.modifiers.length > 0 && (
                      <p className="text-[11px] text-[#5F5E5A]">{item.modifiers.map(m => m.name).join(", ")}</p>
                    )}
                    {item.note && <p className="text-[11px] text-[#BA7517] italic">{item.note}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-[#0D7A5F] font-medium">{formatCurrency(item.price * item.qty, currency)}</span>
                    <button
                      onClick={() => setCart(p => p.filter((_, i) => i !== idx))}
                      className="text-[#A32D2D] text-[16px] leading-none"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-[#D3D1C7] space-y-3">
              <div className="flex justify-between text-[15px] font-medium text-[#0F2B4C]">
                <span>Total</span>
                <span>{formatCurrency(cartTotal, currency)}</span>
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className="w-full h-12 bg-[#0D7A5F] text-white text-[15px] font-medium rounded-xl disabled:opacity-50 active:scale-[0.98] transition"
              >
                {placing ? "Placing order…" : "Place order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customisation sheet */}
      {customItem && customVariant && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end">
          <div className="bg-white rounded-t-2xl w-full max-h-[80vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#D3D1C7]">
              <div>
                <h2 className="text-[15px] font-medium text-[#0F2B4C]">{customVariant.name}</h2>
                <p className="text-[13px] text-[#0D7A5F]">{formatCurrency(Number(customVariant.price), currency)}</p>
              </div>
              <button onClick={() => setCustomItem(null)} className="text-[#5F5E5A] text-[20px] leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {customItem.modifier_groups.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[14px] font-medium text-[#0F2B4C]">{group.name}</p>
                    {group.is_required && (
                      <span className="text-[11px] px-1.5 py-0.5 bg-[#FCEBEB] text-[#A32D2D] rounded">Required</span>
                    )}
                    <span className="text-[11px] text-[#5F5E5A]">
                      {group.min_select === group.max_select
                        ? `Choose ${group.min_select}`
                        : `Choose ${group.min_select}–${group.max_select}`}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.options.map((opt) => {
                      const selected = (selectedMods[group.id] ?? []).includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleModToggle(group, opt.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[13px] transition ${
                            selected
                              ? "border-[#0D7A5F] bg-[#E1F5EE]"
                              : "border-[#D3D1C7] hover:border-[#0D7A5F]"
                          }`}
                        >
                          <span className="text-[#0F2B4C]">{opt.name}</span>
                          <span className="text-[#0D7A5F]">
                            {opt.price_delta > 0 ? `+${formatCurrency(opt.price_delta, currency)}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <p className="text-[13px] text-[#5F5E5A] mb-1">Special instructions (optional)</p>
                <textarea
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] border border-[#D3D1C7] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                  placeholder="e.g. No onions, extra spicy…"
                />
              </div>
            </div>

            <div className="p-5 border-t border-[#D3D1C7]">
              <button
                onClick={handleAddCustomised}
                disabled={!canAddCustomised()}
                className="w-full h-12 bg-[#0D7A5F] text-white text-[15px] font-medium rounded-xl disabled:opacity-40 active:scale-[0.98] transition"
              >
                Add to order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}