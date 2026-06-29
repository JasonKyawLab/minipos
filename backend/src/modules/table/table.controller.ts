import { Request, Response } from "express";
import { TableService }      from "./table.service.js";
import { getParamAsString }  from "../../utils/converter.js";
import { asyncHandler }      from "../../utils/asyncHandler.js";

export class TableController {

  static createTable = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;
    const { table_number, capacity } = req.body;

    const table = await TableService.createTable({
      shopId,
      requesterId,
      tableNumber: table_number,
      capacity,
    });
    res.status(201).json(table);
  });

  static getTables = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, "shopId");
    const requesterId = req.user!.id;

    const tables = await TableService.getTables(shopId, requesterId);
    res.json(tables);
  });

  static getTableById = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,  "shopId");
    const tableId     = getParamAsString(req.params.tableId, "tableId");
    const requesterId = req.user!.id;

    const table = await TableService.getTableById(shopId, tableId, requesterId);
    res.json(table);
  });

  static updateTable = asyncHandler(async (req: Request, res: Response) => {
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
    res.json(updated);
  });

  static rotateQrToken = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,  "shopId");
    const tableId     = getParamAsString(req.params.tableId, "tableId");
    const requesterId = req.user!.id;

    const updated = await TableService.rotateQrToken({
      shopId, tableId, requesterId,
    });
    res.json(updated);
  });

  // Public endpoint — no auth — for QR scan landing page
  static getByQrToken = asyncHandler(async (req: Request, res: Response) => {
    const token = getParamAsString(req.params.token, "token");

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!token || !uuidRegex.test(token)) {
      return res.status(400).json({ message: "INVALID_QR_TOKEN" });
    }

    const table = await TableService.getTableByQrToken(token);
    res.json(table);
  });
}