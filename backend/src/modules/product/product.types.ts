//
// CHANGES: Added ProductCategory type and related DTOs.
//          Added category_id to ProductModel.

// ── Product Category ──────────────────────────────────────

export interface ProductCategory {
  id:         string;
  shop_id:    string;
  name:       string;
  color:      string | null;   // hex, e.g. "#0D7A5F"
  image_url:  string | null;   // reserved for future upload
  sort_order: number;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductCategoryInput {
  shopId:    string;
  name:      string;
  color?:    string;
  image_url?: string;
}

export interface UpdateProductCategoryInput {
  name?:       string;
  color?:      string;
  image_url?:  string;
  sort_order?: number;
}

// ── Product Model ─────────────────────────────────────────

export interface ProductModel {
  id:          string;
  shop_id:     string;
  category_id: string | null;  // NEW — null = Uncategorised
  name:        string;
  description: string | null;
  image_url:   string | null;
  is_active:   boolean;
  is_deleted:  boolean;
  created_at:  Date;
  updated_at:  Date;
}

// ── Product Item (SKU) ────────────────────────────────────

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
  created_at:       Date;
  updated_at:       Date;
}

// ── Inventory Movement ────────────────────────────────────

export type InventoryMovementType = "SALE" | "PURCHASE" | "ADJUSTMENT" | "REFUND";

export interface InventoryMovement {
  id:              string;
  shop_id:         string;
  product_item_id: string;
  type:            InventoryMovementType;
  quantity:        number;
  reference_id:    string | null;
  notes:           string | null;
  created_by:      string | null;
  created_at:      Date;
}

// ── Create / Update DTOs ──────────────────────────────────

export interface CreateProductModelInput {
  shopId:      string;
  name:        string;
  description?: string;
  image_url?:  string;
  category_id?: string;  // NEW — optional at creation
}

export interface UpdateProductModelInput {
  name?:        string;
  description?: string;
  image_url?:   string;
  category_id?: string | null;  // null explicitly uncategorises
}

export interface CreateProductItemInput {
  productModelId: string;
  name:           string;
  sku?:           string;
  barcode?:       string;
  price:          number;
  cost_price?:    number;
  track_stock?:   boolean;
  stock_qty?:     number;
}

export interface UpdateProductItemInput {
  name?:        string;
  sku?:         string;
  barcode?:     string;
  price?:       number;
  cost_price?:  number;
  track_stock?: boolean;
}

export interface CreateInventoryMovementInput {
  shopId:        string;
  productItemId: string;
  type:          InventoryMovementType;
  quantity:      number;
  reference_id?: string;
  notes?:        string;
  createdBy:     string;
}