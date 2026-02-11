import { AuditRepository } from "./audit.repository.js";
import { AuditLogInput } from "./audit.types.js";

export class AuditService {
  static async log(data: AuditLogInput) {
    try {
      await AuditRepository.create(data);
    } catch (error) {
      console.error("Audit log failed:", error);
    }
  }
}