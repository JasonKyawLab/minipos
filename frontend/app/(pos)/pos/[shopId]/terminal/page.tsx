// app/(pos)/pos/[shopId]/terminal/page.tsx
//
// WHAT CHANGED (UX redesign):
//
// Before: "Menu" and "Tables" tabs in the header were confusing — 
//   the order type picker (Takeaway / Dine In) was a small widget inside
//   the right cart panel, easy to miss.
//
// After: For RESTAURANT shops, the cashier sees two large mode buttons
//   at the TOP of the page:
//
//   [ 🛒 Sale ]   [ 🪑 Tables ]
//
//   • Takeaway mode  → shows product grid + cart, ALL orders are TAKEAWAY.
//     The cashier cannot accidentally mix a takeaway order with a table.
//
//   • Tables mode    → shows the floor view (table grid). Cashier picks a
//     table, which opens the table detail modal. From there they can:
//       - Add items (→ drops them into menu/cart in DINE_IN context)
//       - Pay now (→ opens payment modal directly)
//
// The order type is now set by WHICH MODE the cashier is in,
// not by a small pill button buried in the cart panel.
// This is the mental model non-tech staff find natural:
//   "I'm doing takeaway today" → tap Takeaway, work freely.
//   "Table 3 wants to order"   → tap Tables, tap Table 3.
//
// No backend changes required. All existing API calls are preserved.

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter }  from "next/navigation";
import posApi                    from "@/lib/posApi";
import { getErrorMessage }       from "@/utils/errorMessages";
import { formatCurrency }        from "@/utils/formatCurrency";
import { ModeGate }              from "@/components/mode/ModeGate";
import { usePosSession }         from "@/context/PosContext";
import { getSocket }             from "@/lib/socket";

// ── Types ──────────────────────────────────────────────────

type ShopRole     = "OWNER" | "MANAGER" | "CASHIER" | "CHEF";
type ShopType     = "RETAIL" | "RESTAURANT" | "ONLINE_SHOP";
type PosOrderType = "RETAIL" | "DINE_IN" | "TAKEAWAY" | "ONLINE";

// The top-level "mode" the cashier is in for RESTAURANT shops.
// This replaces the confusing Menu/Tables tab pair.
// - "takeaway": product grid shown, all new orders are TAKEAWAY
// - "tables":   floor view shown, cashier picks a table → DINE_IN
type RestaurantMode = "takeaway" | "tables";

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

interface ConfirmedItem {
  id:                    string;
  product_name_snapshot: string;
  item_name_snapshot:    string;
  unit_price_snapshot:   number;
  qty:                   number;
  subtotal:              number;
  modifier_snapshot:     Array<{ name: string; price_delta: number }>;
  item_note:             string | null;
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

interface ActiveOrder {
  id:           string;
  order_no:     string;
  total_amount: number;
  status:       "OPEN" | "CONFIRMED" | "CLOSING";
}

interface BillRequest {
  orderId:     string;
  orderNo:     string;
  tableId:     string;
  tableNumber: string | null;
  totalAmount: number;
  timestamp:   string;
}

interface TableStatus {
  table_id:          string;
  table_number:      string;
  capacity:          number | null;
  order_id:          string | null;
  order_no:          string | null;
  order_status:      "OPEN" | "CONFIRMED" | "CLOSING" | null;
  total_amount:      string | null;
  bill_requested:    boolean;
  bill_requested_at: string | null;
  order_started_at:  string | null;
}

interface PosOrderWithItems {
  id:           string;
  order_no:     string;
  total_amount: number;
  status:       "OPEN" | "CONFIRMED" | "CLOSING";
  items:        ConfirmedItem[];
}

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

  // ── NEW: Restaurant mode (replaces showTablesView bool) ──
  // Default to "takeaway" when session loads.
  // We keep "takeaway" as the safer default — cashiers in takeaway
  // mode can never accidentally create a DINE_IN order.
  const [restaurantMode, setRestaurantMode] = useState<RestaurantMode>("takeaway");

  // ── Order context ──────────────────────────────────────
  const [orderCtx, setOrderCtx] = useState<OrderContext | null>(null);

  useEffect(() => {
    if (session?.shopType === "RETAIL") {
      setOrderCtx({ orderType: "RETAIL", tableId: null, tableName: null });
    } else if (session?.shopType === "ONLINE_SHOP") {
      setOrderCtx({ orderType: "ONLINE", tableId: null, tableName: null });
    } else if (session?.shopType === "RESTAURANT") {
      // Default: ready for takeaway orders immediately
      setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
    }
  }, [session?.shopType]);

  // When switching to Takeaway mode, reset order context to TAKEAWAY
  // and clear any DINE_IN state so orders don't bleed across modes.
  function switchToTakeaway() {
    setRestaurantMode("takeaway");
    // Only reset if we were in DINE_IN — don't interrupt an active takeaway order
    if (orderCtx?.orderType === "DINE_IN") {
      setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
      setActiveOrder(null);
      setTableOrder(null);
      setConfirmedItems([]);
      setCart([]);
    }
  }

  function switchToTables() {
    setRestaurantMode("tables");
    loadTableStatuses();
  }

  // ── Tables picker ──────────────────────────────────────
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
  const [cart, setCart]       = useState<CartLine[]>([]);
  const [placing, setPlacing] = useState(false);

  // ── Confirmed items — read-only top zone ──────────────
  const [confirmedItems, setConfirmedItems]       = useState<ConfirmedItem[]>([]);
  const [loadingTableOrder, setLoadingTableOrder] = useState(false);

  // ── activeOrder: DINE_IN order awaiting payment ────────
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

  // ── tableOrder: pre-existing order from floor view ─────
  const [tableOrder, setTableOrder] = useState<ActiveOrder | null>(null);

