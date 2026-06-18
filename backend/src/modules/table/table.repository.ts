// =========================================================
// table.repository.ts
// Path: backend/src/modules/table/table.repository.ts
// =========================================================
// Raw SQL only. No business logic here.
// QR token is generated with crypto.randomUUID() — no external
// dependency, available natively in Node 14.17+.
// =========================================================

import { pool } from "../../db/pool.js";
import { RestaurantTable, CreateTableInput, UpdateTableInput } from "./table.types.js";
import { randomUUID } from "crypto";

export class TableRepository {

  static async createTable(input: CreateTableInput): Promise<RestaurantTable> {
    const result = await pool.query<RestaurantTable>(
      `
      INSERT INTO restaurant_tables (shop_id, table_number, capacity, qr_token)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        input.shopId,
        input.tableNumber,
        input.capacity ?? null,
        randomUUID(),   // QR token — rotated via rotate-qr endpoint
      ]
    );
    return result.rows[0];
  }

  static async findAllTables(shopId: string): Promise<RestaurantTable[]> {
    const result = await pool.query<RestaurantTable>(
      `
      SELECT *
      FROM restaurant_tables
      WHERE shop_id = $1
      ORDER BY table_number ASC
      `,
      [shopId]
    );
    return result.rows;
  }

  static async findTableById(
    tableId: string,
    shopId: string
  ): Promise<RestaurantTable | null> {
    const result = await pool.query<RestaurantTable>(
      `
      SELECT *
      FROM restaurant_tables
      WHERE id = $1 AND shop_id = $2
      `,
      [tableId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async findTableByQrToken(qrToken: string): Promise<RestaurantTable | null> {
    const result = await pool.query<RestaurantTable>(
      `
      SELECT *
      FROM restaurant_tables
      WHERE qr_token = $1 AND is_active = true
      `,
      [qrToken]
    );
    return result.rows[0] ?? null;
  }

static async updateTable(
  tableId: string,
  shopId: string,
  input: UpdateTableInput
): Promise<RestaurantTable | null> {
  // WHY: COALESCE($n, column) cannot distinguish between
  // "caller wants NULL" vs "caller didn't send this field".
  // For table_number and is_active, NULL always means "no change" —
  // that's fine. For capacity, the user must be able to CLEAR it
  // (set to NULL). So we build the SET clause dynamically:
  // only include capacity in the SET if the key was explicitly
  // provided in the input object.
  const setClauses: string[] = [
    `table_number = COALESCE($3, table_number)`,
    `is_active    = COALESCE($4, is_active)`,
  ];
  const values: unknown[] = [
    tableId,
    shopId,
    input.tableNumber ?? null,
    input.isActive    ?? null,
  ];

  if ("capacity" in input) {
    // Caller explicitly provided capacity (even if null = clear it)
    values.push(input.capacity ?? null);
    setClauses.push(`capacity = $${values.length}`);
  }

  const result = await pool.query<RestaurantTable>(
    `UPDATE restaurant_tables
     SET ${setClauses.join(", ")}
     WHERE id = $1 AND shop_id = $2
     RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

  // Rotate QR token — called when a table's QR code is compromised
  // or on a regular rotation schedule. Generates a fresh UUID.
  static async rotateQrToken(
    tableId: string,
    shopId: string
  ): Promise<RestaurantTable | null> {
    const result = await pool.query<RestaurantTable>(
      `
      UPDATE restaurant_tables
      SET qr_token = $3
      WHERE id = $1 AND shop_id = $2
      RETURNING *
      `,
      [tableId, shopId, randomUUID()]
    );
    return result.rows[0] ?? null;
  }

  // Check if table_number is already taken within this shop
  static async tableNumberExists(
    shopId: string,
    tableNumber: string,
    excludeId?: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      SELECT 1
      FROM restaurant_tables
      WHERE shop_id      = $1
        AND table_number = $2
        AND ($3::uuid IS NULL OR id != $3)
      `,
      [shopId, tableNumber, excludeId ?? null]
    );
    return (result.rowCount ?? 0) > 0;
  }
}