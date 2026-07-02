import { Request, Response } from "express";
import { ModifierService } from "./modifier.service.js";
import { getParamAsString } from "../../utils/converter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export class ModifierController {

  // =======================================================
  // MODIFIER GROUPS
  // =======================================================

  static createGroup = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const group = await ModifierService.createGroup({
      shopId, requesterId, input: req.body,
    });
    res.status(201).json(group);
  });

  static getGroups = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const groups = await ModifierService.getGroups(shopId, requesterId);
    res.json(groups);
  });

  static updateGroup = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const groupId = getParamAsString(req.params.groupId, "groupId");
    const requesterId = req.user!.id;

    const updated = await ModifierService.updateGroup({
      shopId, groupId, requesterId, input: req.body,
    });
    res.json(updated);
  });

  static deleteGroup = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const groupId = getParamAsString(req.params.groupId, "groupId");
    const requesterId = req.user!.id;

    const result = await ModifierService.deleteGroup({
      shopId, groupId, requesterId,
    });
    res.json(result);
  });

  static restoreGroup = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const groupId = getParamAsString(req.params.groupId, "groupId");
    const requesterId = req.user!.id;

    const result = await ModifierService.restoreGroup({
      shopId, groupId, requesterId,
    });
    res.json(result);
  });

  // =======================================================
  // MODIFIER OPTIONS
  // =======================================================

  static createOption = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const groupId = getParamAsString(req.params.groupId, "groupId");
    const requesterId = req.user!.id;

    const option = await ModifierService.createOption({
      shopId, groupId, requesterId, input: req.body,
    });
    res.status(201).json(option);
  });

  static getOptions = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const groupId = getParamAsString(req.params.groupId, "groupId");
    const requesterId = req.user!.id;

    const options = await ModifierService.getOptions({
      shopId, groupId, requesterId,
    });
    res.json(options);
  });

  static updateOption = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const optionId = getParamAsString(req.params.optionId, "optionId");
    const requesterId = req.user!.id;

    const updated = await ModifierService.updateOption({
      shopId, optionId, requesterId, input: req.body,
    });
    res.json(updated);
  });

  static deleteOption = asyncHandler(async (req: Request, res: Response) => {
    const shopId = getParamAsString(req.params.shopId, "shopId");
    const optionId = getParamAsString(req.params.optionId, "optionId");
    const requesterId = req.user!.id;

    const result = await ModifierService.deleteOption({
      shopId, optionId, requesterId,
    });
    res.json(result);
  });
}