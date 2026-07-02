//
// CHANGE: Added category fields to PublicMenuItem so the
// updated getPublicMenu query (which JOINs product_categories)
// compiles without TS error 2353.

// Attached to req by qr.middleware.ts after resolving token
export interface QrContext {
  shopId:      string;
  tableId:     string;
  tableNumber: string;
}

// Public menu item — only safe fields exposed to customers/POS
export interface PublicMenuItem {
  product_model_id:    string;
  product_name:        string;
  description:         string | null;
  image_url:           string | null;
  // Category fields — populated from LEFT JOIN product_categories.
  // Null when the product has no category assigned.
  category_id:         string | null;
  category_name:       string | null;
  category_color:      string | null;
  category_sort_order: number;
  items:               PublicMenuItemVariant[];
  modifier_groups:     PublicModifierGroup[];
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
  options:     PublicModifierOption[];
}

export interface PublicModifierOption {
  id:          string;
  name:        string;
  price_delta: number;
}

// Input from customer when placing a QR order
export interface PlaceQrOrderInput {
  customer_name?: string;
  items:          QrOrderItemInput[];
  notes?:         string;
}

export interface QrOrderItemInput {
  product_item_id: string;
  qty:             number;
  modifiers?:      QrModifierInput[];
  item_note?:      string;
}

export interface QrModifierInput {
  modifier_option_id: string;
  name:               string;
  price_delta:        number;
}