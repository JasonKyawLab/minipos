// =========================================================
// device.schema.ts
// Path: src/modules/device/device.schema.ts
// =========================================================

import { z } from 'zod';

// Tablet sends this when it first boots and hits /register.
// device_key must be a UUID — the tablet generates this on
// first install and stores it permanently in local storage.
export const registerDeviceSchema = z.object({
  device_key:  z.string().uuid('device_key must be a valid UUID'),
  device_name: z.string().min(1).max(100).optional(),
});

export const renameDeviceSchema = z.object({
  device_name: z.string().min(1).max(100),
});