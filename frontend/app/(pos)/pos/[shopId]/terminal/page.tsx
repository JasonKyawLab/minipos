"use client";

// =========================================================
// app/(pos)/pos/[shopId]/terminal/page.tsx
// =========================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter }  from "next/navigation";
import posApi                    from "@/lib/posApi";
import { getErrorMessage }       from "@/utils/errorMessages";
import { formatCurrency }        from "@/utils/formatCurrency";
import { ModeGate }              from "@/components/mode/ModeGate";
import { usePosSession }         from "@/context/PosContext";
import { getSocket }             from "@/lib/socket";

// ── Types ──────────────────────────────────────────────────

type ShopRole  = "OWNER" | "MANAGER" | "CASHIER" | "CHEF";
type ShopType  = "RETAIL" | "RESTAURANT" | "ONLINE_SHOP";
type PosOrderType = "RETAIL" | "DINE_IN" | "TAKEAWAY";

interface MeResponse {
  userId:   string;
  userName: string;
  shopRole: ShopRole;
  shopId:   string;
  shopName: string;
  shopType: ShopType;
}

interface ChosenModifier {
  modifier_option_id: string;
  name:               string;
  price_delta:        number;
}

interface CartLine {
  key:         string;
  variantId:   string;
  productName: string;
  variantName: string;
  basePrice:   number;
  modifiers:   ChosenModifier[];
  note:        string;
  qty:         number;
  lineTotal:   number;
}

interface OrderContext {
  orderType: PosOrderType;
  tableId:   string | null;
  tableName: string | null;
}

interface CategoryTab {
  id:    string;
  label: string;
  color: string | null;
  count: number;
}

interface RestaurantTable {
  id:           string;
  table_number: string;
  is_active:    boolean;
}

interface PublicMenuItemVariant {
  id:          string;
  name:        string;
  price:       number;
  is_active:   boolean;
  is_sold_out: boolean;
}

interface PublicModifierGroup {
  id:          string;
  name:        string;
  is_required: boolean;
  min_select:  number;
  max_select:  number;
  options:     Array<{ id: string; name: string; price_delta: number }>;
}

interface PublicMenuItem {
  product_model_id:    string;
  product_name:        string;
  description:         string | null;
  image_url:           string | null;
  category_id:         string | null;
  category_name:       string | null;
  category_color:      string | null;
  category_sort_order: number;
  items:               PublicMenuItemVariant[];
  modifier_groups:     PublicModifierGroup[];
}

// ── Active order (after placeOrder succeeds) ───────────────
interface ActiveOrder {
  id:           string;
  order_no:     string;
  total_amount: number;
  status:       "OPEN" | "CONFIRMED";
}

// ── Constants ──────────────────────────────────────────────

const SHIFT_START_KEY        = "minipos_shift_start";
const POS_FORCE_LOGOUT_EVENT = "pos:force_logout";

function makeKey(variantId: string, modifiers: ChosenModifier[], note: string): string {
  const modKey = modifiers.map((m) => m.modifier_option_id).sort().join(",");
  return `${variantId}|${modKey}|${note}`;
}

// =========================================================
// COMPONENT
// =========================================================

