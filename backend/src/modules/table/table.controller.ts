// =========================================================
// table.controller.ts
// Path: backend/src/modules/table/table.controller.ts
// =========================================================

import { Request, Response } from "express";
import { TableService }      from "./table.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { handleError }       from "../../utils/handleError.js";

export class TableController {

  static async createTable(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;
      const { table_number, capacity } = req.body;

      const table = await TableService.createTable({
        shopId,
        requesterId,
        tableNumber: table_number,
        capacity,
      });
      return res.status(201).json(table);
    } catch (err) { return handleError(res, err); }
  }

  static async getTables(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, "shopId");
      const requesterId = req.user!.id;

      const tables = await TableService.getTables(shopId, requesterId);
      return res.json(tables);
    } catch (err) { return handleError(res, err); }
  }

  static async getTableById(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   "shopId");
      const tableId     = getParamAsString(req.params.tableId,  "tableId");
      const requesterId = req.user!.id;

      const table = await TableService.getTableById(shopId, tableId, requesterId);
      return res.json(table);
    } catch (err) { return handleError(res, err); }
  }

  static async updateTable(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const tableId     = getParamAsString(req.params.tableId, "tableId");
      const requesterId = req.user!.id;
      const { table_number, capacity, is_active } = req.body;

      const updated = await TableService.updateTable({
        shopId,
        tableId,
        requesterId,
        input: {
          tableNumber: table_number,
          capacity,
          isActive:    is_active,
        },
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async rotateQrToken(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,  "shopId");
      const tableId     = getParamAsString(req.params.tableId, "tableId");
      const requesterId = req.user!.id;

      const updated = await TableService.rotateQrToken({
        shopId, tableId, requesterId,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  // Public endpoint — no auth — for QR scan landing page
static async getByQrToken(req: Request, res: Response) {
  try {
    const token = getParamAsString(req.params.token, "token");

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!token || !uuidRegex.test(token)) {
      return res.status(400).json({ message: "INVALID_QR_TOKEN" });
    }

    const table = await TableService.getTableByQrToken(token);
    return res.json(table);
  } catch (err) { return handleError(res, err); }
}
}