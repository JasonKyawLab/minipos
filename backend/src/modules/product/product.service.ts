// =========================================================
// product.service.ts
// Path: backend/src/modules/product/product.service.ts
//
// CHANGES:
//   - Added `emitToShop(shopId, "menu:updated", {})` to every
//     write method (create/update/delete/restore/setActive).
//
// WHY:
//   POS terminals and QR menu pages load the product list
//   once on mount and cache it in React state for the entire
//   session. Without a push notification, a product added
//   from the dashboard is invisible to any open terminal
//   until the page is manually reloaded.
//
//   Every write that can change what appears on a menu now
//   broadcasts "menu:updated" to the shop's Socket.IO room.
//   The POS terminal and QR page listen for this event and
//   call their existing loadMenu() functions — no new state
//   or data structures needed on the frontend.
//
//   Inventory movements are intentionally excluded: changing
//   stock quantities does not add or remove items from the
//   menu (is_sold_out is a separate, explicit field).
// =========================================================

import { ShopRepository }     from "../shop/shop.repository.js";
import { AuditService }       from "../audit/audit.service.js";
import { ProductRepository }  from "./product.repository.js";
import { emitToShop }         from "../socket/socket.js";
import { PaginationParams, buildPaginatedResult } from "../../utils/pagination.js";
import {
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  CreateProductModelInput,
  UpdateProductModelInput,
  CreateProductItemInput,
  UpdateProductItemInput,
  CreateInventoryMovementInput,
  InventoryMovementType,
} from "./product.types.js";
import { appError } from "../../utils/appError.js";

const WRITE_ROLES = ["OWNER", "MANAGER"] as const;
const READ_ROLES  = ["OWNER", "MANAGER", "CASHIER"] as const;

