// =========================================================
// modifier.types.ts
// Path: backend/src/modules/modifier/modifier.types.ts
// =========================================================

// ── Modifier Group ────────────────────────────────────────
export interface ModifierGroup {
  id: string;
  product_model_id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_deleted: boolean;
  created_at: Date;
}

// ── Modifier Option ───────────────────────────────────────
export interface ModifierOption {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;           // can be negative (discount modifier)
  linked_product_item_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
}

// ── Create / Update DTOs ──────────────────────────────────

export interface CreateModifierGroupInput {
  shopId: string;                // used for ownership validation
  name: string;
  is_required?: boolean;
  min_select?: number;
  max_select?: number;
  sort_order?: number;
}

export interface UpdateModifierGroupInput {
  name?: string;
  is_required?: boolean;
  min_select?: number;
  max_select?: number;
  sort_order?: number;
}

export interface CreateModifierOptionInput {
  groupId: string;
  name: string;
  price_delta?: number;
  linked_product_item_id?: string;
  sort_order?: number;
}

export interface UpdateModifierOptionInput {
  name?: string;
  price_delta?: number;
  linked_product_item_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
}