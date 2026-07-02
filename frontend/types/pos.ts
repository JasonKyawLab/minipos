// POS-terminal–specific types. Kept separate from the shared types/index.ts
// because these are only needed by the terminal and its sub-components.

export type ShopRole     = "OWNER" | "MANAGER" | "CASHIER" | "CHEF";
export type ShopType     = "RETAIL" | "RESTAURANT" | "ONLINE_SHOP";
export type PosOrderType = "RETAIL" | "DINE_IN" | "TAKEAWAY" | "ONLINE";

/** Which top-level mode the cashier is in for RESTAURANT shops. */
export type RestaurantMode = "takeaway" | "tables";

export interface MeResponse {
  userId:   string;
  userName: string;
  shopRole: ShopRole;
  shopId:   string;
  shopName: string;
  shopType: ShopType;
}

export interface ChosenModifier {
  modifier_option_id: string;
  name:               string;
  price_delta:        number;
}

export interface CartLine {
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

export interface ConfirmedItem {
  id:                    string;
  product_name_snapshot: string;
  item_name_snapshot:    string;
  unit_price_snapshot:   number;
  qty:                   number;
  subtotal:              number;
  modifier_snapshot:     Array<{ name: string; price_delta: number }>;
  item_note:             string | null;
}

export interface OrderContext {
  orderType: PosOrderType;
  tableId:   string | null;
  tableName: string | null;
}

export interface CategoryTab {
  id:    string;
  label: string;
  color: string | null;
  count: number;
}

export interface RestaurantTable {
  id:           string;
  table_number: string;
  is_active:    boolean;
}

export interface PublicMenuItemVariant {
  id:          string;
  name:        string;
  price:       number;
  is_active:   boolean;
  is_sold_out: boolean;
}

export interface PublicModifierGroup {
  id:          string;
  name:        string;
  is_required: boolean;
  min_select:  number;
  max_select:  number;
  options:     Array<{ id: string; name: string; price_delta: number }>;
}

export interface PublicMenuItem {
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

export interface ActiveOrder {
  id:           string;
  order_no:     string;
  total_amount: number;
  status:       "OPEN" | "CONFIRMED" | "CLOSING";
}

export interface BillRequest {
  orderId:     string;
  orderNo:     string;
  tableId:     string;
  tableNumber: string | null;
  totalAmount: number;
  timestamp:   string;
}

export interface TableStatus {
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

export interface PosOrderWithItems {
  id:           string;
  order_no:     string;
  total_amount: number;
  status:       "OPEN" | "CONFIRMED" | "CLOSING";
  items:        ConfirmedItem[];
}

export interface Receipt {
  order_no:      string;
  total_amount:  number;
  change_amount: number | null;
  method:        string;
}
