// ── Auth / User ───────────────────────────────────────────

export type UserRole   = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type ShopRole   = "OWNER" | "MANAGER" | "CASHIER" | "CHEF";

export type UserPlan = "free" | "pro";

export interface User {
  id:            string;
  name:          string;
  email:         string;
  role:          UserRole;
  status:        UserStatus;
  plan:          UserPlan;
  is_deleted:    boolean;
  shop_count:    number;
  created_at:    string;
  last_seen_at?: string;
}

// ── Shop ──────────────────────────────────────────────────

export type ShopType = "RETAIL" | "RESTAURANT" | "ONLINE_SHOP";
export type Currency = "USD" | "SGD" | "THB" | "MMK" | "EUR";

export interface Shop {
  id:               string;
  owner_id:         string;
  name:             string;
  shop_type:        ShopType;
  currency:         Currency;
  tax_rate:         number;
  timezone:         string;
  pin_max_attempts: number;
  is_deleted:       boolean;
  is_suspended:     boolean;
  suspended_reason: string | null;
  suspended_at:     string | null;
  owner_name:       string | null;
  owner_email:      string | null;
  created_at:       string;
  updated_at:       string;
}

export interface UserShop {
  shopId:    string;
  shopName:  string;
  shopType:  ShopType;
  currency:  Currency;
  timezone:  string;
  role:      ShopRole;
}

// ── Staff ─────────────────────────────────────────────────

export interface StaffMember {
  id:    string;
  name:  string;
  email: string;
  role:  ShopRole;
}

export interface PosStaffItem {
  user_id:   string;
  name:      string;
  role:      ShopRole;
  has_pin:   boolean;
  is_locked: boolean;
}

// ── Restaurant Table ──────────────────────────────────────

export interface RestaurantTable {
  id:           string;
  shop_id:      string;
  table_number: string;
  capacity:     number | null;
  qr_token:     string;
  is_active:    boolean;
  created_at:   string;
}

// ── Product Category ─────────────────────────────────────

export interface ProductCategory {
  id:         string;
  shop_id:    string;
  name:       string;
  color:      string | null;   // hex e.g. "#0D7A5F" — used in POS sidebar
  image_url:  string | null;   // reserved for future upload feature
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// ── Product ───────────────────────────────────────────────

export interface ProductModel {
  id:             string;
  shop_id:        string;
  category_id:    string | null;
  category_name:  string | null;
  category_color: string | null;
  name:           string;
  description:    string | null;
  image_url:      string | null;
  is_active:      boolean;
  is_deleted:     boolean;
  created_at:     string;
  updated_at:     string;
}

export interface ProductItem {
  id:               string;
  product_model_id: string;
  name:             string;
  sku:              string | null;
  barcode:          string | null;
  price:            number;
  cost_price:       number | null;
  track_stock:      boolean;
  stock_qty:        number;
  is_active:        boolean;
  is_sold_out:      boolean;
  created_at:       string;
  updated_at:       string;
}

export interface ModifierGroup {
  id:          string;
  shop_id:     string;
  name:        string;
  is_required: boolean;
  min_select:  number;
  max_select:  number;
  sort_order:  number;
  is_deleted:  boolean;
  created_at:  string;
}

export interface ModifierOption {
  id:                     string;
  group_id:               string;
  name:                   string;
  price_delta:            number;
  linked_product_item_id: string | null;
  is_active:              boolean;
  sort_order:             number;
  created_at:             string;
}

// ── Order ─────────────────────────────────────────────────

export type OrderType =
  | "RETAIL" | "DINE_IN" | "TAKEAWAY" | "ONLINE"
  | "DELIVERY" | "PICKUP" | "QR";

export type OrderStatus =
  | "OPEN" | "CONFIRMED" | "CLOSING" | "PAID" | "CANCELLED" | "REFUNDED";

export type OrderItemStatus = "ACTIVE" | "CANCELLED" | "REFUNDED";

export interface ModifierSnapshot {
  modifier_option_id: string;
  name:               string;
  price_delta:        number;
}

// _snapshot fields are point-in-time copies captured at sale time — column names mirror the DB exactly.
export interface OrderItem {
  id:                    string;
  order_id:              string;
  product_item_id:       string | null;
  product_name_snapshot: string;
  item_name_snapshot:    string;
  unit_price_snapshot:   number;
  qty:                   number;
  subtotal:              number;
  status:                OrderItemStatus;
  modifier_snapshot:     ModifierSnapshot[];
  item_note:             string | null;
  created_at:            string;
}

export interface Order {
  id:              string;
  shop_id:         string;
  order_no:        string;
  order_type:      OrderType;
  status:          OrderStatus;
  bill_requested:    boolean;
  bill_requested_at: string | null;
  table_id:        string | null;
  cashier_id:      string | null;
  subtotal:        number;
  tax_amount:      number;
  discount_amount: number;
  total_amount:    number;
  customer_name:   string | null;
  customer_phone:  string | null;
  delivery_address: string | null;
  delivery_note:   string | null;
  notes:           string | null;
  cancelled_at:    string | null;
  completed_at:    string | null;
  created_at:      string;
  updated_at:      string;
  items?:          OrderItem[];
  cashier_name:    string | null;
  table_number:    string | null;
}

// ── Payment ───────────────────────────────────────────────

export type PaymentMethod = "CASH" | "COD";

export type PaymentStatus =
  | "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export interface Payment {
  id:              string;
  order_id:        string;
  method:          PaymentMethod;
  amount:          number;
  received_amount: number | null;
  change_amount:   number | null;
  status:          PaymentStatus;
  transaction_ref: string | null;
  note:            string | null;
  paid_at:         string | null;
  created_at:      string;
}

// ── Reports ───────────────────────────────────────────────

export interface SalesSummary {
  period_from:          string;
  period_to:            string;
  total_orders:         number;
  paid_orders:          number;
  cancelled_orders:     number;
  refunded_orders:      number;
  gross_revenue:        number;
  tax_collected:        number;
  discount_given:       number;
  net_revenue:          number;
  total_refunded:       number;
  average_order_value:  number;
}

// ── POS Menu (public-facing) ──────────────────────────────

export interface PublicMenuItemVariant {
  id:          string;
  name:        string;
  price:       number;
  is_active:   boolean;
  is_sold_out: boolean;
}

export interface PublicModifierOption {
  id:          string;
  name:        string;
  price_delta: number;
}

export interface PublicModifierGroup {
  id:          string;
  name:        string;
  is_required: boolean;
  min_select:  number;
  max_select:  number;
  options:     PublicModifierOption[];
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

// ── Cart (POS client-state only — never sent to backend) ──

export interface CartItem {
  orderItemId:   string;
  productItemId: string;
  productName:   string;
  itemName:      string;
  price:         number;
  qty:           number;
  subtotal:      number;
  modifiers:     ModifierSnapshot[];
  itemNote?:     string;
}

// ── API response wrappers ─────────────────────────────────

export interface ApiError {
  message: string;
}