export default function PosTerminalPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router     = useRouter();
  const { session, setSession } = usePosSession();

  // ── Session bootstrap ──────────────────────────────────
  useEffect(() => {
    if (session) return;
    posApi
      .get<MeResponse>(`/api/shops/${shopId}/pos-auth/me`)
      .then(({ data }) => {
        setSession(data);
        if (!sessionStorage.getItem(SHIFT_START_KEY)) {
          sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
        }
      })
      .catch(() => {
        window.location.href = `/pos/${shopId}`;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRestaurant = session?.shopType === "RESTAURANT";

  // ── Order context ──────────────────────────────────────
  const [orderCtx, setOrderCtx] = useState<OrderContext | null>(null);

  useEffect(() => {
    if (session?.shopType === "RETAIL") {
      setOrderCtx({ orderType: "RETAIL", tableId: null, tableName: null });
    }
  }, [session?.shopType]);

  // ── Tables ─────────────────────────────────────────────
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tables, setTables]               = useState<RestaurantTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError]     = useState("");

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    setTablesError("");
    try {
      const { data } = await posApi.get<RestaurantTable[]>(
        `/api/shops/${shopId}/pos-auth/tables`
      );
      setTables(data.filter((t) => t.is_active));
    } catch {
      setTablesError("Could not load tables.");
    } finally {
      setTablesLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (isRestaurant) loadTables();
  }, [isRestaurant, loadTables]);

  // ── Menu ───────────────────────────────────────────────
  const [menu, setMenu]               = useState<PublicMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError]     = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError("");
    try {
      const { data } = await posApi.get<PublicMenuItem[]>(
        `/api/shops/${shopId}/pos-auth/menu`
      );
      setMenu(data);
    } catch (err: any) {
      setMenuError(getErrorMessage(err.response?.data?.message));
    } finally {
      setMenuLoading(false);
    }
  }, [shopId]);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  // ── Cart ───────────────────────────────────────────────
  const [cart, setCart]     = useState<CartLine[]>([]);
  const [placing, setPlacing] = useState(false);

  // ── Active order state ─────────────────────────────────
  // Tracks the created order between Place → Confirm → Pay.
  const [activeOrder, setActiveOrder]         = useState<ActiveOrder | null>(null);
  const [cancelling, setCancelling]           = useState(false);
  const [showPayModal, setShowPayModal]       = useState(false);
  const [payMethod, setPayMethod]             = useState<"CASH" | "COD">("CASH");
  const [receivedAmount, setReceivedAmount]   = useState("");
  const [payError, setPayError]               = useState("");
  const [paying, setPaying]                   = useState(false);
  const [receipt, setReceipt]                 = useState<{
    order_no:      string;
    total_amount:  number;
    change_amount: number | null;
    method:        string;
  } | null>(null);

  // ── Picker / modifier sheet ────────────────────────────
  const [pickerProduct, setPickerProduct] = useState<PublicMenuItem | null>(null);
  const [sheetProduct, setSheetProduct]   = useState<PublicMenuItem | null>(null);
  const [sheetVariant, setSheetVariant]   = useState<PublicMenuItemVariant | null>(null);
  const [selectedMods, setSelectedMods]   = useState<Record<string, string[]>>({});
  const [sheetNote, setSheetNote]         = useState("");

  // ── Shift / exit ───────────────────────────────────────
  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // ── Socket: force-logout ───────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.on(POS_FORCE_LOGOUT_EVENT, () => {
      posApi.post(`/api/shops/${shopId}/pos-auth/logout`).catch(() => {});
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/pos/${shopId}`;
    });
    return () => {
      socket.off(POS_FORCE_LOGOUT_EVENT);
      socket.disconnect();
    };
  }, [shopId]);

  // ── Category tabs ──────────────────────────────────────
  const { categorisedMenu, activeSidebarCategories } = useMemo((): {
    categorisedMenu:         Record<string, PublicMenuItem[]>;
    activeSidebarCategories: CategoryTab[];
  } => {
    const map: Record<string, PublicMenuItem[]> = { all: menu };
    const catMeta: Record<string, { name: string; color: string | null; sortOrder: number }> = {};

    for (const product of menu) {
      const catId = product.category_id ?? "uncategorised";
      if (!map[catId]) map[catId] = [];
      map[catId].push(product);
      if (product.category_id && !catMeta[catId]) {
        catMeta[catId] = {
          name:      product.category_name       ?? "Unknown",
          color:     product.category_color      ?? null,
          sortOrder: product.category_sort_order ?? 999,
        };
      }
    }

    const sorted = Object.keys(catMeta).sort(
      (a, b) => catMeta[a].sortOrder - catMeta[b].sortOrder
    );

    const tabs: CategoryTab[] = [
      { id: "all", label: "All", color: null, count: menu.length },
      ...sorted.map((id) => ({
        id,
        label: catMeta[id].name,
        color: catMeta[id].color,
        count: (map[id] ?? []).length,
      })),
    ];

    return { categorisedMenu: map, activeSidebarCategories: tabs };
  }, [menu]);

  // ── Cart helpers ───────────────────────────────────────
  function addToCart(
    product: PublicMenuItem,
    variant: PublicMenuItemVariant,
    modifiers: ChosenModifier[],
    note: string
  ) {
    const key       = makeKey(variant.id, modifiers, note);
    const unitPrice = variant.price + modifiers.reduce((s, m) => s + m.price_delta, 0);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key
            ? { ...l, qty: l.qty + 1, lineTotal: l.lineTotal + unitPrice }
            : l
        );
      }
      return [
        ...prev,
        {
          key,
          variantId:   variant.id,
          productName: product.product_name,
          variantName: variant.name,
          basePrice:   variant.price,
          modifiers,
          note,
          qty:         1,
          lineTotal:   unitPrice,
        },
      ];
    });
    setSheetProduct(null);
    setSheetVariant(null);
    setPickerProduct(null);
    setSelectedMods({});
    setSheetNote("");
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.key !== key) return l;
          const newQty = l.qty + delta;
          if (newQty <= 0) return null;
          const unitPrice = l.lineTotal / l.qty;
          return { ...l, qty: newQty, lineTotal: unitPrice * newQty };
        })
        .filter(Boolean) as CartLine[]
    );
  }

  // ── Modifier sheet helpers ─────────────────────────────
  function handleModToggle(group: PublicModifierGroup, optionId: string) {
    setSelectedMods((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max_select === 1) return { ...prev, [group.id]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function isModifierValid(product: PublicMenuItem): boolean {
    return product.modifier_groups.every((g) => {
      if (!g.is_required) return true;
      return (selectedMods[g.id] ?? []).length >= g.min_select;
    });
  }

  function confirmSheetAdd() {
    if (!sheetProduct || !sheetVariant) return;
    if (!isModifierValid(sheetProduct)) return;
    const chosen: ChosenModifier[] = sheetProduct.modifier_groups.flatMap((g) =>
      (selectedMods[g.id] ?? []).map((optId) => {
        const opt = g.options.find((o) => o.id === optId)!;
        return { modifier_option_id: opt.id, name: opt.name, price_delta: opt.price_delta };
      })
    );
    addToCart(sheetProduct, sheetVariant, chosen, sheetNote);
  }

  // ── Step 1: Place order (OPEN) ─────────────────────────
  // Creates the order shell + items.
  // RESTAURANT → auto-confirms immediately (sends to kitchen).
  // RETAIL     → goes straight to payment modal.
  async function placeOrder() {
    if (cart.length === 0 || !orderCtx) return;
    setPlacing(true);
    setActiveOrder(null);
    try {
      const { data: order } = await posApi.post(
        `/api/shops/${shopId}/pos-auth/orders`,
        {
          order_type: orderCtx.orderType,
          table_id:   orderCtx.tableId ?? undefined,
        }
      );

      for (const line of cart) {
        await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders/${order.id}/items`,
          {
            product_item_id: line.variantId,
            qty:             line.qty,
            modifiers:       line.modifiers.map((m) => ({
              modifier_option_id: m.modifier_option_id,
            })),
            item_note: line.note || undefined,
          }
        );
      }

      // Fetch order with server-calculated totals
      const { data: finalOrder } = await posApi.get(
        `/api/shops/${shopId}/pos-auth/orders/${order.id}`
      );

      setCart([]);

      if (isRestaurant) {
        // RESTAURANT: auto-confirm → triggers KitchenService.createTicket()
        // No manual confirm step needed — cashier just places the order
        // and the kitchen sees it immediately.
        await posApi.patch(
          `/api/shops/${shopId}/pos-auth/orders/${finalOrder.id}/status`,
          { status: "CONFIRMED" }
        );
        setActiveOrder({
          id:           finalOrder.id,
          order_no:     finalOrder.order_no,
          total_amount: finalOrder.total_amount,
          status:       "CONFIRMED",
        });
      } else {
        // RETAIL: no kitchen — go straight to payment
        setActiveOrder({
          id:           finalOrder.id,
          order_no:     finalOrder.order_no,
          total_amount: finalOrder.total_amount,
          status:       "OPEN",
        });
        setShowPayModal(true);
      }
    } catch (err: any) {
      console.error(getErrorMessage(err.response?.data?.message ?? "ORDER_FAILED"));
    } finally {
      setPlacing(false);
    }
  }

  // ── Cancel order ───────────────────────────────────────
  // Cancels the active order and resets the cart so the
  // cashier can start fresh. Used when a mistake is made
  // after placing but before payment.
  async function cancelOrder() {
    if (!activeOrder) return;
    setCancelling(true);
    try {
      await posApi.patch(
        `/api/shops/${shopId}/pos-auth/orders/${activeOrder.id}/status`,
        { status: "CANCELLED" }
      );
      setActiveOrder(null);
      setShowPayModal(false);
      setReceivedAmount("");
      if (isRestaurant) setOrderCtx(null);
    } catch (err: any) {
      console.error(getErrorMessage(err.response?.data?.message ?? "CANCEL_FAILED"));
    } finally {
      setCancelling(false);
    }
  }

  // ── Step 3: Process payment ────────────────────────────
  async function processPayment() {
    if (!activeOrder) return;
    const amount = activeOrder.total_amount;

    if (payMethod === "CASH") {
      const received = parseFloat(receivedAmount);
      if (isNaN(received) || received < amount) {
        setPayError(`Amount received must be at least ${formatCurrency(amount)}`);
        return;
      }
    }

    setPaying(true);
    setPayError("");
    try {
      const body: Record<string, unknown> = { method: payMethod, amount };
      if (payMethod === "CASH") body.received_amount = parseFloat(receivedAmount);

      const { data } = await posApi.post(
        `/api/shops/${shopId}/pos-auth/orders/${activeOrder.id}/payments`,
        body
      );

      setReceipt({
        order_no:      activeOrder.order_no,
        total_amount:  amount,
        change_amount: data.change_amount ?? null,
        method:        payMethod,
      });

      setShowPayModal(false);
      setActiveOrder(null);
      setReceivedAmount("");
      setPayMethod("CASH");
      if (isRestaurant) setOrderCtx(null);
    } catch (err: any) {
      setPayError(getErrorMessage(err.response?.data?.message ?? "PAYMENT_FAILED"));
    } finally {
      setPaying(false);
    }
  }

  // ── Order type selection ───────────────────────────────
  function selectTakeaway() {
    setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
    setShowTablePicker(false);
  }

  function selectTable(table: RestaurantTable) {
    setOrderCtx({ orderType: "DINE_IN", tableId: table.id, tableName: table.table_number });
    setShowTablePicker(false);
  }

  function clearOrderCtx() {
    setOrderCtx(null);
    setCart([]);
    setActiveOrder(null);
  }

  // ── Shift helpers ──────────────────────────────────────
  function handleEndShiftClick() {
    const startStr = sessionStorage.getItem(SHIFT_START_KEY);
    if (startStr) {
      const ms      = Date.now() - new Date(startStr).getTime();
      const hours   = Math.floor(ms / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      setShiftDuration(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    }
    setShowShiftSummary(true);
  }

  async function handleShiftConfirmed() {
    setShowShiftSummary(false);
    setEndingShift(true);
    try { await posApi.post(`/api/shops/${shopId}/pos-auth/logout`); } catch {}
    sessionStorage.removeItem(SHIFT_START_KEY);
    router.push(`/pos/${shopId}`);
  }

  async function handleExitConfirmed() {
    setShowExitGate(false);
    setExitingMode(true);
    try { await posApi.post(`/api/shops/${shopId}/pos-auth/logout`); } catch {}
    sessionStorage.removeItem(SHIFT_START_KEY);
    window.location.href = `/shops/${shopId}/dashboard`;
  }

  // ── Derived ────────────────────────────────────────────
  const cartSubtotal = cart.reduce((s, l) => s + l.lineTotal, 0);
  const cartCount    = cart.reduce((s, l) => s + l.qty, 0);

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <>
      <div className="h-screen bg-[#0F2B4C] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest">Point of Sale</p>
            <p className="text-white text-[15px] font-medium">
              {session?.shopName ?? "POS Terminal"}
              {session?.userName && (
                <span className="text-white/40 font-normal ml-2">· {session.userName}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleEndShiftClick}
              disabled={endingShift || exitingMode}
              className="px-3 h-8 text-[12px] text-white/60 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending…" : "End shift"}
            </button>
            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-3 h-8 text-[12px] text-white/30 border border-white/5 rounded-lg hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
            >
              {exitingMode ? "Exiting…" : "Exit mode"}
            </button>
          </div>
        </header>

        {/* ── Main body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Category sidebar */}
          <aside className="w-[160px] border-r border-white/10 flex flex-col overflow-y-auto shrink-0 py-3 gap-1 px-2">
            {activeSidebarCategories.map((cat: CategoryTab) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium transition ${
                  activeCategory === cat.id
                    ? "bg-white/15 text-white"
                    : "text-white/40 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {cat.label}
                <span className="ml-1 text-white/25 text-[11px]">({cat.count})</span>
              </button>
            ))}
          </aside>

          {/* Product grid */}
          <main className="flex-1 overflow-y-auto p-4">
            {menuLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/30 text-[13px]">Loading menu…</p>
              </div>
            ) : menuError ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-red-400 text-[13px]">{menuError}</p>
              </div>
            ) : (categorisedMenu[activeCategory] ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/30 text-[13px]">No items in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(categorisedMenu[activeCategory] ?? []).map((product: PublicMenuItem) => (
                  <button
                    key={product.product_model_id}
                    onClick={() => {
                      if (product.items.length === 1 && product.modifier_groups.length === 0) {
                        addToCart(product, product.items[0], [], "");
                      } else {
                        setPickerProduct(product);
                      }
                    }}
                    className="bg-white/[0.08] hover:bg-white/15 border border-white/10 rounded-xl p-3 text-left transition active:scale-[0.97] flex flex-col gap-1"
                  >
                    <p className="text-white text-[13px] font-medium leading-tight line-clamp-2">
                      {product.product_name}
                    </p>
                    <p className="text-white/40 text-[11px] mt-auto">
                      {product.items.length === 1
                        ? formatCurrency(product.items[0].price)
                        : `From ${formatCurrency(Math.min(...product.items.map((v) => v.price)))}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </main>

          {/* ── Cart panel ── */}
          <aside className="w-[280px] border-l border-white/10 flex flex-col shrink-0">

            {/* Cart header — order type selector lives here for RESTAURANT */}
            <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
              {isRestaurant ? (
                <div className="flex items-center gap-1.5">
                  {/* Takeaway button */}
                  <button
                    onClick={selectTakeaway}
                    disabled={!!activeOrder}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold transition ${
                      orderCtx?.orderType === "TAKEAWAY"
                        ? "bg-[#0D7A5F] text-white"
                        : "bg-white/8 text-white/40 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed"
                    }`}
                  >
                    🥡 Takeaway
                  </button>

                  {/* Dine In button */}
                  <button
                    onClick={() => setShowTablePicker(true)}
                    disabled={!!activeOrder}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold transition ${
                      orderCtx?.orderType === "DINE_IN"
                        ? "bg-[#1E4FBF] text-white"
                        : "bg-white/8 text-white/40 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed"
                    }`}
                  >
                    🍽️ {orderCtx?.orderType === "DINE_IN" && orderCtx.tableName
                      ? `T-${orderCtx.tableName}`
                      : "Dine In"}
                  </button>

                  {/* Clear — only when no active order */}
                  {orderCtx && !activeOrder && (
                    <button
                      onClick={clearOrderCtx}
                      className="w-8 h-8 rounded-lg bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60 transition flex items-center justify-center text-[12px] shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-white/50 text-[11px] uppercase tracking-widest">Order</p>
              )}
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {cart.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white/20 text-[13px]">Add items to start</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((line) => (
                    <div key={line.key} className="bg-white/5 rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[12px] font-medium leading-tight truncate">
                            {line.productName}
                            {line.variantName !== line.productName && (
                              <span className="text-white/40 ml-1">— {line.variantName}</span>
                            )}
                          </p>
                          {line.modifiers.length > 0 && (
                            <p className="text-white/30 text-[11px] mt-0.5 truncate">
                              {line.modifiers.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          <p className="text-white/40 text-[11px] mt-0.5">
                            {formatCurrency(line.lineTotal)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => updateQty(line.key, -1)}
                            className="w-6 h-6 rounded-md bg-white/10 text-white text-[13px] flex items-center justify-center hover:bg-white/20 transition"
                          >
                            −
                          </button>
                          <span className="text-white text-[13px] font-medium w-4 text-center">
                            {line.qty}
                          </span>
                          <button
                            onClick={() => updateQty(line.key, +1)}
                            className="w-6 h-6 rounded-md bg-white/10 text-white text-[13px] flex items-center justify-center hover:bg-white/20 transition"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Cart bottom panel ── */}
            <div className="px-4 py-3 border-t border-white/10 shrink-0 flex flex-col gap-2">

              {/* Totals */}
              <div className="flex items-center justify-between">
                <p className="text-white/40 text-[13px]">
                  Subtotal ({cartCount} item{cartCount !== 1 ? "s" : ""})
                </p>
                <p className="text-white text-[15px] font-semibold">
                  {activeOrder
                    ? formatCurrency(activeOrder.total_amount)
                    : formatCurrency(cartSubtotal)}
                </p>
              </div>

              {/* State A: cart has items, no active order yet */}
              {!activeOrder && (
                <button
                  onClick={placeOrder}
                  disabled={placing || cart.length === 0 || (isRestaurant && !orderCtx)}
                  className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {placing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {isRestaurant ? "Sending to kitchen…" : "Placing…"}
                    </>
                  ) : isRestaurant && !orderCtx
                    ? "Select order type first"
                    : isRestaurant
                    ? "Place & Send to Kitchen"
                    : "Place Order"}
                </button>
              )}

              {/* State B: RESTAURANT — order confirmed, kitchen notified */}
              {activeOrder && isRestaurant && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#0D7A5F]/10 border border-[#0D7A5F]/20 rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-[#0D7A5F]" />
                    <p className="text-[#0D7A5F] text-[12px] font-medium">
                      #{activeOrder.order_no} sent to kitchen ✓
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
                  >
                    Collect Payment
                  </button>
                  <button
                    onClick={cancelOrder}
                    disabled={cancelling}
                    className="w-full h-9 rounded-xl bg-white/5 text-[#FF9B9B]/70 text-[12px] hover:bg-red-500/10 hover:text-[#FF9B9B] transition disabled:opacity-40"
                  >
                    {cancelling ? "Cancelling…" : "Cancel Order"}
                  </button>
                </div>
              )}

              {/* State C: RETAIL — order placed, go to payment */}
              {activeOrder && !isRestaurant && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#0D7A5F]/10 border border-[#0D7A5F]/20 rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-[#0D7A5F]" />
                    <p className="text-[#0D7A5F] text-[12px] font-medium">
                      Order #{activeOrder.order_no} ready
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
                  >
                    Collect Payment
                  </button>
                  <button
                    onClick={cancelOrder}
                    disabled={cancelling}
                    className="w-full h-9 rounded-xl bg-white/5 text-[#FF9B9B]/70 text-[12px] hover:bg-red-500/10 hover:text-[#FF9B9B] transition disabled:opacity-40"
                  >
                    {cancelling ? "Cancelling…" : "Cancel Order"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── Variant picker modal ── */}
      {pickerProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="text-white font-semibold text-[15px]">{pickerProduct.product_name}</p>
              <button onClick={() => setPickerProduct(null)} className="text-white/30 hover:text-white transition text-[18px]">✕</button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {pickerProduct.items.map((variant) => (
                <button
                  key={variant.id}
                  disabled={!variant.is_active || variant.is_sold_out}
                  onClick={() => {
                    if (pickerProduct.modifier_groups.length > 0) {
                      setSheetProduct(pickerProduct);
                      setSheetVariant(variant);
                      setPickerProduct(null);
                    } else {
                      addToCart(pickerProduct, variant, [], "");
                      setPickerProduct(null);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition ${
                    !variant.is_active || variant.is_sold_out
                      ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed"
                      : "bg-white/8 border-white/10 hover:bg-white/15"
                  }`}
                >
                  <span className="text-white text-[13px]">{variant.name}</span>
                  <span className="text-white/60 text-[13px]">
                    {variant.is_sold_out ? "Sold out" : formatCurrency(variant.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modifier sheet modal ── */}
      {sheetProduct && sheetVariant && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <div>
                <p className="text-white font-semibold text-[15px]">{sheetProduct.product_name}</p>
                <p className="text-white/40 text-[12px]">{sheetVariant.name} — {formatCurrency(sheetVariant.price)}</p>
              </div>
              <button onClick={() => { setSheetProduct(null); setSheetVariant(null); setSelectedMods({}); setSheetNote(""); }} className="text-white/30 hover:text-white transition text-[18px]">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {sheetProduct.modifier_groups.map((group) => (
                <div key={group.id}>
                  <p className="text-white/70 text-[12px] font-semibold uppercase tracking-wide mb-2">
                    {group.name}
                    {group.is_required && <span className="text-red-400 ml-1">*</span>}
                  </p>
                  <div className="space-y-1.5">
                    {group.options.map((opt) => {
                      const selected = (selectedMods[group.id] ?? []).includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleModToggle(group, opt.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition text-[13px] ${
                            selected
                              ? "bg-[#0D7A5F]/20 border-[#0D7A5F]/50 text-white"
                              : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                          }`}
                        >
                          <span>{opt.name}</span>
                          {opt.price_delta !== 0 && (
                            <span className="text-white/40 text-[12px]">
                              +{formatCurrency(opt.price_delta)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <p className="text-white/70 text-[12px] font-semibold uppercase tracking-wide mb-2">Note (optional)</p>
                <input
                  type="text"
                  value={sheetNote}
                  onChange={(e) => setSheetNote(e.target.value)}
                  placeholder="e.g. no onions, extra spicy"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 shrink-0">
              <button
                onClick={confirmSheetAdd}
                disabled={!isModifierValid(sheetProduct)}
                className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table picker modal ── */}
      {showTablePicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="text-white font-semibold text-[15px]">Select Table</p>
              <button onClick={() => setShowTablePicker(false)} className="text-white/30 hover:text-white transition text-[18px]">✕</button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {tablesLoading ? (
                <p className="text-white/40 text-[13px] text-center py-8">Loading tables…</p>
              ) : tablesError ? (
                <p className="text-red-400 text-[13px] text-center py-8">{tablesError}</p>
              ) : tables.length === 0 ? (
                <p className="text-white/40 text-[13px] text-center py-8">No tables found.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {tables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => selectTable(table)}
                      className="h-16 rounded-xl bg-white/10 border border-white/10 text-white text-[14px] font-medium hover:bg-white/20 transition"
                    >
                      Table {table.table_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Payment modal ── */}
      {showPayModal && activeOrder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <p className="text-white/40 text-[11px] uppercase tracking-widest mb-0.5">
                  Order #{activeOrder.order_no}
                </p>
                <p className="text-white font-bold text-[22px]">
                  {formatCurrency(activeOrder.total_amount)}
                </p>
              </div>
              <button
                onClick={() => { setShowPayModal(false); setPayError(""); setReceivedAmount(""); }}
                className="text-white/30 hover:text-white transition text-[18px]"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">

              {/* Method selector */}
              <div className="grid grid-cols-2 gap-2">
                {(["CASH", "COD"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setPayMethod(m); setPayError(""); setReceivedAmount(""); }}
                    className={`h-10 rounded-xl text-[13px] font-semibold transition border ${
                      payMethod === m
                        ? "bg-[#0D7A5F] border-[#0D7A5F] text-white"
                        : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {m === "CASH" ? "💵 Cash" : "📦 COD"}
                  </button>
                ))}
              </div>

              {/* CASH: amount display + numpad */}
              {payMethod === "CASH" && (
                <>
                  {/* Amount received display — acts as a read-only input */}
                  <div className="bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-right">
                    <p className="text-white/30 text-[11px] mb-0.5">Amount received</p>
                    <p className="text-white text-[24px] font-bold tracking-wide">
                      {receivedAmount ? formatCurrency(parseFloat(receivedAmount) || 0) : "—"}
                    </p>
                    {/* Live change display */}
                    {receivedAmount && !isNaN(parseFloat(receivedAmount)) &&
                      parseFloat(receivedAmount) >= activeOrder.total_amount && (
                      <p className="text-[#0D7A5F] text-[13px] font-semibold mt-1">
                        Change: {formatCurrency(parseFloat(receivedAmount) - activeOrder.total_amount)}
                      </p>
                    )}
                    {receivedAmount && !isNaN(parseFloat(receivedAmount)) &&
                      parseFloat(receivedAmount) > 0 &&
                      parseFloat(receivedAmount) < activeOrder.total_amount && (
                      <p className="text-[#FF9B9B] text-[12px] mt-1">
                        Short by {formatCurrency(activeOrder.total_amount - parseFloat(receivedAmount))}
                      </p>
                    )}
                  </div>

                  {/* Quick-amount buttons — common cash denominations */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      activeOrder.total_amount,
                      ...[20, 50, 100, 200, 500, 1000].filter(
                        (d) => d >= activeOrder.total_amount
                      ).slice(0, 3),
                    ]
                      .slice(0, 4)
                      .map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setReceivedAmount(String(amount))}
                          className={`h-8 rounded-lg text-[11px] font-medium transition border ${
                            parseFloat(receivedAmount) === amount
                              ? "bg-[#0D7A5F]/30 border-[#0D7A5F]/50 text-[#0D7A5F]"
                              : "bg-white/8 border-white/10 text-white/60 hover:bg-white/15 hover:text-white"
                          }`}
                        >
                          {amount === activeOrder.total_amount ? "Exact" : formatCurrency(amount)}
                        </button>
                      ))}
                  </div>

                  {/* Numpad */}
                  <div className="grid grid-cols-3 gap-2">
                    {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === "⌫") {
                            setReceivedAmount((prev) => prev.slice(0, -1));
                            setPayError("");
                          } else if (key === ".") {
                            if (!receivedAmount.includes(".")) {
                              setReceivedAmount((prev) => (prev || "0") + ".");
                              setPayError("");
                            }
                          } else {
                            // Prevent more than 2 decimal places
                            const next = receivedAmount + key;
                            const parts = next.split(".");
                            if (parts[1] && parts[1].length > 2) return;
                            setReceivedAmount(next);
                            setPayError("");
                          }
                        }}
                        className={`h-12 rounded-xl text-white font-medium transition active:scale-95 ${
                          key === "⌫"
                            ? "bg-white/8 hover:bg-white/15 text-white/60 text-[18px]"
                            : "bg-white/10 hover:bg-white/20 text-[18px]"
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {payError && <p className="text-[#FF9B9B] text-[12px] text-center">{payError}</p>}

              {/* Confirm button */}
              <button
                onClick={processPayment}
                disabled={paying || (payMethod === "CASH" && (
                  !receivedAmount ||
                  isNaN(parseFloat(receivedAmount)) ||
                  parseFloat(receivedAmount) < activeOrder.total_amount
                ))}
                className="w-full h-12 rounded-xl bg-[#0D7A5F] text-white text-[15px] font-bold hover:bg-opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {paying ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing…
                  </>
                ) : payMethod === "COD" ? "Confirm COD Order" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt modal ── */}
      {receipt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-[#0D7A5F] px-6 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M5 14l6 6L23 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-white/70 text-[12px] uppercase tracking-widest mb-1">Payment successful</p>
              <p className="text-white text-[28px] font-bold">{formatCurrency(receipt.total_amount)}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex justify-between text-[13px]">
                <span className="text-[#5F5E5A]">Order</span>
                <span className="font-mono font-medium text-[#0F2B4C]">#{receipt.order_no}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#5F5E5A]">Method</span>
                <span className="font-medium text-[#0F2B4C]">{receipt.method}</span>
              </div>
              {receipt.change_amount !== null && receipt.change_amount > 0 && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#5F5E5A]">Change</span>
                  <span className="font-bold text-[#0D7A5F]">{formatCurrency(receipt.change_amount)}</span>
                </div>
              )}
              <button
                onClick={() => setReceipt(null)}
                className="w-full h-11 mt-2 rounded-xl bg-[#0F2B4C] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shift summary modal ── */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-[#0F2B4C] px-6 py-5">
              <p className="text-white/50 text-[11px] uppercase tracking-widest mb-1">Shift complete</p>
              <p className="text-white text-[20px] font-semibold">Great work today!</p>
            </div>
            <div className="px-6 py-5">
              {shiftDuration && (
                <p className="text-[#5F5E5A] text-[14px] mb-4">
                  Shift duration: <span className="font-medium text-[#0F2B4C]">{shiftDuration}</span>
                </p>
              )}
              <button
                onClick={handleShiftConfirmed}
                className="w-full h-11 rounded-xl bg-[#0F2B4C] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
              >
                End shift &amp; log out
              </button>
              <button
                onClick={() => setShowShiftSummary(false)}
                className="w-full h-9 mt-2 text-[13px] text-[#5F5E5A] hover:text-[#0F2B4C] transition"
              >
                Continue working
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit gate ── */}
      {showExitGate && (
        <ModeGate
          shopId={shopId}
          shopName=""
          mode="POS"
          action="exit"
          allowCancel={true}
          onSuccess={handleExitConfirmed}
          onCancel={() => setShowExitGate(false)}
        />
      )}
    </>
  );
}