import type { OrderContext, ActiveOrder, ConfirmedItem } from "@/types/pos";

export interface OrderState {
  orderCtx:          OrderContext | null;
  activeOrder:       ActiveOrder | null;
  tableOrder:        ActiveOrder | null;
  confirmedItems:    ConfirmedItem[];
  loadingTableOrder: boolean;
  successMsg:        string;
}

export type OrderAction =
  | { type: "SET_CTX";                payload: OrderContext | null }
  | { type: "SET_ACTIVE";             payload: ActiveOrder | null }
  | { type: "SET_TABLE_ORDER";        payload: ActiveOrder | null }
  | { type: "SET_CONFIRMED";          payload: ConfirmedItem[] }
  | { type: "SET_LOADING_TABLE";      payload: boolean }
  | { type: "SET_SUCCESS_MSG";        payload: string }
  | { type: "RESET_TO_TAKEAWAY" }
  | { type: "CLEAR_AFTER_PAYMENT";    isRestaurant: boolean };

export const initialOrderState: OrderState = {
  orderCtx:          null,
  activeOrder:       null,
  tableOrder:        null,
  confirmedItems:    [],
  loadingTableOrder: false,
  successMsg:        "",
};

export function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case "SET_CTX":
      return { ...state, orderCtx: action.payload };

    case "SET_ACTIVE":
      return { ...state, activeOrder: action.payload };

    case "SET_TABLE_ORDER":
      return { ...state, tableOrder: action.payload };

    case "SET_CONFIRMED":
      return { ...state, confirmedItems: action.payload };

    case "SET_LOADING_TABLE":
      return { ...state, loadingTableOrder: action.payload };

    case "SET_SUCCESS_MSG":
      return { ...state, successMsg: action.payload };

    case "RESET_TO_TAKEAWAY":
      return {
        ...state,
        orderCtx:       { orderType: "TAKEAWAY", tableId: null, tableName: null },
        activeOrder:    null,
        tableOrder:     null,
        confirmedItems: [],
      };

    case "CLEAR_AFTER_PAYMENT":
      return {
        ...state,
        activeOrder:    null,
        tableOrder:     null,
        confirmedItems: [],
        orderCtx: action.isRestaurant
          ? { orderType: "TAKEAWAY", tableId: null, tableName: null }
          : state.orderCtx,
      };
  }
}
