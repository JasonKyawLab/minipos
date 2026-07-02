import { db } from "../../db/queries.js";
import { AuditLogInput } from "./audit.types.js";

export class AuditRepository {
  static async create(data: AuditLogInput) {
    await db.query(
      `
      INSERT INTO audit_logs
      (shop_id, user_id, action, entity, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        data.shopId ?? null,
        data.userId ?? null,
        data.action,
        data.entity,
        data.entityId ?? null,
        data.metadata ?? null,
      ]
    );
  }
}