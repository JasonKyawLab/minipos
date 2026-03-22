// =========================================================
// modifier.controller.ts
// Path: backend/src/modules/modifier/modifier.controller.ts
// =========================================================

import { Request, Response } from "express";
import { ModifierService } from "./modifier.service.js";
import { getParamAsString } from "../../utils/converter.js";

export class ModifierController {

  // =======================================================
  // MODIFIER GROUPS
  // =======================================================

  static async createGroup(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const group = await ModifierService.createGroup({
        shopId, requesterId, input: req.body,
      });
      return res.status(201).json(group);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getGroups(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const groups = await ModifierService.getGroups(shopId, requesterId);
      return res.json(groups);
    } catch (err: any) { return handleError(res, err); }
  }

  static async updateGroup(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   "shopId");
      const groupId     = getParamAsString(req.params.groupId,  "groupId");
      const requesterId = req.user!.id;

      const updated = await ModifierService.updateGroup({
        shopId, groupId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err: any) { return handleError(res, err); }
  }

  static async deleteGroup(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const groupId     = getParamAsString(req.params.groupId, "groupId");
      const requesterId = req.user!.id;

      const result = await ModifierService.deleteGroup({
        shopId, groupId, requesterId,
      });
      return res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  static async restoreGroup(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const groupId     = getParamAsString(req.params.groupId, "groupId");
      const requesterId = req.user!.id;

      const result = await ModifierService.restoreGroup({
        shopId, groupId, requesterId,
      });
      return res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }

  // =======================================================
  // MODIFIER OPTIONS
  // =======================================================

  static async createOption(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const groupId     = getParamAsString(req.params.groupId, "groupId");
      const requesterId = req.user!.id;

      const option = await ModifierService.createOption({
        shopId, groupId, requesterId, input: req.body,
      });
      return res.status(201).json(option);
    } catch (err: any) { return handleError(res, err); }
  }

  static async getOptions(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const groupId     = getParamAsString(req.params.groupId, "groupId");
      const requesterId = req.user!.id;

      const options = await ModifierService.getOptions({
        shopId, groupId, requesterId,
      });
      return res.json(options);
    } catch (err: any) { return handleError(res, err); }
  }

  static async updateOption(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,    "shopId");
      const optionId    = getParamAsString(req.params.optionId,  "optionId");
      const requesterId = req.user!.id;

      const updated = await ModifierService.updateOption({
        shopId, optionId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err: any) { return handleError(res, err); }
  }

  static async deleteOption(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   "shopId");
      const optionId    = getParamAsString(req.params.optionId, "optionId");
      const requesterId = req.user!.id;

      const result = await ModifierService.deleteOption({
        shopId, optionId, requesterId,
      });
      return res.json(result);
    } catch (err: any) { return handleError(res, err); }
  }
}

// ── Shared error handler ──────────────────────────────────
function handleError(res: Response, err: any) {
  const map: Record<string, number> = {
    FORBIDDEN:        403,
    GROUP_NOT_FOUND:  404,
    OPTION_NOT_FOUND: 404,
    MIN_EXCEEDS_MAX:  400,
  };

  const status = map[err.message] ?? 500;

  if (status === 500) {
    console.error("[ModifierController]", err);
    return res.status(500).json({ message: "Internal server error" });
  }

  return res.status(status).json({ message: err.message });
}