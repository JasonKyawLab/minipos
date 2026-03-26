// =========================================================
// table.service.ts
// Path: backend/src/modules/table/table.service.ts
// =========================================================
// Business logic + permission checks.
// Pattern is identical to product.service.ts — consistent
// by design so any reader can navigate the codebase quickly.
// =========================================================

import { ShopRepository }  from "../shop/shop.repository.js";
import { AuditService }    from "../audit/audit.service.js";
import { TableRepository } from "./table.repository.js";
import { CreateTableInput, UpdateTableInput } from "./table.types.js";
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
}

export class TableService {

  static async createTable(params: {
    shopId: string;
    requesterId: string;
    tableNumber: string;
    capacity?: number;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    // Duplicate table number check — DB has UNIQUE(shop_id, table_number)
    // but checking here gives a cleaner error message than a DB constraint error
    const exists = await TableRepository.tableNumberExists(
      params.shopId,
      params.tableNumber
    );
    if (exists) throw new appError("TABLE_NUMBER_ALREADY_EXISTS", 409);

    const table = await TableRepository.createTable({
      shopId:      params.shopId,
      tableNumber: params.tableNumber,
      capacity:    params.capacity,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "TABLE_CREATED",
      entity:   "TABLE",
      entityId: table.id,
      metadata: { table_number: table.table_number },
    });

    return table;
  }

  static async getTables(shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, READ_ROLES);
    return TableRepository.findAllTables(shopId);
  }

  static async getTableById(
    shopId: string,
    tableId: string,
    requesterId: string
  ) {
    await assertShopMember(shopId, requesterId, READ_ROLES);

    const table = await TableRepository.findTableById(tableId, shopId);
    if (!table) throw new appError("TABLE_NOT_FOUND", 404);

    return table;
  }

  static async updateTable(params: {
    shopId: string;
    tableId: string;
    requesterId: string;
    input: UpdateTableInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    // If renaming, check new number isn't taken
    if (params.input.tableNumber) {
      const exists = await TableRepository.tableNumberExists(
        params.shopId,
        params.input.tableNumber,
        params.tableId   // exclude current table from check
      );
      if (exists) throw new appError("TABLE_NUMBER_ALREADY_EXISTS", 409);
    }

    const updated = await TableRepository.updateTable(
      params.tableId,
      params.shopId,
      params.input
    );
    if (!updated) throw new appError("TABLE_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "TABLE_UPDATED",
      entity:   "TABLE",
      entityId: params.tableId,
      metadata: { updatedFields: Object.keys(params.input) },
    });

    return updated;
  }

  static async rotateQrToken(params: {
    shopId: string;
    tableId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const updated = await TableRepository.rotateQrToken(
      params.tableId,
      params.shopId
    );
    if (!updated) throw new appError("TABLE_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "TABLE_QR_ROTATED",
      entity:   "TABLE",
      entityId: params.tableId,
    });

    return updated;
  }

  // Used by QR scan flow — no auth required (public endpoint)
  // Returns minimal table info so customer can start a QR order
  static async getTableByQrToken(qrToken: string) {
    const table = await TableRepository.findTableByQrToken(qrToken);
    if (!table) throw new appError("TABLE_NOT_FOUND", 404);

    return {
      id:           table.id,
      shop_id:      table.shop_id,
      table_number: table.table_number,
    };
  }
}