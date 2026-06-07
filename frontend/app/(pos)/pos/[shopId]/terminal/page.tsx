"use client";
// =========================================================
// app/(pos)/pos/[shopId]/terminal/page.tsx
// Path: frontend/app/(pos)/pos/[shopId]/terminal/page.tsx
//
// SECURITY MODEL — "burn the ships"
// ─────────────────────────────────────────────────────────
// This page never reads from sessionStorage, localStorage,
// or any other client-controlled storage to establish who
// the current cashier is.
//
// On mount, if PosContext is empty (which it always is after
// the full-page navigation from the login page), we call
// GET /api/shops/:shopId/pos-auth/me. The backend reads the
// pos_token HttpOnly cookie, validates the JWT, queries the
// database, and returns the session payload. The cookie is
// never accessible to JavaScript — it is sent automatically
// by the browser on every same-origin request.
//
// This means:
//   - An XSS attacker cannot steal the session payload from
//     client storage because it is never stored there.
//   - If the pos_token is expired or revoked, /me returns
//     401 and the cashier is redirected to PIN login
//     immediately — no stale session can persist.
//   - The backend is always the single source of truth.
//
// SHIFT TIMER
// ─────────────────────────────────────────────────────────
// The only thing written to sessionStorage is the shift
// start timestamp (SHIFT_START_KEY). This is display-only
// data — a cosmetic timer shown on the "End shift" modal.
// It carries no auth or identity information and exposes
// nothing if read by a third party.
// =========================================================

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useParams, useRouter } from "next/navigation";
import posApi              from "@/lib/posApi";
import { getSocket }       from "@/lib/socket";
import { ModeGate }        from "@/components/mode/ModeGate";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatCurrency }  from "@/utils/formatCurrency";
import { usePosSession }   from "@/context/PosContext";
import type {
  PublicMenuItem,
  PublicMenuItemVariant,
  PublicModifierGroup,
  RestaurantTable,
  ShopRole,
  ShopType,
} from "@/types";

// ── /me response shape ────────────────────────────────────
//
// WHY a separate interface instead of reusing PosSessionData
// from PosContext:
//   PosSessionData is not exported from PosContext. Defining
//   MeResponse here with ShopRole and ShopType (the same
//   union types PosContext uses internally) makes setSession()
//   accept the value without a cast — TypeScript verifies the
//   structural match at compile time.
interface MeResponse {
  userId:   string;
  userName: string;
  shopRole: ShopRole;  // "OWNER" | "MANAGER" | "CASHIER" | "CHEF"
  shopId:   string;
  shopName: string;
  shopType: ShopType;  // "RETAIL" | "RESTAURANT" | "ONLINE_SHOP"
}

// ── Shift timer key ───────────────────────────────────────
// This is the ONLY sessionStorage key used in this file.
// It stores the shift start ISO timestamp for the duration
// display on the "End shift" modal. Contains no credentials.
const SHIFT_START_KEY        = "minipos_shift_start";
const POS_FORCE_LOGOUT_EVENT = "pos:force_logout";

// ── Types ──────────────────────────────────────────────────

type PosOrderType = "RETAIL" | "DINE_IN" | "TAKEAWAY";

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

