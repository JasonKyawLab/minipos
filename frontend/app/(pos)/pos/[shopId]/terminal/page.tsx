// Restaurant mode overview:
//   "takeaway" → product grid + cart, all new orders are TAKEAWAY.
//   "tables"   → floor view; cashier picks a table → DINE_IN context.

"use client";

import React, { useState, useEffect, useCallback, useReducer, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import posApi from "@/lib/posApi";
import { getErrorMessage } from "@/utils/errorMessages";
import { ModeGate } from "@/components/mode/ModeGate";
import { usePosSession } from "@/context/PosContext";
import { createFreshSocket } from "@/lib/socket";
import { debugLog }         from "@/utils/debugLog";

import type {
  RestaurantMode, OrderContext, ActiveOrder, ConfirmedItem,
  BillRequest, TableStatus, PosOrderWithItems,
  PublicMenuItem, PublicMenuItemVariant, PublicModifierGroup, Receipt,
} from "@/types/pos";

import { orderReducer, initialOrderState }   from "@/hooks/pos/orderReducer";
import { cartReducer, buildCartLine }         from "@/hooks/pos/cartReducer";
import { useMenu }                            from "@/hooks/pos/useMenu";
import { useTableStatuses }                   from "@/hooks/pos/useTableStatuses";

import { PosHeader }              from "@/components/pos/terminal/PosHeader";
import { RestaurantModeSelector } from "@/components/pos/terminal/RestaurantModeSelector";
import { BillRequestBanner }      from "@/components/pos/terminal/BillRequestBanner";
import { FloorView }              from "@/components/pos/terminal/FloorView";
import { CategorySidebar }        from "@/components/pos/terminal/CategorySidebar";
import { ProductGrid }            from "@/components/pos/terminal/ProductGrid";
import { CartPanel }              from "@/components/pos/terminal/CartPanel";
import { TableDetailModal }       from "@/components/pos/terminal/TableDetailModal";
import { VariantPickerModal }     from "@/components/pos/terminal/VariantPickerModal";
import { ModifierSheetModal }     from "@/components/pos/terminal/ModifierSheetModal";
import { PaymentModal }           from "@/components/pos/terminal/PaymentModal";
import { ReceiptModal }           from "@/components/pos/terminal/ReceiptModal";
import { ShiftSummaryModal }      from "@/components/pos/terminal/ShiftSummaryModal";

const SHIFT_START_KEY        = "minipos_shift_start";
const POS_FORCE_LOGOUT_EVENT = "pos:force_logout";

export default function PosTerminalPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const router     = useRouter();
  const { session, setSession } = usePosSession();

  // ── Session bootstrap ──────────────────────────────────
  useEffect(() => {
    if (session) return;
    posApi
      .get(`/api/shops/${shopId}/pos-auth/me`)
      .then(({ data }) => {
        setSession(data);
        if (!sessionStorage.getItem(SHIFT_START_KEY)) {
          sessionStorage.setItem(SHIFT_START_KEY, new Date().toISOString());
        }
      })
      .catch(() => { window.location.href = `/pos/${shopId}`; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRestaurant = session?.shopType === "RESTAURANT";
  const currency     = session?.currency ?? "THB";

  // ── Restaurant mode ────────────────────────────────────
  const [restaurantMode, setRestaurantMode] = useState<RestaurantMode>("takeaway");

  // ── Order state (consolidated via reducer) ─────────────
  const [order, dispatchOrder] = useReducer(orderReducer, initialOrderState);
  const orderRef = useRef(order);
  useEffect(() => { orderRef.current = order; }, [order]);

  useEffect(() => {
    if (!session) return;
    if (session.shopType === "RETAIL") {
      dispatchOrder({ type: "SET_CTX", payload: { orderType: "RETAIL", tableId: null, tableName: null } });
    } else if (session.shopType === "ONLINE_SHOP") {
      dispatchOrder({ type: "SET_CTX", payload: { orderType: "ONLINE", tableId: null, tableName: null } });
    } else if (session.shopType === "RESTAURANT") {
      dispatchOrder({ type: "SET_CTX", payload: { orderType: "TAKEAWAY", tableId: null, tableName: null } });
    }
  }, [session?.shopType]);

  // ── Cart state ─────────────────────────────────────────
  const [cart, dispatchCart] = useReducer(cartReducer, []);

  // ── Bill requests ──────────────────────────────────────
  const [billRequests, setBillRequests] = useState<BillRequest[]>([]);

  // ── Menu + table statuses (custom hooks) ───────────────
  const menu          = useMenu(shopId);
  const tableStatuses = useTableStatuses(shopId, isRestaurant, restaurantMode);

  // ── Picker / modifier sheet ────────────────────────────
  const [pickerProduct, setPickerProduct] = useState<PublicMenuItem | null>(null);
  const [sheetProduct, setSheetProduct]   = useState<PublicMenuItem | null>(null);
  const [sheetVariant, setSheetVariant]   = useState<PublicMenuItemVariant | null>(null);
  const [selectedMods, setSelectedMods]   = useState<Record<string, string[]>>({});
  const [sheetNote, setSheetNote]         = useState("");

  // ── Payment UI ─────────────────────────────────────────
  const [showPayModal, setShowPayModal]     = useState(false);
  const [payMethod, setPayMethod]           = useState<"CASH" | "COD">("CASH");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [payError, setPayError]             = useState("");
  const [paying, setPaying]                 = useState(false);
  const [placing, setPlacing]               = useState(false);
  const [cancelling, setCancelling]         = useState(false);
  const [receipt, setReceipt]               = useState<Receipt | null>(null);

  // ── Table detail modal ─────────────────────────────────
  const [selectedTable, setSelectedTable]       = useState<TableStatus | null>(null);
  const [modalOrder, setModalOrder]             = useState<ActiveOrder | null>(null);
  const [modalItems, setModalItems]             = useState<ConfirmedItem[]>([]);
  const [modalLoading, setModalLoading]         = useState(false);

  // ── Shift / exit ───────────────────────────────────────
  const [showExitGate, setShowExitGate]         = useState(false);
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [shiftDuration, setShiftDuration]       = useState("");
  const [endingShift, setEndingShift]           = useState(false);
  const [exitingMode, setExitingMode]           = useState(false);

  // ── Socket ─────────────────────────────────────────────
  // Use a ref so the socket effect doesn't re-create when tableStatuses.load reference changes
  const tableStatusesLoadRef = useRef(tableStatuses.load);
  useEffect(() => { tableStatusesLoadRef.current = tableStatuses.load; }, [tableStatuses.load]);

  useEffect(() => {
    const socket = createFreshSocket();
    socket.connect();

    socket.on("connect", () => {
      debugLog("[POS Socket] connected, id:", socket.id);
    });
    socket.on("terminal_room_joined", (data: { room: string; mode: string }) => {
      debugLog("[POS Socket] joined terminal room:", data);
    });

    socket.on(POS_FORCE_LOGOUT_EVENT, () => {
      posApi.post(`/api/shops/${shopId}/pos-auth/logout`).catch(() => {});
      sessionStorage.removeItem(SHIFT_START_KEY);
      window.location.href = `/pos/${shopId}`;
    });

    socket.on("qr:bill_requested", (payload: BillRequest) => {
      setBillRequests((prev) =>
        prev.some((r) => r.orderId === payload.orderId) ? prev : [payload, ...prev]
      );
      tableStatusesLoadRef.current();
    });

    socket.on("qr:order_placed", () => { tableStatusesLoadRef.current(); });

    socket.on("payment:processed", (payload: { orderId: string }) => {
      setBillRequests((prev) => prev.filter((r) => r.orderId !== payload.orderId));
      tableStatusesLoadRef.current();
    });

    socket.on("order:status_changed", (payload: {
      orderId:   string;
      orderNo:   string;
      newStatus: string;
      source?:   string;
    }) => {
      debugLog("[POS Socket] order:status_changed received:", payload);

      if (payload.newStatus === "CANCELLED") {
        const cur = orderRef.current;
        const isActive = cur.activeOrder?.id === payload.orderId;
        const isTable  = cur.tableOrder?.id  === payload.orderId;
        if (isActive || isTable) {
          dispatchOrder({ type: "CLEAR_AFTER_PAYMENT", isRestaurant: cur.orderCtx?.orderType === "DINE_IN" });
        }
        setModalOrder((prev) => (prev?.id === payload.orderId ? null : prev));
        setSelectedTable((prev) => (prev?.order_id === payload.orderId ? null : prev));
        setBillRequests((prev) => prev.filter((r) => r.orderId !== payload.orderId));
        toast.error(`Order #${payload.orderNo} was cancelled by kitchen staff.`);
      } else if (payload.newStatus === "PARTIAL_CANCEL") {
        // Some items were cancelled but food was already served — reload the open modal
        setSelectedTable((prev) => {
          if (prev?.order_id === payload.orderId) {
            // Re-fetch fresh order data for the modal
            posApi.get<PosOrderWithItems>(`/api/shops/${shopId}/pos-auth/orders/${payload.orderId}`)
              .then(({ data }) => {
                setModalItems(data.items ?? []);
                setModalOrder({ id: data.id, order_no: data.order_no, total_amount: data.total_amount, status: data.status });
              })
              .catch(() => {});
          }
          return prev;
        });
      }

      tableStatusesLoadRef.current();
    });

    return () => {
      socket.off("connect");
      socket.off("terminal_room_joined");
      socket.off(POS_FORCE_LOGOUT_EVENT);
      socket.off("qr:bill_requested");
      socket.off("qr:order_placed");
      socket.off("payment:processed");
      socket.off("order:status_changed");
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // ── Restaurant mode switches ────────────────────────────
  function switchToTakeaway() {
    setRestaurantMode("takeaway");
    if (order.orderCtx?.orderType === "DINE_IN") {
      dispatchOrder({ type: "RESET_TO_TAKEAWAY" });
      dispatchCart({ type: "CLEAR" });
    }
  }

  function switchToTables() {
    setRestaurantMode("tables");
    tableStatuses.load();
  }

  function cancelDineIn() {
    dispatchOrder({ type: "RESET_TO_TAKEAWAY" });
    dispatchCart({ type: "CLEAR" });
  }

  // ── Cart helpers ───────────────────────────────────────
  function addToCart(
    product:   PublicMenuItem,
    variant:   PublicMenuItemVariant,
    modifiers: { modifier_option_id: string; name: string; price_delta: number }[],
    note:      string
  ) {
    dispatchCart({ type: "ADD", line: buildCartLine(product, variant, modifiers, note) });
    setSheetProduct(null);
    setSheetVariant(null);
    setPickerProduct(null);
    setSelectedMods({});
    setSheetNote("");
  }

  function handleModToggle(group: PublicModifierGroup, optionId: string) {
    setSelectedMods((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max_select === 1) return { ...prev, [group.id]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function confirmSheetAdd() {
    if (!sheetProduct || !sheetVariant) return;
    const chosen = sheetProduct.modifier_groups.flatMap((g) =>
      (selectedMods[g.id] ?? []).map((optId) => {
        const opt = g.options.find((o) => o.id === optId)!;
        return { modifier_option_id: opt.id, name: opt.name, price_delta: opt.price_delta };
      })
    );
    addToCart(sheetProduct, sheetVariant, chosen, sheetNote);
  }

  // ── Table detail modal ─────────────────────────────────
  async function openTableModal(table: TableStatus) {
    setSelectedTable(table);
    setModalItems([]);
    setModalOrder(null);
    if (!table.order_id) return;
    setModalLoading(true);
    try {
      const { data } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${table.order_id}`
      );
      setModalItems(data.items ?? []);
      setModalOrder({ id: data.id, order_no: data.order_no, total_amount: data.total_amount, status: data.status });
    } catch {
      toast.error("Could not load table order.");
    } finally {
      setModalLoading(false);
    }
  }

  function handleModalAddItems() {
    if (!selectedTable) return;
    dispatchOrder({ type: "SET_CTX", payload: { orderType: "DINE_IN", tableId: selectedTable.table_id, tableName: selectedTable.table_number } });
    dispatchOrder({ type: "SET_TABLE_ORDER", payload: modalOrder });
    dispatchOrder({ type: "SET_CONFIRMED", payload: modalItems });
    dispatchCart({ type: "CLEAR" });
    dispatchOrder({ type: "SET_ACTIVE", payload: null });
    setSelectedTable(null);
    setRestaurantMode("takeaway");
  }

  function handleModalPay() {
    if (!selectedTable || !modalOrder) return;
    dispatchOrder({ type: "SET_TABLE_ORDER", payload: null });
    dispatchOrder({ type: "SET_CONFIRMED", payload: modalItems });
    dispatchOrder({ type: "SET_ACTIVE", payload: modalOrder });
    setSelectedTable(null);
    setShowPayModal(true);
  }

  // ── Place DINE_IN order ────────────────────────────────
  async function placeOrder() {
    if (cart.length === 0 || !order.orderCtx || order.orderCtx.orderType !== "DINE_IN") return;
    setPlacing(true);
    try {
      const targetOrderId = order.tableOrder?.id ?? null;
      let orderId: string;

      if (targetOrderId) {
        orderId = targetOrderId;
      } else {
        const { data: newOrder } = await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders`,
          { order_type: order.orderCtx.orderType, table_id: order.orderCtx.tableId ?? undefined }
        );
        orderId = newOrder.id;
      }

      for (const line of cart) {
        await posApi.post(`/api/shops/${shopId}/pos-auth/orders/${orderId}/items`, {
          product_item_id: line.variantId,
          qty:             line.qty,
          modifiers:       line.modifiers.map((m) => ({ modifier_option_id: m.modifier_option_id })),
          item_note:       line.note || undefined,
        });
      }

      const { data: finalOrder } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${orderId}`
      );

      if (finalOrder.status === "OPEN") {
        await posApi.patch(`/api/shops/${shopId}/pos-auth/orders/${orderId}/status`, { status: "CONFIRMED" });
      } else if (finalOrder.status === "CONFIRMED" && targetOrderId) {
        await posApi
          .post(`/api/shops/${shopId}/pos-auth/orders/${orderId}/kitchen-ticket`, {})
          .catch(() => {});
      }

      const tableName = order.orderCtx.tableName ?? order.orderCtx.tableId ?? "table";
      dispatchCart({ type: "CLEAR" });
      dispatchOrder({ type: "RESET_TO_TAKEAWAY" });
      setRestaurantMode("tables");
      tableStatuses.load();
      dispatchOrder({ type: "SET_SUCCESS_MSG", payload: `Table ${tableName} sent to kitchen ✓` });
      setTimeout(() => dispatchOrder({ type: "SET_SUCCESS_MSG", payload: "" }), 3000);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message ?? "ORDER_FAILED"));
    } finally {
      setPlacing(false);
    }
  }

  // ── Cancel / clear cart ────────────────────────────────
  async function cancelOrder() {
    const isTakeawayOrRetail =
      order.orderCtx?.orderType === "TAKEAWAY" ||
      order.orderCtx?.orderType === "RETAIL"   ||
      !isRestaurant;

    if (isTakeawayOrRetail && !order.activeOrder) {
      dispatchCart({ type: "CLEAR" });
      if (!isRestaurant) {
        dispatchOrder({ type: "SET_CTX", payload: { orderType: "RETAIL", tableId: null, tableName: null } });
      }
      return;
    }

    const target = modalOrder ?? order.activeOrder ?? order.tableOrder;
    if (!target) return;

    setCancelling(true);
    try {
      await posApi.patch(`/api/shops/${shopId}/pos-auth/orders/${target.id}/status`, { status: "CANCELLED" });
      dispatchCart({ type: "CLEAR" });
      dispatchOrder({ type: "SET_ACTIVE", payload: null });
      dispatchOrder({ type: "SET_TABLE_ORDER", payload: null });
      dispatchOrder({ type: "SET_CONFIRMED", payload: [] });
      setShowPayModal(false);
      setReceivedAmount("");
      setSelectedTable(null);
      if (isRestaurant) {
        dispatchOrder({ type: "RESET_TO_TAKEAWAY" });
        setRestaurantMode("tables");
        tableStatuses.load();
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message ?? "CANCEL_FAILED"));
    } finally {
      setCancelling(false);
    }
  }

  // ── Process payment ────────────────────────────────────
  async function processPayment() {
    setPaying(true);
    setPayError("");

    try {
      const payingOrder = order.activeOrder ?? order.tableOrder;
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
            setPayError(`Amount received must be at least ${amount}`);
            return;
          }
        }
      } else {
        if (cart.length === 0 || !order.orderCtx) return;

        const estimatedTotal = cart.reduce((s, l) => s + l.lineTotal, 0);
        if (payMethod === "CASH") {
          const received = parseFloat(receivedAmount);
          if (isNaN(received) || received < estimatedTotal) {
            setPayError(`Amount received must be at least ${estimatedTotal}`);
            return;
          }
        }

        const { data: newOrder } = await posApi.post(
          `/api/shops/${shopId}/pos-auth/orders`,
          { order_type: order.orderCtx.orderType, table_id: order.orderCtx.tableId ?? undefined }
        );

        for (const line of cart) {
          await posApi.post(`/api/shops/${shopId}/pos-auth/orders/${newOrder.id}/items`, {
            product_item_id: line.variantId,
            qty:             line.qty,
            modifiers:       line.modifiers.map((m) => ({ modifier_option_id: m.modifier_option_id })),
            item_note:       line.note || undefined,
          });
        }

        const { data: finalOrder } = await posApi.get<PosOrderWithItems>(
          `/api/shops/${shopId}/pos-auth/orders/${newOrder.id}`
        );

        orderId = finalOrder.id;
        orderNo = finalOrder.order_no;
        amount  = finalOrder.total_amount;

        // Re-validate after server finalises the total
        if (payMethod === "CASH") {
          const received = parseFloat(receivedAmount);
          if (isNaN(received) || received < amount) {
            await posApi
              .patch(`/api/shops/${shopId}/pos-auth/orders/${orderId}/status`, { status: "CANCELLED" })
              .catch(() => {});
            setPayError(`Amount received must be at least ${amount}`);
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

      setReceipt({ order_no: orderNo, total_amount: amount, change_amount: data.change_amount ?? null, method: payMethod });
      setBillRequests((prev) => prev.filter((r) => r.orderId !== orderId));
      dispatchCart({ type: "CLEAR" });
      dispatchOrder({ type: "CLEAR_AFTER_PAYMENT", isRestaurant });
      setShowPayModal(false);
      setReceivedAmount("");
      setPayMethod("CASH");
      if (isRestaurant) tableStatuses.load();
    } catch (err: any) {
      setPayError(getErrorMessage(err.response?.data?.message ?? "PAYMENT_FAILED"));
    } finally {
      setPaying(false);
    }
  }

  // ── Bill request actions ───────────────────────────────
  async function handleBillPay(req: BillRequest) {
    try {
      const { data: orderData } = await posApi.get<PosOrderWithItems>(
        `/api/shops/${shopId}/pos-auth/orders/${req.orderId}`
      );
      dispatchOrder({ type: "SET_TABLE_ORDER", payload: null });
      dispatchOrder({ type: "SET_CONFIRMED", payload: orderData.items ?? [] });
      dispatchOrder({ type: "SET_ACTIVE", payload: { id: orderData.id, order_no: orderData.order_no, total_amount: orderData.total_amount, status: orderData.status } });
      setShowPayModal(true);
    } catch {
      toast.error("Could not load order for payment.");
    }
  }

  async function handleReopen(orderId: string) {
    try {
      await posApi.post(`/api/shops/${shopId}/pos-auth/orders/${orderId}/reopen`);
      setBillRequests((prev) => prev.filter((r) => r.orderId !== orderId));
      tableStatuses.load();
    } catch {
      toast.error("Could not reopen order.");
    }
  }

  function dismissBillRequest(orderId: string) {
    setBillRequests((prev) => prev.filter((r) => r.orderId !== orderId));
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
  const payingOrder        = order.activeOrder ?? order.tableOrder;
  const isDineInMenuMode   = order.orderCtx?.orderType === "DINE_IN" && restaurantMode === "takeaway";
  const isTakeawayOrRetail = order.orderCtx?.orderType === "TAKEAWAY" || order.orderCtx?.orderType === "RETAIL" || !isRestaurant;
  const payModalTotal      = payingOrder?.total_amount ?? cart.reduce((s, l) => s + l.lineTotal, 0);
  const payModalLabel      = payingOrder ? `Order #${payingOrder.order_no}` : "New Order";

  function closePayModal() {
    setShowPayModal(false);
    setPayError("");
    setReceivedAmount("");
    if (!payingOrder) dispatchOrder({ type: "SET_CONFIRMED", payload: [] });
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <>
      <div className="h-screen bg-[#0F2B4C] flex flex-col overflow-hidden">
        <PosHeader
          session={session}
          endingShift={endingShift}
          exitingMode={exitingMode}
          onEndShift={handleEndShiftClick}
          onExitMode={() => setShowExitGate(true)}
        />

        {isRestaurant && (
          <RestaurantModeSelector
            mode={restaurantMode}
            billRequestCount={billRequests.length}
            orderCtx={order.orderCtx}
            onSaleClick={switchToTakeaway}
            onTablesClick={switchToTables}
            onCancelDineIn={cancelDineIn}
          />
        )}

        <BillRequestBanner
          requests={billRequests}
          currency={currency}
          onPay={handleBillPay}
          onReopen={handleReopen}
          onDismiss={dismissBillRequest}
        />

        {order.successMsg && (
          <div className="shrink-0 px-4 py-2 bg-[#0D7A5F]/15 border-b border-[#0D7A5F]/20">
            <div className="flex items-center gap-2">
              <span className="text-[#0D7A5F] text-[15px]">✓</span>
              <p className="text-[#0D7A5F] text-[13px] font-medium">{order.successMsg}</p>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {isRestaurant && restaurantMode === "tables" ? (
            <FloorView
              tableStatuses={tableStatuses.data}
              loading={tableStatuses.loading}
              currency={currency}
              onRefresh={tableStatuses.load}
              onBillPay={handleBillPay}
              onTableClick={openTableModal}
            />
          ) : (
            <>
              <CategorySidebar
                categories={menu.categories}
                activeCategory={menu.activeCategory}
                onSelect={menu.setActiveCategory}
              />
              <ProductGrid
                items={menu.categorisedMenu[menu.activeCategory] ?? []}
                loading={menu.loading}
                error={menu.error}
                currency={currency}
                onItemClick={(product) => {
                  if (product.items.length === 1 && product.modifier_groups.length === 0) {
                    addToCart(product, product.items[0], [], "");
                  } else {
                    setPickerProduct(product);
                  }
                }}
              />
            </>
          )}

          {(!isRestaurant || restaurantMode !== "tables") && (
            <CartPanel
              cart={cart}
              confirmedItems={order.confirmedItems}
              orderCtx={order.orderCtx}
              activeOrder={order.activeOrder}
              tableOrder={order.tableOrder}
              loadingTableOrder={order.loadingTableOrder}
              isRestaurant={isRestaurant}
              isDineInMenuMode={isDineInMenuMode}
              placing={placing}
              cancelling={cancelling}
              currency={currency}
              onUpdateQty={(key, delta) => dispatchCart({ type: "UPDATE_QTY", key, delta })}
              onPlaceOrder={placeOrder}
              onCollectPayment={() => setShowPayModal(true)}
              onClearCart={() => dispatchCart({ type: "CLEAR" })}
              onCancelOrder={cancelOrder}
            />
          )}
        </div>
      </div>

      <TableDetailModal
        table={selectedTable}
        order={modalOrder}
        items={modalItems}
        loading={modalLoading}
        currency={currency}
        onClose={() => { setSelectedTable(null); }}
        onAddItems={handleModalAddItems}
        onPay={handleModalPay}
      />

      <VariantPickerModal
        product={pickerProduct}
        currency={currency}
        onClose={() => setPickerProduct(null)}
        onDirectAdd={(product, variant) => addToCart(product, variant, [], "")}
        onOpenModifiers={(product, variant) => {
          setSheetProduct(product);
          setSheetVariant(variant);
          setPickerProduct(null);
        }}
      />

      <ModifierSheetModal
        product={sheetProduct}
        variant={sheetVariant}
        selectedMods={selectedMods}
        note={sheetNote}
        currency={currency}
        onClose={() => { setSheetProduct(null); setSheetVariant(null); setSelectedMods({}); setSheetNote(""); }}
        onModToggle={handleModToggle}
        onNoteChange={setSheetNote}
        onConfirm={confirmSheetAdd}
      />

      <PaymentModal
        open={showPayModal}
        orderLabel={payModalLabel}
        total={payModalTotal}
        payMethod={payMethod}
        receivedAmount={receivedAmount}
        payError={payError}
        paying={paying}
        currency={currency}
        onClose={closePayModal}
        onMethodChange={(m) => { setPayMethod(m); setPayError(""); setReceivedAmount(""); }}
        onAmountChange={(v) => { setReceivedAmount(v); setPayError(""); }}
        onConfirm={processPayment}
      />

      <ReceiptModal
        receipt={receipt}
        currency={currency}
        onNewOrder={() => { setReceipt(null); tableStatuses.load(); }}
      />

      <ShiftSummaryModal
        open={showShiftSummary}
        shiftDuration={shiftDuration}
        onConfirm={handleShiftConfirmed}
        onCancel={() => setShowShiftSummary(false)}
      />

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