async function assertShopMember(
  shopId: string,
  userId: string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

function enforceQuantitySign(type: InventoryMovementType, qty: number): number {
  const absQty = Math.abs(qty);
  switch (type) {
    case "SALE":
    case "REFUND":     return -absQty;
    case "PURCHASE":
    case "ADJUSTMENT": return  absQty;
  }
}

export class ProductService {

  // =======================================================
  // PRODUCT CATEGORIES
  // =======================================================

  static async createCategory(params: {
    shopId:      string;
    requesterId: string;
    name:        string;
    color?:      string;
    image_url?:  string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const category = await ProductRepository.createCategory({
      shopId:    params.shopId,
      name:      params.name,
      color:     params.color,
      image_url: params.image_url,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PRODUCT_CATEGORY_CREATED",
      entity:   "PRODUCT_CATEGORY",
      entityId: category.id,
      metadata: { name: category.name },
    });

    // Category changes affect how the menu is organised on POS/QR.
    emitToShop(params.shopId, "menu:updated", {});

    return category;
  }

  static async getCategories(shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, READ_ROLES);
    return ProductRepository.findAllCategories(shopId);
  }

  static async updateCategory(params: {
    shopId:      string;
    categoryId:  string;
    requesterId: string;
    input:       UpdateProductCategoryInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const updated = await ProductRepository.updateCategory(
      params.categoryId,
      params.shopId,
      params.input
    );

    if (!updated) throw new appError("CATEGORY_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PRODUCT_CATEGORY_UPDATED",
      entity:   "PRODUCT_CATEGORY",
      entityId: params.categoryId,
      metadata: { updatedFields: Object.keys(params.input) },
    });

    // Category name/colour changes must reflect immediately on terminals.
    emitToShop(params.shopId, "menu:updated", {});

    return updated;
  }

  static async deleteCategory(params: {
    shopId:      string;
    categoryId:  string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const deleted = await ProductRepository.softDeleteCategory(
      params.categoryId,
      params.shopId
    );

    if (!deleted) throw new appError("CATEGORY_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PRODUCT_CATEGORY_DELETED",
      entity:   "PRODUCT_CATEGORY",
      entityId: params.categoryId,
    });

    // Deleted category means affected products fall into "Uncategorised".
    // Terminals must re-render their category tabs.
    emitToShop(params.shopId, "menu:updated", {});

    return { success: true };
  }

  // =======================================================
  // PRODUCT MODELS
  // =======================================================

  static async createModel(params: {
    shopId:       string;
    requesterId:  string;
    name:         string;
    description?: string;
    image_url?:   string;
    category_id?: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const model = await ProductRepository.createModel({
      shopId:      params.shopId,
      name:        params.name,
      description: params.description,
      image_url:   params.image_url,
      category_id: params.category_id,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PRODUCT_MODEL_CREATED",
      entity:   "PRODUCT_MODEL",
      entityId: model.id,
      metadata: { name: model.name },
    });

    // New product must appear on POS and QR immediately.
    emitToShop(params.shopId, "menu:updated", {});

    return model;
  }

 static async getModels(
    shopId: string,
    requesterId: string,
    pagination: PaginationParams,
    search?: string,
    categoryId?: string
  ) {
    await assertShopMember(shopId, requesterId, READ_ROLES);
    const { rows, totalCount } = await ProductRepository.findAllModels(
      shopId, pagination, search, categoryId
    );
    return buildPaginatedResult(rows, totalCount, pagination);
  }

  static async getModelById(shopId: string, modelId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, READ_ROLES);
    const model = await ProductRepository.findModelById(modelId, shopId);
    if (!model) throw new appError("MODEL_NOT_FOUND", 404);
    return model;
  }

  static async updateModel(params: {
    shopId:      string;
    modelId:     string;
    requesterId: string;
    input:       UpdateProductModelInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const updated = await ProductRepository.updateModel(
      params.modelId, params.shopId, params.input
    );

    if (!updated) throw new appError("MODEL_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "PRODUCT_MODEL_UPDATED",
      entity:   "PRODUCT_MODEL",
      entityId: params.modelId,
      metadata: { updatedFields: Object.keys(params.input) },
    });

    // Name, description, category, or image changed — terminals must reflect it.
    emitToShop(params.shopId, "menu:updated", {});

    return updated;
  }

  static async deleteModel(params: { shopId: string; modelId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const deleted = await ProductRepository.softDeleteModel(params.modelId, params.shopId);
    if (!deleted) throw new appError("MODEL_NOT_FOUND", 404);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "PRODUCT_MODEL_DELETED", entity: "PRODUCT_MODEL", entityId: params.modelId,
    });

    // Deleted product must disappear from POS and QR immediately.
    emitToShop(params.shopId, "menu:updated", {});

    return { success: true };
  }

  static async restoreModel(params: { shopId: string; modelId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const restored = await ProductRepository.restoreModel(params.modelId, params.shopId);
    if (!restored) throw new appError("MODEL_NOT_FOUND", 404);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "PRODUCT_MODEL_RESTORED", entity: "PRODUCT_MODEL", entityId: params.modelId,
    });

    // Restored product must reappear on terminals.
    emitToShop(params.shopId, "menu:updated", {});

    return { success: true };
  }

  // =======================================================
  // PRODUCT ITEMS
  // =======================================================

  static async createItem(params: {
    shopId: string; modelId: string; requesterId: string;
    input: Omit<CreateProductItemInput, "productModelId">;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const model = await ProductRepository.findModelById(params.modelId, params.shopId);
    if (!model) throw new appError("MODEL_NOT_FOUND", 404);
    const item = await ProductRepository.createItem({ ...params.input, productModelId: params.modelId });
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "PRODUCT_ITEM_CREATED", entity: "PRODUCT_ITEM", entityId: item.id,
      metadata: { name: item.name, price: item.price },
    });

    // New variant (item) must appear on POS and QR immediately.
    emitToShop(params.shopId, "menu:updated", {});

    return item;
  }

  static async getItems(params: { shopId: string; modelId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, READ_ROLES);
    const model = await ProductRepository.findModelById(params.modelId, params.shopId);
    if (!model) throw new appError("MODEL_NOT_FOUND", 404);
    return ProductRepository.findItemsByModel(params.modelId);
  }

  static async getItemById(params: { shopId: string; itemId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, READ_ROLES);
    const item = await ProductRepository.findItemById(params.itemId, params.shopId);
    if (!item) throw new appError("ITEM_NOT_FOUND", 404);
    return item;
  }

  static async updateItem(params: {
    shopId: string; itemId: string; requesterId: string; input: UpdateProductItemInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const updated = await ProductRepository.updateItem(params.itemId, params.shopId, params.input);
    if (!updated) throw new appError("ITEM_NOT_FOUND", 404);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "PRODUCT_ITEM_UPDATED", entity: "PRODUCT_ITEM", entityId: params.itemId,
      metadata: { updatedFields: Object.keys(params.input) },
    });

    // Price or name change must reflect on open terminals.
    emitToShop(params.shopId, "menu:updated", {});

    return updated;
  }

  static async deleteItem(params: { shopId: string; itemId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const deleted = await ProductRepository.softDeleteItem(params.itemId, params.shopId);
    if (!deleted) throw new appError("ITEM_NOT_FOUND", 404);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "PRODUCT_ITEM_DELETED", entity: "PRODUCT_ITEM", entityId: params.itemId,
    });

    // Deleted variant must vanish from POS and QR immediately.
    emitToShop(params.shopId, "menu:updated", {});

    return { success: true };
  }

  static async setItemActive(params: {
    shopId: string; itemId: string; requesterId: string; isActive: boolean;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const updated = await ProductRepository.setItemActive(params.itemId, params.shopId, params.isActive);
    if (!updated) throw new appError("ITEM_NOT_FOUND", 404);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: params.isActive ? "PRODUCT_ITEM_ACTIVATED" : "PRODUCT_ITEM_DEACTIVATED",
      entity: "PRODUCT_ITEM", entityId: params.itemId,
    });

    // Enabling/disabling a variant changes what the cashier can sell.
    emitToShop(params.shopId, "menu:updated", {});

    return updated;
  }

  // =======================================================
  // INVENTORY MOVEMENTS
  // =======================================================
  //
  // NOTE: No menu:updated emit here.
  // Inventory movements only change stock_qty and is_sold_out
  // is a separate explicit field. Stock quantity changes do
  // not alter what appears on the menu — only is_sold_out
  // (set via setItemActive or a dedicated endpoint) does.
  // =======================================================

  static async recordInventoryMovement(params: {
    shopId: string; itemId: string; requesterId: string;
    type: InventoryMovementType; quantity: number; reference_id?: string; notes?: string;
  }) {
    const member = await ShopRepository.getUserShopMembership(params.shopId, params.requesterId);
    if (!member || !member.is_active) throw new appError("FORBIDDEN", 403);
    const isWriteRole = WRITE_ROLES.includes(member.role as any);
    if ((params.type === "PURCHASE" || params.type === "ADJUSTMENT") && !isWriteRole) {
      throw new appError("FORBIDDEN", 403);
    }
    const signedQty = enforceQuantitySign(params.type, params.quantity);
    const movement = await ProductRepository.createMovementWithStockUpdate({
      shopId: params.shopId, productItemId: params.itemId,
      type: params.type, quantity: signedQty,
      reference_id: params.reference_id, notes: params.notes, createdBy: params.requesterId,
    });
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: `INVENTORY_${params.type}`, entity: "INVENTORY_MOVEMENT", entityId: movement.id,
      metadata: { productItemId: params.itemId, quantity: signedQty, type: params.type },
    });
    return movement;
  }

  static async getInventoryMovements(params: { shopId: string; itemId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, READ_ROLES);
    return ProductRepository.findMovementsByItem(params.itemId, params.shopId);
  }

  // =======================================================
  // MODIFIER LINKING
  // =======================================================

  static async linkModifierGroup(params: {
    shopId: string; modelId: string; groupId: string; requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const model = await ProductRepository.findModelById(params.modelId, params.shopId);
    if (!model) throw new appError("MODEL_NOT_FOUND", 404);
    await ProductRepository.linkModifierGroup(params.modelId, params.groupId);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "MODIFIER_GROUP_LINKED", entity: "PRODUCT_MODEL", entityId: params.modelId,
      metadata: { groupId: params.groupId },
    });

    // Modifier added — customisation sheet on POS/QR must show it.
    emitToShop(params.shopId, "menu:updated", {});

    return { success: true };
  }

  static async getLinkedModifierGroups(params: {
    shopId: string; modelId: string; requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, READ_ROLES);
    const model = await ProductRepository.findModelById(params.modelId, params.shopId);
    if (!model) throw new appError("MODEL_NOT_FOUND", 404);
    return ProductRepository.findLinkedModifierGroups(params.modelId);
  }

  static async unlinkModifierGroup(params: {
    shopId: string; modelId: string; groupId: string; requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const unlinked = await ProductRepository.unlinkModifierGroup(params.modelId, params.groupId);
    if (!unlinked) throw new appError("LINK_NOT_FOUND", 404);
    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "MODIFIER_GROUP_UNLINKED", entity: "PRODUCT_MODEL", entityId: params.modelId,
      metadata: { groupId: params.groupId },
    });

    // Modifier removed — customisation sheet on POS/QR must hide it.
    emitToShop(params.shopId, "menu:updated", {});

    return { success: true };
  }
}