  const payingOrder = activeOrder ?? tableOrder;

  const [cancelling, setCancelling]           = useState(false);
  const [showPayModal, setShowPayModal]       = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState("");
  const [cancelConfirm, setCancelConfirm]     = useState(false);
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

  // ── Bill request notifications ─────────────────────────
  const [billRequests, setBillRequests] = useState<BillRequest[]>([]);

  // ── Table status floor view ────────────────────────────
  const [tableStatuses, setTableStatuses]           = useState<TableStatus[]>([]);
  const [tableStatusLoading, setTableStatusLoading] = useState(false);

  // ── Table detail modal ─────────────────────────────────
  const [selectedTableModal, setSelectedTableModal] = useState<TableStatus | null>(null);
  const [modalOrderItems, setModalOrderItems]       = useState<ConfirmedItem[]>([]);
  const [modalOrderLoading, setModalOrderLoading]   = useState(false);
  const [modalOrder, setModalOrder]                 = useState<ActiveOrder | null>(null);

  const loadTableStatuses = useCallback(async () => {
    if (!isRestaurant) return;
    setTableStatusLoading(true);
    try {
      const { data } = await posApi.get<TableStatus[]>(
        `/api/shops/${shopId}/pos-auth/tables/status`
      );
      setTableStatuses(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal
    } finally {
      setTableStatusLoading(false);
    }
  }, [shopId, isRestaurant]);

  // Load table statuses when switching to tables mode
  useEffect(() => {
    if (restaurantMode === "tables") loadTableStatuses();
  }, [restaurantMode, loadTableStatuses]);

  // ── Socket ─────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    socket.on(POS_FORCE_LOGOUT_EVENT, () => {
      posApi.post(`/api/shops/${shopId}/pos-auth/logout`).catch(() => {});
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/pos/${shopId}`;
    });

    socket.on("qr:bill_requested", (payload: BillRequest) => {
      setBillRequests((prev) => {
        if (prev.some((r) => r.orderId === payload.orderId)) return prev;
        return [payload, ...prev];
      });
      loadTableStatuses();
    });

    socket.on("qr:order_placed", () => {
      loadTableStatuses();
    });

    socket.on("payment:processed", (payload: { orderId: string }) => {
      setBillRequests((prev) => prev.filter((r) => r.orderId !== payload.orderId));
      loadTableStatuses();
    });

    return () => {
      socket.off(POS_FORCE_LOGOUT_EVENT);
      socket.off("qr:bill_requested");
      socket.off("qr:order_placed"); 
      socket.off("payment:processed");
      socket.disconnect();
    };
  }, [shopId, loadTableStatuses]);

  // ── Category tabs ──────────────────────────────────────
  const { categorisedMenu, activeSidebarCategories } = useMemo((): {
    categorisedMenu:         Record<string, PublicMenuItem[]>;
    activeSidebarCategories: CategoryTab[];
  } => {
    const map: Record<string, PublicMenuItem[]> = { all: [...menu] };
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
    product:   PublicMenuItem,
    variant:   PublicMenuItemVariant,
    modifiers: ChosenModifier[],
    note:      string
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
        { key, variantId: variant.id, productName: product.product_name,
          variantName: variant.name, basePrice: variant.price,
          modifiers, note, qty: 1, lineTotal: unitPrice },
      ];
    });
    setSheetProduct(null);
    setSheetVariant(null);
    setPickerProduct(null);
    setSelectedMods({});
    setSheetNote("");
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

  // ── Table detail modal ─────────────────────────────────
  async function openTableModal(table: TableStatus) {
    setSelectedTableModal(table);
    setModalOrderItems([]);
    setModalOrder(null);
    if (!table.order_id) return;
    setModalOrderLoading(true);
    try {
      const { data } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${table.order_id}`
      );
      setModalOrderItems(data.items ?? []);
      setModalOrder({
        id:           data.id,
        order_no:     data.order_no,
        total_amount: data.total_amount,
        status:       data.status,
      });
    } catch (err: any) {
      console.error("Failed to load table order:", err);
    } finally {
      setModalOrderLoading(false);
    }
  }

  // "Add Items" from the table modal: switch to menu view, load DINE_IN context
  function handleModalAddItems() {
    if (!selectedTableModal) return;
    setOrderCtx({
      orderType: "DINE_IN",
      tableId:   selectedTableModal.table_id,
      tableName: selectedTableModal.table_number,
    });
    setTableOrder(modalOrder);
    setConfirmedItems(modalOrderItems);
    setCart([]);
    setActiveOrder(null);
    setSelectedTableModal(null);
    // Switch to takeaway mode layout (menu + cart) but with DINE_IN context
    // The cart header will show the table name so the cashier knows the context.
    setRestaurantMode("takeaway");
  }

  function handleModalPay() {
    if (!selectedTableModal || !modalOrder) return;
    setTableOrder(null);
    setConfirmedItems(modalOrderItems);
    setActiveOrder(modalOrder);
    setSelectedTableModal(null);
    setShowPayModal(true);
  }

  async function openTableOrder(table: TableStatus) {
    setOrderCtx({ orderType: "DINE_IN", tableId: table.table_id, tableName: table.table_number });
    setTableOrder(null);
    setConfirmedItems([]);
    setCart([]);
    setActiveOrder(null);
    setRestaurantMode("takeaway"); // show menu+cart with DINE_IN context
    if (!table.order_id) return;
    setLoadingTableOrder(true);
    try {
      const { data } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${table.order_id}`
      );
      setConfirmedItems(data.items ?? []);
      setTableOrder({
        id:           data.id,
        order_no:     data.order_no,
        total_amount: data.total_amount,
        status:       data.status,
      });
    } catch (err: any) {
      console.error("Failed to load table order:", err);
    } finally {
      setLoadingTableOrder(false);
    }
  }

  // ── Place order — DINE_IN only ─────────────────────────
  async function placeOrder() {
    if (cart.length === 0 || !orderCtx || orderCtx.orderType !== "DINE_IN") return;
    setPlacing(true);
    try {
      const targetOrderId = tableOrder?.id ?? null;
      let orderId: string;

      if (targetOrderId) {
        orderId = targetOrderId;
      } else {
        const { data: order } = await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders`,
          { order_type: orderCtx.orderType, table_id: orderCtx.tableId ?? undefined }
        );
        orderId = order.id;
      }

      for (const line of cart) {
        await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders/${orderId}/items`,
          {
            product_item_id: line.variantId,
            qty:             line.qty,
            modifiers:       line.modifiers.map((m) => ({ modifier_option_id: m.modifier_option_id })),
            item_note:       line.note || undefined,
          }
        );
      }

      const { data: finalOrder } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${orderId}`
      );

      if (finalOrder.status === "OPEN") {
        await posApi.patch(
          `/api/shops/${shopId}/pos-auth/orders/${orderId}/status`,
          { status: "CONFIRMED" }
        );
      } else if (finalOrder.status === "CONFIRMED" && targetOrderId) {
        await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders/${orderId}/kitchen-ticket`,
          {}
        ).catch((err: any) => {
          console.error("Add-on kitchen ticket failed:", err?.response?.data?.message);
        });
      }

      const tableName = orderCtx.tableName ?? orderCtx.tableId ?? "table";
      setCart([]);
      setOrderCtx(null);
      setTableOrder(null);
      setConfirmedItems([]);
      setActiveOrder(null);
      // Return to Tables view so cashier can see the updated floor
      setRestaurantMode("tables");
      loadTableStatuses();
      setOrderSuccessMsg(`Table ${tableName} sent to kitchen ✓`);
      setTimeout(() => setOrderSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error(getErrorMessage(err.response?.data?.message ?? "ORDER_FAILED"));
    } finally {
      setPlacing(false);
    }
  }

  // ── Cancel / Clear cart ────────────────────────────────
  async function cancelOrder() {
    const isTakeawayOrRetail =
      orderCtx?.orderType === "TAKEAWAY" ||
      orderCtx?.orderType === "RETAIL"   ||
      !isRestaurant;

    if (isTakeawayOrRetail && !activeOrder) {
      setCart([]);
      if (!isRestaurant) {
        setOrderCtx({ orderType: "RETAIL", tableId: null, tableName: null });
      }
      return;
    }

    const order = modalOrder ?? activeOrder ?? tableOrder;
    if (!order) return;

    setCancelling(true);
    try {
      await posApi.patch(
        `/api/shops/${shopId}/pos-auth/orders/${order.id}/status`,
        { status: "CANCELLED" }
      );
      setCart([]);
      setActiveOrder(null);
      setTableOrder(null);
      setConfirmedItems([]);
      setShowPayModal(false);
      setReceivedAmount("");
      setCancelConfirm(false);
      setSelectedTableModal(null);
      if (isRestaurant) {
        setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
        setRestaurantMode("tables");
        loadTableStatuses();
      }
    } catch (err: any) {
      console.error(getErrorMessage(err.response?.data?.message ?? "CANCEL_FAILED"));
    } finally {
      setCancelling(false);
    }
  }

  // ── Process payment ────────────────────────────────────
  async function processPayment() {
    setPaying(true);
    setPayError("");

    try {
      let orderId: string;
      let orderNo: string;
      let amount:  number;

      if (payingOrder) {
        orderId = payingOrder.id;
        orderNo = payingOrder.order_no;
        amount  = payingOrder.total_amount;

        if (payMethod === "CASH") {
          const received = parseFloat(receivedAmount);
          if (isNaN(received) || received < amount) {
            setPayError(`Amount received must be at least ${formatCurrency(amount)}`);
            setPaying(false);
            return;
          }
        }
      } else {
        if (cart.length === 0 || !orderCtx) { setPaying(false); return; }

        const estimatedTotal = cart.reduce((s, l) => s + l.lineTotal, 0);

        if (payMethod === "CASH") {
          const received = parseFloat(receivedAmount);
          if (isNaN(received) || received < estimatedTotal) {
            setPayError(`Amount received must be at least ${formatCurrency(estimatedTotal)}`);
            setPaying(false);
            return;
          }
        }

        const { data: order } = await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders`,
          { order_type: orderCtx.orderType, table_id: orderCtx.tableId ?? undefined }
        );

        for (const line of cart) {
          await posApi.post(
            `/api/shops/${shopId}/pos-auth/orders/${order.id}/items`,
            {
              product_item_id: line.variantId,
              qty:             line.qty,
              modifiers:       line.modifiers.map((m) => ({ modifier_option_id: m.modifier_option_id })),
              item_note:       line.note || undefined,
            }
          );
        }

        const { data: finalOrder } = await posApi.get<PosOrderWithItems>(
          `/api/shops/${shopId}/pos-auth/orders/${order.id}`
        );

        orderId = finalOrder.id;
        orderNo = finalOrder.order_no;
        amount  = finalOrder.total_amount;

        if (payMethod === "CASH") {
          const received = parseFloat(receivedAmount);
          if (isNaN(received) || received < amount) {
            await posApi.patch(
              `/api/shops/${shopId}/pos-auth/orders/${orderId}/status`,
              { status: "CANCELLED" }
            ).catch(() => {});
            setPayError(`Amount received must be at least ${formatCurrency(amount)}`);
            setPaying(false);
            return;
          }
        }
      }

      const body: Record<string, unknown> = { method: payMethod, amount };
      if (payMethod === "CASH") body.received_amount = parseFloat(receivedAmount);

      const { data } = await posApi.post(
        `/api/shops/${shopId}/pos-auth/orders/${orderId}/payments`,
        body
      );

      setReceipt({
        order_no:      orderNo,
        total_amount:  amount,
        change_amount: data.change_amount ?? null,
        method:        payMethod,
      });

      setBillRequests((prev) => prev.filter((r) => r.orderId !== orderId));
      setCart([]);
      setShowPayModal(false);
      setActiveOrder(null);
      setTableOrder(null);
      setReceivedAmount("");
      setPayMethod("CASH");
      setConfirmedItems([]);
      if (isRestaurant) {
        // After payment, reset to takeaway-ready or return to tables
        setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
        loadTableStatuses();
      }
    } catch (err: any) {
      setPayError(getErrorMessage(err.response?.data?.message ?? "PAYMENT_FAILED"));
    } finally {
      setPaying(false);
    }
  }

  // ── Bill request actions ───────────────────────────────
  async function handleBillRequestPay(req: BillRequest) {
    try {
      const { data: order } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${req.orderId}`
      );
      setTableOrder(null);
      setConfirmedItems(order.items ?? []);
      setActiveOrder({
        id:           order.id,
        order_no:     order.order_no,
        total_amount: order.total_amount,
        status:       order.status,
      });
      setShowPayModal(true);
    } catch (err: any) {
      console.error("Failed to load QR order:", err);
    }
  }

  async function handleReopenTable(orderId: string) {
    try {
      await posApi.post(`/api/shops/${shopId}/pos-auth/orders/${orderId}/reopen`);
      setBillRequests((prev) => prev.filter((r) => r.orderId !== orderId));
      loadTableStatuses();
    } catch (err: any) {
      console.error("Reopen failed:", err);
    }
  }

  function dismissBillRequest(orderId: string) {
    setBillRequests((prev) => prev.filter((r) => r.orderId !== orderId));
  }

  // ── Order type selection (legacy — kept for DINE_IN table picker) ──
  function selectTable(table: RestaurantTable) {
    setOrderCtx({ orderType: "DINE_IN", tableId: table.id, tableName: table.table_number });
    setTableOrder(null);
    setConfirmedItems([]);
    setShowTablePicker(false);
  }

  function clearOrderCtx() {
    setOrderCtx(null);
    setActiveOrder(null);
    setTableOrder(null);
    setConfirmedItems([]);
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
  const cartSubtotal      = cart.reduce((s, l) => s + l.lineTotal, 0);
  const cartCount         = cart.reduce((s, l) => s + l.qty, 0);
  const confirmedSubtotal = confirmedItems.reduce((s, i) => s + i.subtotal, 0);
  const hasConfirmedItems = confirmedItems.length > 0;

  const displayTotal = payingOrder
    ? payingOrder.total_amount
    : confirmedSubtotal + cartSubtotal;

  const isTakeawayOrRetail =
    orderCtx?.orderType === "TAKEAWAY" ||
    orderCtx?.orderType === "RETAIL"   ||
    !isRestaurant;

  const payModalTotal = payingOrder?.total_amount ?? cartSubtotal;

  // The cashier is currently working on a DINE_IN table from the menu view
  const isDineInMenuMode = orderCtx?.orderType === "DINE_IN" && restaurantMode === "takeaway";

  function closePayModal() {
    setShowPayModal(false);
    setPayError("");
    setReceivedAmount("");
    if (!payingOrder) {
      setConfirmedItems([]);
    }
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <>
      <div className="h-screen bg-[#0F2B4C] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <p className="text-white/40 text-[12px] uppercase tracking-widest">Point of Sale</p>
            <p className="text-white text-[18px] font-semibold">
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
              className="px-4 h-10 text-[14px] text-white/60 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white transition disabled:opacity-40"
            >
              {endingShift ? "Ending…" : "End shift"}
            </button>
            <button
              onClick={() => setShowExitGate(true)}
              disabled={endingShift || exitingMode}
              className="px-4 h-10 text-[14px] text-white/30 border border-white/5 rounded-xl hover:bg-white/5 hover:text-white/50 transition disabled:opacity-40"
            >
              {exitingMode ? "Exiting…" : "Exit mode"}
            </button>
          </div>
        </header>

        {/* ── NEW: Restaurant Mode Selector ── */}
        {/* Two large, obvious buttons. The active mode has a filled background.
            Non-tech cashiers immediately understand: "I tap the thing I'm doing."
            Takeaway = all orders go to kitchen as takeaway, no table needed.
            Tables   = see the floor, pick a table, then add items or pay. */}
        {isRestaurant && (
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/10">
            <div className="flex gap-2">

              {/* Takeaway button */}
              <button
                onClick={switchToTakeaway}
                className={`
                  flex-1 flex flex-col items-center justify-center gap-1
                  h-16 rounded-xl border-2 font-semibold transition active:scale-[0.97]
                  ${restaurantMode === "takeaway"
                    ? "bg-[#0D7A5F] border-[#0D7A5F] text-white shadow-lg shadow-[#0D7A5F]/20"
                    : "bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/20"}
                `}
              >
                <span className="text-[24px] leading-none">🛒</span>
                <span className="text-[14px] tracking-wide">Sale</span>
              </button>

              {/* Tables button */}
              <button
                onClick={switchToTables}
                className={`
                  relative flex-1 flex flex-col items-center justify-center gap-1
                  h-16 rounded-xl border-2 font-semibold transition active:scale-[0.97]
                  ${restaurantMode === "tables"
                    ? "bg-[#1E4FBF] border-[#1E4FBF] text-white shadow-lg shadow-[#1E4FBF]/20"
                    : "bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/20"}
                `}
              >
                {/* Bill-requested badge on Tables button */}
                {billRequests.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold flex items-center justify-center">
                    {billRequests.length}
                  </span>
                )}
                <span className="text-[24px] leading-none">🪑</span>
                <span className="text-[14px] tracking-wide">Tables</span>
              </button>

            </div>

            {/* Context pill — shown when the cashier is adding items to a DINE_IN table
                from within the menu view. Lets them know which table they're working on. */}
            {isDineInMenuMode && orderCtx?.tableName && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-[#1E4FBF]/15 border border-[#1E4FBF]/30 rounded-xl">
                <span className="text-[14px]">🪑</span>
                <p className="text-[#93C5FD] text-[12px] font-semibold flex-1">
                  Adding items for Table {orderCtx.tableName}
                </p>
                <button
                  onClick={() => {
                    setOrderCtx({ orderType: "TAKEAWAY", tableId: null, tableName: null });
                    setTableOrder(null);
                    setConfirmedItems([]);
                    setCart([]);
                  }}
                  className="text-white/30 hover:text-white/70 text-[11px] transition"
                >
                  ✕ Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Bill request banner ── */}
        {billRequests.length > 0 && (
          <div className="shrink-0 border-b border-white/10 px-4 py-2 space-y-1.5 bg-[#BA7517]/5">
            {billRequests.map((req) => (
              <div key={req.orderId} className="flex items-center gap-3 px-4 py-3 bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-xl">
                <span className="text-[22px] shrink-0">🔔</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#D97706] leading-tight">
                    {req.tableNumber ? `Table ${req.tableNumber}` : req.orderNo} wants to pay
                  </p>
                  <p className="text-[12px] text-white/30 mt-0.5">{formatCurrency(req.totalAmount)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleBillRequestPay(req)} className="px-3 h-8 rounded-lg bg-[#D97706] text-white text-[13px] font-semibold hover:bg-[#B45309] transition">Pay</button>
                  <button onClick={() => handleReopenTable(req.orderId)} className="px-3 h-8 rounded-lg bg-white/10 text-white/60 text-[13px] hover:bg-white/20 hover:text-white transition">Reopen</button>
                  <button onClick={() => dismissBillRequest(req.orderId)} className="w-8 h-8 rounded-lg bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60 transition text-[14px] flex items-center justify-center">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Success toast ── */}
        {orderSuccessMsg && (
          <div className="shrink-0 px-4 py-2 bg-[#0D7A5F]/15 border-b border-[#0D7A5F]/20">
            <div className="flex items-center gap-2">
              <span className="text-[#0D7A5F] text-[15px]">✓</span>
              <p className="text-[#0D7A5F] text-[13px] font-medium">{orderSuccessMsg}</p>
            </div>
          </div>
        )}

        {/* ── Main body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── TABLES MODE: floor view ── */}
          {isRestaurant && restaurantMode === "tables" ? (
            <main className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-white text-[18px] font-semibold">Floor View</p>
                  <p className="text-white/30 text-[13px] mt-0.5">
                    {tableStatuses.filter((t) => t.order_id).length} of {tableStatuses.length} tables occupied
                  </p>
                </div>
                <button
                  onClick={loadTableStatuses}
                  disabled={tableStatusLoading}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-[13px] text-white/40 border border-white/10 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                >
                  {tableStatusLoading
                    ? <><span className="w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />Refreshing…</>
                    : <>↻ Refresh</>}
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 mb-5 px-1">
                {[
                  { dot: "bg-white/20",    label: "Available" },
                  { dot: "bg-[#93C5FD]",   label: "Occupied" },
                  { dot: "bg-[#D97706]",   label: "Bill requested" },
                ].map(({ dot, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                    <span className="text-[13px] text-white/40">{label}</span>
                  </div>
                ))}
              </div>

              {tableStatusLoading && tableStatuses.length === 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : tableStatuses.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <p className="text-white/20 text-[14px]">No tables configured</p>
                  <p className="text-white/15 text-[12px]">Add tables from the shop dashboard first.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {tableStatuses.map((table) => {
                    const isBillRequested = table.bill_requested && table.order_status === "CLOSING";
                    const isOccupied      = !!table.order_id && !isBillRequested;
                    const cardBorder = isBillRequested ? "border-[#D97706]/60" : isOccupied ? "border-[#1E4FBF]/50" : "border-white/8";
                    const cardBg     = isBillRequested ? "bg-[#D97706]/10"     : isOccupied ? "bg-[#1E4FBF]/10"     : "bg-white/[0.04]";
                    const dotColor   = isBillRequested ? "bg-[#D97706]"        : isOccupied ? "bg-[#93C5FD]"        : "bg-white/20";
                    const statusLabel = isBillRequested ? "Bill requested" : isOccupied ? "Occupied" : "Available";                    
                    const statusColor = isBillRequested ? "text-[#D97706]" : isOccupied ? "text-[#93C5FD]" : "text-white/25";
                    const totalAmount = table.total_amount ? parseFloat(table.total_amount) : null;
                    return (
                      <button
                        key={table.table_id}
                        onClick={() => {
                          if (isBillRequested && table.order_id) {
                            handleBillRequestPay({
                              orderId:     table.order_id,
                              orderNo:     table.order_no ?? "",
                              tableId:     table.table_id,
                              tableNumber: table.table_number,
                              totalAmount: totalAmount ?? 0,
                              timestamp:   table.order_started_at ?? "",
                            });
                          } else {
                            openTableModal(table);
                          }
                        }}
                        className={`relative flex flex-col gap-2.5 p-4 rounded-xl border text-left transition hover:brightness-125 active:scale-[0.97] cursor-pointer ${cardBorder} ${cardBg}`}
                      >
                        {isBillRequested && <span className="absolute top-3 right-3 text-[16px]">🔔</span>}
                        <p className="text-white font-bold text-[18px] leading-none pr-6">Table {table.table_number}</p>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className={`text-[13px] font-medium ${statusColor}`}>{statusLabel}</span>
                        </div>
                        {isBillRequested && totalAmount != null && (
                          <p className="text-[15px] font-bold text-[#D97706] mt-0.5">{formatCurrency(totalAmount)}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </main>

          ) : (
            // ── TAKEAWAY MODE (or DINE_IN table adding): category sidebar + product grid ──
            <>
              {/* Category sidebar */}
              <aside className="w-[190px] border-r border-white/10 flex flex-col overflow-y-auto shrink-0 py-3 gap-1 px-2">
                {activeSidebarCategories.map((cat: CategoryTab) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition ${activeCategory === cat.id ? "bg-white/15 text-white" : "text-white/40 hover:bg-white/10 hover:text-white/70"}`}
                  >
                    {cat.label}
                    <span className="ml-1.5 text-white/25 text-[13px]">({cat.count})</span>
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
                        className="bg-white/[0.08] hover:bg-white/15 border border-white/10 rounded-xl p-4 text-left transition active:scale-[0.97] flex flex-col gap-2 min-h-[90px]"
                      >
                        <p className="text-white text-[16px] font-semibold leading-snug line-clamp-2">{product.product_name}</p>
                        <p className="text-white/50 text-[14px] mt-auto font-medium">
                          {product.items.length === 1
                            ? formatCurrency(product.items[0].price)
                            : `From ${formatCurrency(Math.min(...product.items.map((v) => v.price)))}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </main>
            </>
          )}

          {/* ── Cart panel — always visible on the right ── */}
          {/* Hidden when in Tables mode so the floor view gets full width */}
          {(!isRestaurant || restaurantMode !== "tables") && (
            <aside className="w-[320px] border-l border-white/10 flex flex-col shrink-0">

              {/* Cart header — shows order context */}
              <div className="px-4 py-3 border-b border-white/10 shrink-0">
                {isDineInMenuMode && orderCtx?.tableName ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#1E4FBF]/15 border border-[#1E4FBF]/20 rounded-xl">
                    <span className="text-[20px]">🪑</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#93C5FD] text-[15px] font-semibold">Table {orderCtx.tableName}</p>
                      <p className="text-white/30 text-[12px]">Dine in order</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#0D7A5F]/10 border border-[#0D7A5F]/20 rounded-xl">
                    <span className="text-[20px]">🛒</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#4ADE80] text-[15px] font-semibold">Sale</p>
                      <p className="text-white/30 text-[12px]">New order</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Cart items scroll zone */}
              <div className="flex-1 overflow-y-auto">

                {loadingTableOrder && (
                  <div className="flex items-center justify-center h-20 gap-2">
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    <p className="text-white/30 text-[12px]">Loading order…</p>
                  </div>
                )}

                {/* Zone 1: Already ordered (DINE_IN table history) */}
                {!loadingTableOrder && hasConfirmedItems && (
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-2">Already ordered</p>
                    <div className="space-y-2">
                      {confirmedItems.map((item) => (
                        <div key={item.id} className="bg-white/[0.04] border border-white/5 rounded-xl px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-white/70 text-[14px] font-medium leading-tight truncate">
                                {item.product_name_snapshot}
                                {item.item_name_snapshot !== item.product_name_snapshot && (
                                  <span className="text-white/30 ml-1">— {item.item_name_snapshot}</span>
                                )}
                              </p>
                              {item.modifier_snapshot?.length > 0 && (
                                <p className="text-white/25 text-[12px] mt-0.5 truncate">
                                  {item.modifier_snapshot.map((m) => m.name).join(", ")}
                                </p>
                              )}
                              {item.item_note && (
                                <p className="text-white/20 text-[12px] mt-0.5 italic truncate">{item.item_note}</p>
                              )}
                              <p className="text-white/30 text-[13px] mt-1 font-medium">{formatCurrency(item.subtotal)}</p>
                            </div>
                            <span className="text-white/30 text-[14px] font-mono shrink-0 mt-0.5">×{item.qty}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-3 mb-1 px-1">
                      <p className="text-[12px] text-white/20">Sent to kitchen</p>
                      <p className="text-[13px] text-white/30 font-medium">{formatCurrency(confirmedSubtotal)}</p>
                    </div>
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-white/8" />
                      <p className="text-[11px] text-white/20 uppercase tracking-widest shrink-0">Add more</p>
                      <div className="flex-1 h-px bg-white/8" />
                    </div>
                  </div>
                )}

                {/* Zone 2: New items in cart */}
                <div className="px-4 py-3">
                  {cart.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-white/20 text-[14px]">
                        {hasConfirmedItems ? "Tap items to add more" : "Add items to start"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cart.map((line) => (
                        <div key={line.key} className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-[15px] font-semibold leading-tight truncate">
                                {line.productName}
                                {line.variantName !== line.productName && (
                                  <span className="text-white/40 ml-1 font-normal">— {line.variantName}</span>
                                )}
                              </p>
                              {line.modifiers.length > 0 && (
                                <p className="text-white/30 text-[12px] mt-0.5 truncate">
                                  {line.modifiers.map((m) => m.name).join(", ")}
                                </p>
                              )}
                              <p className="text-white/50 text-[13px] mt-1 font-medium">{formatCurrency(line.lineTotal)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                              <button onClick={() => updateQty(line.key, -1)} className="w-8 h-8 rounded-lg bg-white/10 text-white text-[16px] flex items-center justify-center hover:bg-white/20 transition">−</button>
                              <span className="text-white text-[15px] font-semibold w-5 text-center">{line.qty}</span>
                              <button onClick={() => updateQty(line.key, +1)} className="w-8 h-8 rounded-lg bg-white/10 text-white text-[16px] flex items-center justify-center hover:bg-white/20 transition">+</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Cart bottom panel ── */}
              <div className="px-4 py-4 border-t border-white/10 shrink-0 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-white/40 text-[14px]">
                    {hasConfirmedItems ? "Total" : `Subtotal (${cartCount} item${cartCount !== 1 ? "s" : ""})`}
                  </p>
                  <p className="text-white text-[20px] font-bold">{formatCurrency(displayTotal)}</p>
                </div>

                {/* State: DINE_IN table loaded with existing order */}
                {!activeOrder && tableOrder && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1E4FBF]/10 border border-[#1E4FBF]/20 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-[#93C5FD]" />
                      <p className="text-[#93C5FD] text-[13px] font-medium">#{tableOrder.order_no} — table open</p>
                    </div>
                    {cart.length > 0 && (
                      <button
                        onClick={placeOrder}
                        disabled={placing}
                        className="w-full h-12 rounded-xl bg-white/10 text-white text-[15px] font-semibold hover:bg-white/20 transition disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {placing ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</> : "Send to Kitchen"}
                      </button>
                    )}
                    <button
                      onClick={() => setShowPayModal(true)}
                      className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition"
                    >
                      Collect Payment
                    </button>
                  </div>
                )}

                {/* State: DINE_IN first order (no existing order on this table) */}
                {!activeOrder && !tableOrder && isRestaurant && orderCtx?.orderType === "DINE_IN" && (
                  <button
                    onClick={placeOrder}
                    disabled={placing || cart.length === 0}
                    className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {placing
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending to kitchen…</>
                      : "Place & Send to Kitchen"}
                  </button>
                )}

                {/* State: TAKEAWAY / RETAIL */}
                {!activeOrder && !tableOrder && isTakeawayOrRetail && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowPayModal(true)}
                      disabled={cart.length === 0 || (isRestaurant && !orderCtx)}
                      className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Collect Payment
                    </button>
                    {cart.length > 0 && (
                      <button
                        onClick={cancelOrder}
                        className="w-full h-10 rounded-xl bg-white/5 text-[#FF9B9B]/50 text-[14px] hover:bg-red-500/10 hover:text-[#FF9B9B] transition"
                      >
                        Clear Cart
                      </button>
                    )}
                  </div>
                )}

                {/* State: awaiting payment (DINE_IN order confirmed) */}
                {activeOrder && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1E4FBF]/10 border border-[#1E4FBF]/20 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-[#93C5FD] animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[#93C5FD] text-[13px] font-medium">#{activeOrder.order_no} — awaiting payment</p>
                        <p className="text-white/30 text-[12px]">{formatCurrency(activeOrder.total_amount)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPayModal(true)}
                      className="w-full h-[52px] rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 transition"
                    >
                      Collect Payment
                    </button>
                    {activeOrder.status === "OPEN" && !tableOrder && (
                      <button
                        onClick={cancelOrder}
                        disabled={cancelling}
                        className="w-full h-10 rounded-xl bg-white/5 text-[#FF9B9B]/50 text-[14px] hover:bg-red-500/10 hover:text-[#FF9B9B] transition disabled:opacity-40"
                      >
                        {cancelling ? "Cancelling…" : "Cancel Order"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}

        </div>
      </div>

      {/* ── Table detail modal ── */}
      {selectedTableModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <p className="text-white/40 text-[11px] uppercase tracking-widest mb-0.5">Table</p>
                <p className="text-white text-[22px] font-bold leading-none">{selectedTableModal.table_number}</p>
              </div>
              <button
                onClick={() => { setSelectedTableModal(null); setCancelConfirm(false); }}
                className="w-8 h-8 rounded-lg bg-white/5 text-white/30 hover:bg-white/15 hover:text-white transition flex items-center justify-center text-[16px]"
              >✕</button>
            </div>
            <div className="px-5 py-4 max-h-[40vh] overflow-y-auto">
              {modalOrderLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                  <p className="text-white/30 text-[13px]">Loading order…</p>
                </div>
              ) : modalOrderItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-1">
                  <p className="text-white/50 text-[15px] font-medium">Table is available</p>
                  <p className="text-white/25 text-[12px]">Start a new order below</p>
                </div>
              ) : (
                <>
                  <p className="text-white/30 text-[11px] uppercase tracking-widest mb-3">Current order</p>
                  <div className="space-y-2">
                    {modalOrderItems.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[14px] font-medium leading-snug">
                            {item.product_name_snapshot}
                            {item.item_name_snapshot !== item.product_name_snapshot && (
                              <span className="text-white/40 text-[13px] ml-1">— {item.item_name_snapshot}</span>
                            )}
                          </p>
                          {item.modifier_snapshot?.length > 0 && (
                            <p className="text-white/35 text-[12px] mt-0.5">{item.modifier_snapshot.map((m) => m.name).join(", ")}</p>
                          )}
                          {item.item_note && (
                            <p className="text-white/25 text-[12px] italic mt-0.5">{item.item_note}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white/50 text-[12px]">×{item.qty}</p>
                          <p className="text-white/70 text-[13px] font-medium">{formatCurrency(item.subtotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                    <p className="text-white/40 text-[13px]">Total</p>
                    <p className="text-white text-[18px] font-bold">{formatCurrency(modalOrder?.total_amount ?? 0)}</p>
                  </div>
                </>
              )}
            </div>
            <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
              <button
                onClick={handleModalAddItems}
                className="w-full h-14 rounded-xl bg-[#1E4FBF] text-white text-[16px] font-bold hover:bg-[#1a44a8] active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                <span className="text-[20px]">＋</span> Add Items
              </button>
              {modalOrder && (
                <button
                  onClick={handleModalPay}
                  className="w-full h-14 rounded-xl bg-[#0D7A5F] text-white text-[16px] font-bold hover:bg-opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2"
                >
                  <span className="text-[20px]">💳</span> Pay Now
                </button>
              )}
              <button
                onClick={() => setSelectedTableModal(null)}
                className="w-full h-10 text-white/30 text-[13px] hover:text-white/60 transition"
              >
                ← Back to Tables
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition ${!variant.is_active || variant.is_sold_out ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed" : "bg-white/8 border-white/10 hover:bg-white/15"}`}
                >
                  <span className="text-white text-[13px]">{variant.name}</span>
                  <span className="text-white/60 text-[13px]">{variant.is_sold_out ? "Sold out" : formatCurrency(variant.price)}</span>
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
              <button
                onClick={() => { setSheetProduct(null); setSheetVariant(null); setSelectedMods({}); setSheetNote(""); }}
                className="text-white/30 hover:text-white transition text-[18px]"
              >✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {sheetProduct.modifier_groups.map((group) => (
                <div key={group.id}>
                  <p className="text-white/70 text-[12px] font-semibold uppercase tracking-wide mb-2">
                    {group.name}{group.is_required && <span className="text-red-400 ml-1">*</span>}
                  </p>
                  <div className="space-y-1.5">
                    {group.options.map((opt) => {
                      const selected = (selectedMods[group.id] ?? []).includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleModToggle(group, opt.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition text-[13px] ${selected ? "bg-[#0D7A5F]/20 border-[#0D7A5F]/50 text-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}
                        >
                          <span>{opt.name}</span>
                          {opt.price_delta !== 0 && (
                            <span className="text-white/40 text-[12px]">+{formatCurrency(opt.price_delta)}</span>
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

      {/* ── Payment modal ── */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2B4C] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <p className="text-white/40 text-[11px] uppercase tracking-widest mb-0.5">
                  {payingOrder ? `Order #${payingOrder.order_no}` : "New Order"}
                </p>
                <p className="text-white font-bold text-[22px]">{formatCurrency(payModalTotal)}</p>
              </div>
              <button onClick={closePayModal} className="text-white/30 hover:text-white transition text-[18px]">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["CASH", "COD"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setPayMethod(m); setPayError(""); setReceivedAmount(""); }}
                    className={`h-10 rounded-xl text-[13px] font-semibold transition border ${payMethod === m ? "bg-[#0D7A5F] border-[#0D7A5F] text-white" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white"}`}
                  >
                    {m === "CASH" ? "💵 Cash" : "📦 COD"}
                  </button>
                ))}
              </div>

              {payMethod === "CASH" && (
                <>
                  <div className="bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-right">
                    <p className="text-white/30 text-[11px] mb-0.5">Amount received</p>
                    <p className="text-white text-[24px] font-bold tracking-wide">
                      {receivedAmount ? formatCurrency(parseFloat(receivedAmount) || 0) : "—"}
                    </p>
                    {receivedAmount && !isNaN(parseFloat(receivedAmount)) && parseFloat(receivedAmount) >= payModalTotal && (
                      <p className="text-[#0D7A5F] text-[13px] font-semibold mt-1">
                        Change: {formatCurrency(parseFloat(receivedAmount) - payModalTotal)}
                      </p>
                    )}
                    {receivedAmount && !isNaN(parseFloat(receivedAmount)) && parseFloat(receivedAmount) > 0 && parseFloat(receivedAmount) < payModalTotal && (
                      <p className="text-[#FF9B9B] text-[12px] mt-1">
                        Short by {formatCurrency(payModalTotal - parseFloat(receivedAmount))}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      payModalTotal,
                      ...[20, 50, 100, 200, 500, 1000].filter((d) => d > payModalTotal).slice(0, 3),
                    ].slice(0, 4).map((amount, idx) => (
                      <button
                        key={idx}
                        onClick={() => setReceivedAmount(String(amount))}
                        className={`h-8 rounded-lg text-[11px] font-medium transition border ${parseFloat(receivedAmount) === amount ? "bg-[#0D7A5F]/30 border-[#0D7A5F]/50 text-[#0D7A5F]" : "bg-white/8 border-white/10 text-white/60 hover:bg-white/15 hover:text-white"}`}
                      >
                        {amount === payModalTotal ? "Exact" : formatCurrency(amount)}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === "⌫") { setReceivedAmount((p) => p.slice(0, -1)); setPayError(""); }
                          else if (key === ".") { if (!receivedAmount.includes(".")) { setReceivedAmount((p) => (p || "0") + "."); setPayError(""); } }
                          else {
                            const next = receivedAmount + key;
                            const parts = next.split(".");
                            if (parts[1] && parts[1].length > 2) return;
                            setReceivedAmount(next); setPayError("");
                          }
                        }}
                        className={`h-12 rounded-xl text-white font-medium transition active:scale-95 ${key === "⌫" ? "bg-white/8 hover:bg-white/15 text-white/60 text-[18px]" : "bg-white/10 hover:bg-white/20 text-[18px]"}`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {payError && <p className="text-[#FF9B9B] text-[12px] text-center">{payError}</p>}

              <button
                onClick={processPayment}
                disabled={paying || (payMethod === "CASH" && (!receivedAmount || isNaN(parseFloat(receivedAmount)) || parseFloat(receivedAmount) < payModalTotal))}
                className="w-full h-12 rounded-xl bg-[#0D7A5F] text-white text-[15px] font-bold hover:bg-opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {paying
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
                  : payMethod === "COD" ? "Confirm COD Order" : "Confirm Payment"}
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
                onClick={() => {
                  setReceipt(null);
                  loadTableStatuses();
                }}
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