function makeKey(
  variantId: string,
  modifiers: ChosenModifier[],
  note: string
): string {
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

  // ── Session bootstrap via /me ─────────────────────────────
  //
  // Runs once on mount. PosContext is always empty here because
  // the login page navigated with window.location.href (a full
  // page reload that wipes all React in-memory state).
  //
  // We call GET /pos-auth/me. The browser automatically sends
  // the pos_token HttpOnly cookie on this same-origin request.
  // The backend validates the cookie and returns the cashier's
  // session data. setSession() populates PosContext.
  //
  // If the request fails (401 = expired, 403 = device revoked)
  // the posApi interceptor handles the redirect, but we add an
  // explicit fallback here as belt-and-suspenders.
  //
  // The `if (session) return` guard prevents a redundant fetch
  // on dev hot-reloads where React re-mounts without a reload.
  useEffect(() => {
    if (session) return; // Already hydrated — nothing to do.

    posApi
      .get<MeResponse>(`/api/shops/${shopId}/pos-auth/me`)
      .then(({ data }) => {
        setSession(data);
        // Start the shift timer if this is the first mount of
        // this shift (key is cleared on logout/shift-end).
        if (!sessionStorage.getItem(SHIFT_START_KEY)) {
          sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
        }
      })
      .catch((err: any) => {
          console.log('[Terminal /me] failed:', err?.response?.status, err?.response?.data);
        // pos_token missing, expired, or device revoked.
        // posApi interceptor will have already fired a redirect,
        // but we navigate explicitly here as a safety net.
        window.location.href = `/pos/${shopId}`;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only — session is stable after the /me fetch.

  const isRestaurant = session?.shopType === "RESTAURANT";

  // ── Order context ──────────────────────────────────────
  const [orderCtx, setOrderCtx] = useState<OrderContext | null>(null);

  useEffect(() => {
    if (session?.shopType === "RETAIL") {
      setOrderCtx({ orderType: "RETAIL", tableId: null, tableName: null });
    }
  }, [session?.shopType]);

  // ── Table picker modal ─────────────────────────────────
  const [showTablePicker, setShowTablePicker] = useState(false);

  // ── Tables ─────────────────────────────────────────────
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
  const [cart, setCart]       = useState<CartLine[]>([]);
  const [placing, setPlacing] = useState(false);

  // ── Picker / modifier sheets ───────────────────────────
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
  //
  // An owner/manager can force-logout a cashier from the
  // dashboard. The backend emits pos:force_logout on the
  // shop's socket room. We listen here and clear the session.
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
    const catMeta: Record<string, {
      name: string; color: string | null; sortOrder: number;
    }> = {};

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

    return {
      categorisedMenu:         map,
      activeSidebarCategories: tabs,
    };
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
      if (group.max_select === 1) {
        return { ...prev, [group.id]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
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
        return {
          modifier_option_id: opt.id,
          name:               opt.name,
          price_delta:        opt.price_delta,
        };
      })
    );

    addToCart(sheetProduct, sheetVariant, chosen, sheetNote);
  }

  // ── Place order ────────────────────────────────────────
  async function placeOrder() {
    if (cart.length === 0 || !orderCtx) return;
    setPlacing(true);
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

      setCart([]);
      if (isRestaurant) setOrderCtx(null);
    } catch (err: any) {
      console.error(getErrorMessage(err.response?.data?.message ?? "ORDER_FAILED"));
    } finally {
      setPlacing(false);
    }
  }

  // ── Order type selection ───────────────────────────────
  function selectTakeaway() {
    setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
    setShowTablePicker(false);
  }

  function selectTable(table: RestaurantTable) {
    setOrderCtx({
      orderType: "DINE_IN",
      tableId:   table.id,
      tableName: table.table_number,
    });
    setShowTablePicker(false);
  }

  function clearOrderCtx() {
    setOrderCtx(null);
    setCart([]);
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
            <p className="text-white/40 text-[11px] uppercase tracking-widest">
              Point of Sale
            </p>
            <p className="text-white text-[15px] font-medium">
              {session?.shopName ?? "POS Terminal"}
              {session?.userName && (
                <span className="text-white/40 font-normal ml-2">
                  · {session.userName}
                </span>
              )}
            </p>
          </div>

          {/* ── Order type selector — RESTAURANT only ── */}
          {isRestaurant && (
            <div className="flex items-center gap-2 mx-4">
              <button
                onClick={selectTakeaway}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold transition ${
                  orderCtx?.orderType === "TAKEAWAY"
                    ? "bg-[#0D7A5F] text-white ring-2 ring-[#0D7A5F]/50"
                    : "bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
                }`}
              >
                <span className="text-[14px]">🥡</span>
                Takeaway
              </button>

              <button
                onClick={() => setShowTablePicker(true)}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold transition ${
                  orderCtx?.orderType === "DINE_IN"
                    ? "bg-[#1E4FBF] text-white ring-2 ring-[#1E4FBF]/50"
                    : "bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
                }`}
              >
                <span className="text-[14px]">🍽️</span>
                {orderCtx?.orderType === "DINE_IN" && orderCtx.tableName
                  ? `Table ${orderCtx.tableName}`
                  : "Dine In"}
              </button>

              {orderCtx && (
                <button
                  onClick={clearOrderCtx}
                  title="Clear order type"
                  className="w-8 h-8 rounded-full bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60 transition flex items-center justify-center text-[13px]"
                >
                  ✕
                </button>
              )}
            </div>
          )}

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

        {/* ── Order type prompt banner ── */}
        {isRestaurant && !orderCtx && (
          <div className="bg-amber-500/10 border-b border-amber-400/20 px-6 py-2 shrink-0">
            <p className="text-amber-300 text-[12px] font-medium">
              Select an order type above before placing an order — Takeaway or Dine In.
            </p>
          </div>
        )}

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
                      if (
                        product.items.length === 1 &&
                        product.modifier_groups.length === 0
                      ) {
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
                        : `From ${formatCurrency(
                            Math.min(
                              ...product.items.map((v: PublicMenuItemVariant) => v.price)
                            )
                          )}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </main>

          {/* Cart panel */}
          <aside className="w-[280px] border-l border-white/10 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-white/10 shrink-0">
              <p className="text-white/50 text-[11px] uppercase tracking-widest">
                Order
                {orderCtx && (
                  <span className="ml-2 normal-case text-white/30">
                    {orderCtx.orderType === "TAKEAWAY" && "· Takeaway"}
                    {orderCtx.orderType === "DINE_IN" && orderCtx.tableName &&
                      `· Table ${orderCtx.tableName}`}
                    {orderCtx.orderType === "RETAIL" && "· Retail"}
                  </span>
                )}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {cart.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white/20 text-[12px]">Cart is empty</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.map((line) => (
                    <div
                      key={line.key}
                      className="bg-white/5 rounded-lg p-2.5 flex flex-col gap-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[12px] font-medium leading-tight truncate">
                            {line.productName}
                          </p>
                          <p className="text-white/40 text-[11px]">{line.variantName}</p>
                          {line.modifiers.length > 0 && (
                            <p className="text-white/30 text-[10px] mt-0.5 leading-relaxed">
                              {line.modifiers.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          {line.note && (
                            <p className="text-amber-300/60 text-[10px] mt-0.5 italic">
                              {line.note}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(line.key)}
                          className="text-white/20 hover:text-red-400 text-[12px] transition shrink-0 mt-0.5"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
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
                        <p className="text-white text-[12px] font-medium">
                          {formatCurrency(line.lineTotal)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-white/10 shrink-0 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-white/40 text-[13px]">
                  Subtotal ({cartCount} item{cartCount !== 1 ? "s" : ""})
                </p>
                <p className="text-white text-[15px] font-semibold">
                  {formatCurrency(cartSubtotal)}
                </p>
              </div>
              <button
                onClick={placeOrder}
                disabled={
                  placing ||
                  cart.length === 0 ||
                  (isRestaurant && !orderCtx)
                }
                className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {placing
                  ? "Placing…"
                  : isRestaurant && !orderCtx
                  ? "Select order type first"
                  : "Place Order"}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Table Picker Modal ── */}
      {showTablePicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="text-white font-semibold text-[15px]">Select Table</p>
              <button
                onClick={() => setShowTablePicker(false)}
                className="text-white/30 hover:text-white transition text-[18px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {tablesLoading ? (
                <p className="text-white/40 text-[13px] text-center py-8">
                  Loading tables…
                </p>
              ) : tablesError ? (
                <div className="text-center py-8">
                  <p className="text-red-400 text-[13px] mb-3">{tablesError}</p>
                  <button
                    onClick={loadTables}
                    className="text-white/50 text-[12px] underline"
                  >
                    Retry
                  </button>
                </div>
              ) : tables.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-white/40 text-[13px]">
                    No active tables configured.
                  </p>
                  <p className="text-white/25 text-[12px] mt-1">
                    Add tables in Dashboard → Tables.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {tables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => selectTable(table)}
                      className={`h-20 rounded-xl border-2 transition flex flex-col items-center justify-center gap-0.5 ${
                        orderCtx?.tableId === table.id
                          ? "bg-[#1E4FBF]/30 border-[#1E4FBF]"
                          : "bg-white/[0.08] border-white/10 hover:bg-white/15 hover:border-white/25"
                      }`}
                    >
                      <span className="text-[18px]">🍽️</span>
                      <p className="text-white text-[14px] font-bold">
                        {table.table_number}
                      </p>
                      {table.capacity && (
                        <p className="text-white/35 text-[10px]">
                          {table.capacity} seats
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Variant picker sheet ── */}
      {pickerProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="text-white font-semibold text-[15px]">
                {pickerProduct.product_name}
              </p>
              <button
                onClick={() => setPickerProduct(null)}
                className="text-white/30 hover:text-white transition text-[18px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto flex flex-col gap-4">
              {pickerProduct.items.length > 1 && (
                <div>
                  <p className="text-white/50 text-[11px] uppercase tracking-widest mb-2">
                    Size / Variant
                  </p>
                  <div className="flex flex-col gap-2">
                    {pickerProduct.items.map((v) => (
                      <button
                        key={v.id}
                        disabled={!v.is_active || v.is_sold_out}
                        onClick={() => {
                          setSheetProduct(pickerProduct);
                          setSheetVariant(v);
                          setSelectedMods({});
                          setSheetNote("");
                          setPickerProduct(null);
                        }}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition ${
                          !v.is_active || v.is_sold_out
                            ? "border-white/5 opacity-40 cursor-not-allowed bg-white/5"
                            : "border-white/15 bg-white/[0.08] hover:bg-white/15 hover:border-white/30"
                        }`}
                      >
                        <span className="text-white text-[13px] font-medium">{v.name}</span>
                        <span className="text-white/50 text-[12px]">
                          {v.is_sold_out ? "Sold out" : formatCurrency(v.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pickerProduct.items.length === 1 &&
                pickerProduct.modifier_groups.length > 0 && (
                  <button
                    onClick={() => {
                      setSheetProduct(pickerProduct);
                      setSheetVariant(pickerProduct.items[0]);
                      setSelectedMods({});
                      setSheetNote("");
                      setPickerProduct(null);
                    }}
                    className="w-full h-11 rounded-xl bg-[#0D7A5F] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
                  >
                    Customise · {formatCurrency(pickerProduct.items[0].price)}
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modifier sheet ── */}
      {sheetProduct && sheetVariant && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <p className="text-white font-semibold text-[15px]">
                  {sheetProduct.product_name}
                </p>
                <p className="text-white/40 text-[12px]">{sheetVariant.name}</p>
              </div>
              <button
                onClick={() => { setSheetProduct(null); setSheetVariant(null); }}
                className="text-white/30 hover:text-white transition text-[18px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto flex flex-col gap-5">
              {sheetProduct.modifier_groups.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-white/70 text-[12px] font-semibold uppercase tracking-wide">
                      {group.name}
                    </p>
                    {group.is_required && (
                      <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
                        Required
                      </span>
                    )}
                    <span className="text-white/25 text-[10px] ml-auto">
                      {group.max_select === 1 ? "Pick 1" : `Up to ${group.max_select}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {group.options.map((opt) => {
                      const isSelected = (selectedMods[group.id] ?? []).includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleModToggle(group, opt.id)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border transition ${
                            isSelected
                              ? "bg-[#0D7A5F]/20 border-[#0D7A5F] text-white"
                              : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span className="text-[13px]">{opt.name}</span>
                          {opt.price_delta !== 0 && (
                            <span className="text-[12px] text-white/40">
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
                <p className="text-white/50 text-[11px] uppercase tracking-widest mb-2">
                  Item Note (optional)
                </p>
                <input
                  type="text"
                  value={sheetNote}
                  onChange={(e) => setSheetNote(e.target.value)}
                  placeholder="e.g. no onions, extra spicy"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10">
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

      {/* ── Shift summary modal ── */}
      {showShiftSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-[#0F2B4C] px-6 py-5">
              <p className="text-white/50 text-[11px] uppercase tracking-widest mb-1">
                Shift complete
              </p>
              <p className="text-white text-[20px] font-semibold">Great work today!</p>
            </div>
            <div className="px-6 py-5">
              {shiftDuration && (
                <p className="text-[#5F5E5A] text-[14px] mb-4">
                  Shift duration:{" "}
                  <span className="font-medium text-[#0F2B4C]">{shiftDuration}</span>
                </p>
              )}
              <button
                onClick={handleShiftConfirmed}
                className="w-full h-11 rounded-xl bg-[#0F2B4C] text-white text-[14px] font-semibold hover:bg-opacity-90 transition"
              >
                End shift & log out
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