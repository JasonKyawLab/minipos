import { Request, Response }  from "express";
import { ProductService }     from "./product.service.js";
import { ProductRepository }  from "./product.repository.js";
import { getParamAsString }   from "../../utils/converter.js";
import { asyncHandler }       from "../../utils/asyncHandler.js";
import { parsePaginationParams } from "../../utils/pagination.js";

export class ProductController {

  // =======================================================
  // PRODUCT CATEGORIES
  // =======================================================

  static createCategory = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const { name, color, image_url } = req.body;

    const category = await ProductService.createCategory({
      shopId, requesterId, name, color, image_url,
    });
    res.status(201).json(category);
  });

  static getCategories = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const categories = await ProductService.getCategories(shopId, requesterId);
    res.json(categories);
  });

  static updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const categoryId  = getParamAsString(req.params.categoryId, "categoryId");
    const requesterId = req.user!.id;

    const updated = await ProductService.updateCategory({
      shopId, categoryId, requesterId, input: req.body,
    });
    res.json(updated);
  });

  static deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const categoryId  = getParamAsString(req.params.categoryId, "categoryId");
    const requesterId = req.user!.id;

    const result = await ProductService.deleteCategory({ shopId, categoryId, requesterId });
    res.json(result);
  });

  // =======================================================
  // PRODUCT MODELS
  // =======================================================

  static createModel = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const { name, description, image_url, category_id } = req.body;

    const model = await ProductService.createModel({
      shopId, requesterId, name, description, image_url, category_id,
    });
    res.status(201).json(model);
  });

  static checkModelName = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const name        = req.query.name as string;
    const excludeId   = req.query.excludeId as string | undefined;
    const exists = await ProductRepository.nameExistsInShop(shopId, name, excludeId);
    res.json({ exists });
  });

  static getModels = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const pagination  = parsePaginationParams(req);
    const search       = req.query.search as string | undefined;
    const categoryId    = req.query.categoryId as string | undefined;

    const result = await ProductService.getModels(
      shopId, requesterId, pagination, search, categoryId
    );
    res.json(result);
  });

  static getModelById = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const model = await ProductService.getModelById(shopId, modelId, requesterId);
    res.json(model);
  });

  static updateModel = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const updated = await ProductService.updateModel({
      shopId, modelId, requesterId, input: req.body,
    });
    res.json(updated);
  });

  static deleteModel = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const result = await ProductService.deleteModel({ shopId, modelId, requesterId });
    res.json(result);
  });

  static restoreModel = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const result = await ProductService.restoreModel({ shopId, modelId, requesterId });
    res.json(result);
  });

  // =======================================================
  // PRODUCT ITEMS
  // =======================================================

  static createItem = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const item = await ProductService.createItem({ shopId, modelId, requesterId, input: req.body });
    res.status(201).json(item);
  });

  static getItems = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const items = await ProductService.getItems({ shopId, modelId, requesterId });
    res.json(items);
  });

  static getItemById = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const itemId      = getParamAsString(req.params.itemId, "itemId");
    const requesterId = req.user!.id;

    const item = await ProductService.getItemById({ shopId, itemId, requesterId });
    res.json(item);
  });

  static updateItem = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const itemId      = getParamAsString(req.params.itemId, "itemId");
    const requesterId = req.user!.id;

    const updated = await ProductService.updateItem({ shopId, itemId, requesterId, input: req.body });
    res.json(updated);
  });

  static deleteItem = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const itemId      = getParamAsString(req.params.itemId, "itemId");
    const requesterId = req.user!.id;

    const result = await ProductService.deleteItem({ shopId, itemId, requesterId });
    res.json(result);
  });

  static setItemActive = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const itemId      = getParamAsString(req.params.itemId, "itemId");
    const requesterId = req.user!.id;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active must be a boolean" });
    }

    const updated = await ProductService.setItemActive({ shopId, itemId, requesterId, isActive: is_active });
    res.json(updated);
  });

  // =======================================================
  // INVENTORY MOVEMENTS
  // =======================================================

  static recordInventory = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const itemId      = getParamAsString(req.params.itemId, "itemId");
    const requesterId = req.user!.id;
    const { type, quantity, reference_id, notes } = req.body;

    const movement = await ProductService.recordInventoryMovement({
      shopId, itemId, requesterId, type, quantity, reference_id, notes,
    });
    res.status(201).json(movement);
  });

  static getInventory = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const itemId      = getParamAsString(req.params.itemId, "itemId");
    const requesterId = req.user!.id;

    const movements = await ProductService.getInventoryMovements({ shopId, itemId, requesterId });
    res.json(movements);
  });

  // =======================================================
  // MODIFIER LINKING
  // =======================================================

  static linkModifierGroup = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;
    const { groupId } = req.body;

    if (!groupId) return res.status(400).json({ message: "groupId is required" });

    const result = await ProductService.linkModifierGroup({ shopId, modelId, groupId, requesterId });
    res.status(201).json(result);
  });

  static getLinkedModifierGroups = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const requesterId = req.user!.id;

    const groups = await ProductService.getLinkedModifierGroups({ shopId, modelId, requesterId });
    res.json(groups);
  });

  static unlinkModifierGroup = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const modelId     = getParamAsString(req.params.modelId, "modelId");
    const groupId     = getParamAsString(req.params.groupId, "groupId");
    const requesterId = req.user!.id;

    const result = await ProductService.unlinkModifierGroup({ shopId, modelId, groupId, requesterId });
    res.json(result);
  });
}