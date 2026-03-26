// =========================================================
// table.schema.ts
// Path: backend/src/modules/table/table.schema.ts
// =========================================================

import { z } from "zod";

export const createTableSchema = z.object({
  table_number: z.string().min(1).max(20),
  capacity:     z.number().int().positive().optional(),
});

export const updateTableSchema = z.object({
  table_number: z.string().min(1).max(20).optional(),
  capacity:     z.number().int().positive().optional(),
  is_active:    z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);