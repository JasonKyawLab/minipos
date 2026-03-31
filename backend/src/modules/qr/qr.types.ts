// =========================================================
// qr.types.ts
// Path: backend/src/modules/qr/qr.types.ts
// =========================================================
// Types for the QR ordering flow.
// Kept minimal — most types are reused from order.types.ts.
// =========================================================

// Attached to req by qr.middleware.ts after resolving token
export interface QrContext {
  shopId: string;
  tableId: string;
  tableNumber: string;
}

// Public menu item — only safe fields exposed to customers
export interface PublicMenuItem {
  product_model_id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  items: PublicMenuItemVariant[];
  modifier_groups: PublicModifierGroup[];
}

export interface PublicMenuItemVariant {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  is_sold_out: boolean;
}

export interface PublicModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: PublicModifierOption[];
}

export interface PublicModifierOption {
  id: string;
  name: string;
  price_delta: number;
}

// Input from customer when placing a QR order
export interface PlaceQrOrderInput {
  customer_name?: string;
  items: QrOrderItemInput[];
  notes?: string;
}

export interface QrOrderItemInput {
  product_item_id: string;
  qty: number;
  modifiers?: QrModifierInput[];
  item_note?: string;
}

export interface QrModifierInput {
  modifier_option_id: string;
  name: string;
  price_delta: number;
}