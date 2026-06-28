// =========================================================
// product.controller.ts
// Path: backend/src/modules/product/product.controller.ts
//
// CHANGES: Added category CRUD handlers.
//          Updated createModel to pass category_id.
// =========================================================

import { Request, Response }  from "express";
import { ProductService }     from "./product.service.js";
import { getParamAsString }   from "../../utils/converter.js";
import { handleError }        from "../../utils/handleError.js";
import { parsePaginationParams } from "../../utils/pagination.js";

export class ProductController {

  // =======================================================
  // PRODUCT CATEGORIES
  // =======================================================

  static async createCategory(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { name, color, image_url } = req.body;

      const category = await ProductService.createCategory({
        shopId, requesterId, name, color, image_url,
      });
      return res.status(201).json(category);
    } catch (err) { return handleError(res, err); }
  }

  static async getCategories(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const categories = await ProductService.getCategories(shopId, requesterId);
      return res.json(categories);
    } catch (err) { return handleError(res, err); }
  }

  static async updateCategory(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const categoryId  = getParamAsString(req.params.categoryId, "categoryId");
      const requesterId = req.user!.id;

      const updated = await ProductService.updateCategory({
        shopId, categoryId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async deleteCategory(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const categoryId  = getParamAsString(req.params.categoryId, "categoryId");
      const requesterId = req.user!.id;

      const result = await ProductService.deleteCategory({ shopId, categoryId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // =======================================================
  // PRODUCT MODELS
  // =======================================================

  static async createModel(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { name, description, image_url, category_id } = req.body;

      const model = await ProductService.createModel({
        shopId, requesterId, name, description, image_url, category_id,
      });
      return res.status(201).json(model);
    } catch (err) { return handleError(res, err); }
  }

  static async getModels(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const pagination  = parsePaginationParams(req);
      const search       = req.query.search as string | undefined;
      const categoryId    = req.query.categoryId as string | undefined;

      const result = await ProductService.getModels(
        shopId, requesterId, pagination, search, categoryId
      );
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async getModelById(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const model = await ProductService.getModelById(shopId, modelId, requesterId);
      return res.json(model);
    } catch (err) { return handleError(res, err); }
  }

  static async updateModel(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const updated = await ProductService.updateModel({
        shopId, modelId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async deleteModel(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const result = await ProductService.deleteModel({ shopId, modelId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async restoreModel(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const result = await ProductService.restoreModel({ shopId, modelId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // =======================================================
  // PRODUCT ITEMS
  // =======================================================

  static async createItem(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const item = await ProductService.createItem({ shopId, modelId, requesterId, input: req.body });
      return res.status(201).json(item);
    } catch (err) { return handleError(res, err); }
  }

  static async getItems(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const items = await ProductService.getItems({ shopId, modelId, requesterId });
      return res.json(items);
    } catch (err) { return handleError(res, err); }
  }

  static async getItemById(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const itemId      = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const item = await ProductService.getItemById({ shopId, itemId, requesterId });
      return res.json(item);
    } catch (err) { return handleError(res, err); }
  }

  static async updateItem(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const itemId      = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const updated = await ProductService.updateItem({ shopId, itemId, requesterId, input: req.body });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async deleteItem(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const itemId      = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const result = await ProductService.deleteItem({ shopId, itemId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async setItemActive(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const itemId      = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;
      const { is_active } = req.body;

      if (typeof is_active !== "boolean") {
        return res.status(400).json({ message: "is_active must be a boolean" });
      }

      const updated = await ProductService.setItemActive({ shopId, itemId, requesterId, isActive: is_active });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  // =======================================================
  // INVENTORY MOVEMENTS
  // =======================================================

  static async recordInventory(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const itemId      = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;
      const { type, quantity, reference_id, notes } = req.body;

      const movement = await ProductService.recordInventoryMovement({
        shopId, itemId, requesterId, type, quantity, reference_id, notes,
      });
      return res.status(201).json(movement);
    } catch (err) { return handleError(res, err); }
  }

  static async getInventory(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const itemId      = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const movements = await ProductService.getInventoryMovements({ shopId, itemId, requesterId });
      return res.json(movements);
    } catch (err) { return handleError(res, err); }
  }

  // =======================================================
  // MODIFIER LINKING
  // =======================================================

  static async linkModifierGroup(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;
      const { groupId } = req.body;

      if (!groupId) return res.status(400).json({ message: "groupId is required" });

      const result = await ProductService.linkModifierGroup({ shopId, modelId, groupId, requesterId });
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async getLinkedModifierGroups(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const groups = await ProductService.getLinkedModifierGroups({ shopId, modelId, requesterId });
      return res.json(groups);
    } catch (err) { return handleError(res, err); }
  }

  static async unlinkModifierGroup(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const modelId     = getParamAsString(req.params.modelId, "modelId");
      const groupId     = getParamAsString(req.params.groupId, "groupId");
      const requesterId = req.user!.id;

      const result = await ProductService.unlinkModifierGroup({ shopId, modelId, groupId, requesterId });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }
}