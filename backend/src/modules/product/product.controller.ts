// =========================================================
// product.controller.ts
// Path: backend/src/modules/product/product.controller.ts
// Line: Replace handleError function
// =========================================================

import { Request, Response } from "express";
import { ProductService } from "./product.service.js";
import { getParamAsString } from "../../utils/converter.js";
import { handleError } from "../../utils/handleError.js";

export class ProductController {

  // =======================================================
  // PRODUCT MODELS
  // =======================================================

  static async createModel(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { name, description, image_url } = req.body;

      const model = await ProductService.createModel({
        shopId, requesterId, name, description, image_url,
      });
      return res.status(201).json(model);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getModels(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const models = await ProductService.getModels(shopId, requesterId);
      return res.json(models);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getModelById(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const model = await ProductService.getModelById(shopId, modelId, requesterId);
      return res.json(model);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async updateModel(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const updated = await ProductService.updateModel({
        shopId, modelId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async deleteModel(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const result = await ProductService.deleteModel({ shopId, modelId, requesterId });
      return res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async restoreModel(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const result = await ProductService.restoreModel({ shopId, modelId, requesterId });
      return res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  // =======================================================
  // PRODUCT ITEMS
  // =======================================================

  static async createItem(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const item = await ProductService.createItem({
        shopId, modelId, requesterId, input: req.body,
      });
      return res.status(201).json(item);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getItems(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const items = await ProductService.getItems({ shopId, modelId, requesterId });
      return res.json(items);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getItemById(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const itemId = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const item = await ProductService.getItemById({ shopId, itemId, requesterId });
      return res.json(item);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async updateItem(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const itemId = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const updated = await ProductService.updateItem({
        shopId, itemId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async deleteItem(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const itemId = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const result = await ProductService.deleteItem({ shopId, itemId, requesterId });
      return res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async setItemActive(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const itemId = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;
      const { is_active } = req.body;

      if (typeof is_active !== "boolean") {
        return res.status(400).json({ message: "is_active must be a boolean" });
      }

      const updated = await ProductService.setItemActive({
        shopId, itemId, requesterId, isActive: is_active,
      });
      return res.json(updated);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  // =======================================================
  // INVENTORY MOVEMENTS
  // =======================================================

  static async recordInventory(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const itemId = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;
      const { type, quantity, reference_id, notes } = req.body;

      const movement = await ProductService.recordInventoryMovement({
        shopId, itemId, requesterId, type, quantity, reference_id, notes,
      });
      return res.status(201).json(movement);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getInventory(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const itemId = getParamAsString(req.params.itemId, "itemId");
      const requesterId = req.user!.id;

      const movements = await ProductService.getInventoryMovements({
        shopId, itemId, requesterId,
      });
      return res.json(movements);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  // =======================================================
  // MODIFIER LINKING
  // =======================================================

  static async linkModifierGroup(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;
      const { groupId } = req.body;

      if (!groupId) {
        return res.status(400).json({ message: "groupId is required" });
      }

      const result = await ProductService.linkModifierGroup({
        shopId, modelId, groupId, requesterId,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async getLinkedModifierGroups(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const requesterId = req.user!.id;

      const groups = await ProductService.getLinkedModifierGroups({
        shopId, modelId, requesterId,
      });
      return res.json(groups);
    } catch (err: any) {
      return handleError(res, err);
    }
  }

  static async unlinkModifierGroup(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, "shopId");
      const modelId = getParamAsString(req.params.modelId, "modelId");
      const groupId = getParamAsString(req.params.groupId, "groupId");
      const requesterId = req.user!.id;

      const result = await ProductService.unlinkModifierGroup({
        shopId, modelId, groupId, requesterId,
      });
      return res.json(result);
    } catch (err: any) {
      return handleError(res, err);
    }
  }
}